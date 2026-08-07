// オンライン対戦「ルーム」機能（最大8人・対戦枠2つ・観戦・チャット）。
// js/network.jsの1対1オンライン対戦と同じく自前のサーバーを持たず、部屋を作った人のブラウザ（Peer）が
// 幹事役として全員のメッセージ（メンバー一覧・対戦枠の状態・チャット）を中継する。
// 対戦本体の通信（実際の試合のゲーム進行）はjs/network.jsのNetworkSessionをそのまま再利用し、
// 対戦・観戦が成立したメンバー同士が、部屋コネクションとは別に直接WebRTC接続を追加で張ることで実現する
// （部屋の幹事は対戦データそのものを中継しない）。
// 既知の制約: 部屋作成者がタブを閉じる／回線が切れると部屋全体が終了する（バックエンドサーバーを
// 持たないための受け入れ済みトレードオフ）。進行中の対戦・観戦は部屋作成者を経由しないため、
// 部屋作成者が抜けても既に成立している対戦自体はそのまま続行できる。
import { NetworkSession } from "./network.js";

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(0/O, 1/I)を除いた文字集合
const ROOM_ID_PREFIX = "kogafighter-room-"; // 単体の1対1オンライン対戦（"kogafighter-"）とは別の名前空間にする
export const MAX_MEMBERS = 8;
export const SLOT_COUNT = 2;

function generateRoomCode(length = 4) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function createEmptySlots() {
  return Array.from({ length: SLOT_COUNT }, () => ({ status: "empty", memberIds: [], hostMemberId: null }));
}

// 部屋のメンバー一覧・対戦枠の状態のうち、配信用に外部へ渡してよい形（生のDataConnection等を含まない）
function publicMember(member) {
  return { id: member.id, name: member.name, isHost: member.isHost, slot: member.slot, spectating: member.spectating };
}

function publicSlots(slots) {
  return slots.map((slot) => ({ status: slot.status, memberIds: slot.memberIds.slice(), hostMemberId: slot.hostMemberId }));
}

// 自分のPeerに届いた対戦・観戦用の着信コネクションを振り分ける共通処理。
// 部屋作成者（RoomHost）・一般メンバー（RoomMember）のどちらが対戦ホストになった場合でも、
// このPeer.on('connection')ハンドラの中身は全く同じなのでここに一本化する。
// matchSessions: slotIndex -> NetworkSessionのMap（呼び出し元インスタンスが持つ）
// onMatchSessionReady(session, slotIndex, role): 自分が対戦ホストとして接続を受け付け終えたときに呼ばれる
function acceptMatchOrSpectateConnection(peer, conn, matchSessions, onMatchSessionReady) {
  const purpose = conn.metadata?.purpose;
  const slotIndex = conn.metadata?.slotIndex;
  if (purpose === "match") {
    const session = new NetworkSession();
    session.onConnected = () => {
      matchSessions.set(slotIndex, session);
      onMatchSessionReady(session, slotIndex, "host");
    };
    session.attachToConnection(peer, conn, "host", { ownsPeer: false });
  } else if (purpose === "spectate") {
    const session = matchSessions.get(slotIndex);
    if (!session) {
      conn.close(); // 対戦が既に終わっている等、観戦先が見つからない場合は何もせず閉じる
      return;
    }
    session.addSpectator(conn);
  }
}

// 対戦枠に後から入った側が、対戦ホストへ直接接続する
function connectAsMatchJoiner(peer, slotIndex, opponentPeerId, matchSessions, onMatchSessionReady) {
  const conn = peer.connect(opponentPeerId, { metadata: { purpose: "match", slotIndex }, reliable: false });
  const session = new NetworkSession();
  session.onConnected = () => {
    matchSessions.set(slotIndex, session);
    onMatchSessionReady(session, slotIndex, "joiner");
  };
  session.attachToConnection(peer, conn, "joiner", { ownsPeer: false });
}

// 観戦者が対戦ホストへ直接接続する
function connectAsSpectator(peer, slotIndex, matchHostPeerId, onMatchSessionReady) {
  const conn = peer.connect(matchHostPeerId, { metadata: { purpose: "spectate", slotIndex }, reliable: false });
  const session = new NetworkSession();
  session.onConnected = () => {
    onMatchSessionReady(session, slotIndex, "spectator");
  };
  session.attachToConnection(peer, conn, "spectator", { ownsPeer: false });
}

// 部屋を作った側（幹事）。自分のPeerで最大7人分の入室コネクションを受け付け、
// メンバー一覧・対戦枠の状態・チャットを全員に配信する。対戦・観戦の成立も仲介するが、
// 対戦本体の通信（NetworkSession）はメンバー同士が直接張るため中継しない
export class RoomHost {
  constructor(name) {
    this.name = name || "Player";
    this.peer = null;
    this.code = null;
    this.selfId = null; // 自分（部屋作成者）のPeer ID。members配列内のidと一致させる
    this.members = []; // [{id, name, isHost, slot, spectating}]
    this.slots = createEmptySlots();
    this.connections = new Map(); // memberId(=peerId) -> DataConnection（入室コネクション）
    this.matchSessions = new Map(); // slotIndex -> NetworkSession（自分が対戦ホストのときのみ持つ）

    this.onRoomReady = null; // (code) => void
    this.onRoomState = null; // ({code, members, slots}) => void
    this.onChatMessage = null; // ({memberId, name, text, ts}) => void
    this.onMatchAssignment = null; // ({slotIndex, role, opponentName}) => void 自分が対戦することになったとき
    this.onSpectateAssignment = null; // ({slotIndex, matchHostName}) => void 自分が観戦することになったとき
    this.onMatchSessionReady = null; // (session, slotIndex, role) => void Game.beginOnlineMatch(role, session)を呼ぶタイミング
    this.onError = null; // (message) => void
  }

  create() {
    this.code = generateRoomCode();
    this.peer = new Peer(ROOM_ID_PREFIX + this.code);
    this.peer.on("open", (id) => {
      this.selfId = id;
      this.members.push({ id: this.selfId, name: this.name, isHost: true, slot: null, spectating: null });
      if (this.onRoomReady) this.onRoomReady(this.code);
      this._broadcastState();
    });
    this.peer.on("connection", (conn) => this._handleIncomingConnection(conn));
    this.peer.on("error", (err) => {
      if (this.onError) this.onError(err?.type || String(err));
    });
    return this.code;
  }

  _handleIncomingConnection(conn) {
    if (conn.metadata?.purpose === "room") {
      this._handleRoomJoin(conn);
    } else {
      acceptMatchOrSpectateConnection(this.peer, conn, this.matchSessions, (session, slotIndex, role) => {
        if (this.onMatchSessionReady) this.onMatchSessionReady(session, slotIndex, role);
      });
    }
  }

  _handleRoomJoin(conn) {
    if (this.members.length >= MAX_MEMBERS) {
      conn.on("open", () => {
        conn.send({ type: "joinRejected", reason: "full" });
        conn.close();
      });
      return;
    }
    const name = conn.metadata?.name || `Player ${this.members.length + 1}`;
    conn.on("open", () => {
      this.connections.set(conn.peer, conn);
      // 'open'イベントが何らかの理由で二重発火しても、同じpeerIdのメンバーを重複登録しないようにする
      if (!this.members.some((m) => m.id === conn.peer)) {
        this.members.push({ id: conn.peer, name, isHost: false, slot: null, spectating: null });
      }
      this._broadcastState();
    });
    conn.on("data", (msg) => this._handleMemberMessage(conn.peer, msg));
    conn.on("close", () => this._handleMemberLeft(conn.peer));
    conn.on("error", () => this._handleMemberLeft(conn.peer));
  }

  _handleMemberLeft(memberId) {
    if (!this.connections.has(memberId)) return;
    this.connections.delete(memberId);
    this._clearMemberFromSlots(memberId);
    this.members = this.members.filter((m) => m.id !== memberId);
    this._broadcastState();
  }

  // 対戦枠・観戦からメンバーを外す（退室時・枠から出るとき・観戦解除時などに使う共通処理）
  _clearMemberFromSlots(memberId) {
    for (const slot of this.slots) {
      if (!slot.memberIds.includes(memberId)) continue;
      slot.memberIds = slot.memberIds.filter((id) => id !== memberId);
      // 対戦ホストが抜けた、または2人揃わなくなったら枠をリセットする（残った1人がいれば待機状態に戻す）
      slot.hostMemberId = null;
      slot.status = slot.memberIds.length > 0 ? "waiting" : "empty";
      this.matchSessions.delete(this.slots.indexOf(slot));
    }
    const member = this.members.find((m) => m.id === memberId);
    if (member) {
      member.slot = null;
      member.spectating = null;
    }
  }

  _handleMemberMessage(memberId, msg) {
    if (!msg) return;
    if (msg.type === "joinSlot") this._handleJoinSlot(memberId, msg.slotIndex);
    else if (msg.type === "leaveSlot") this._handleLeaveSlot(memberId);
    else if (msg.type === "spectateRequest") this._handleSpectateRequest(memberId, msg.slotIndex);
    else if (msg.type === "spectateStop") this._handleSpectateStop(memberId);
    else if (msg.type === "chatMessage") this._handleChatMessage(memberId, msg.text);
  }

  _handleJoinSlot(memberId, slotIndex) {
    const member = this.members.find((m) => m.id === memberId);
    const slot = this.slots[slotIndex];
    if (!member || member.slot !== null || member.spectating !== null) return; // 対戦中・観戦中は不可
    if (!slot || slot.status === "active" || slot.memberIds.length >= 2) return;

    slot.memberIds.push(memberId);
    member.slot = slotIndex;

    if (slot.memberIds.length === 1) {
      slot.status = "waiting";
      this._broadcastState();
      return;
    }

    // 2人揃った：先に入った方を対戦ホストにする
    slot.status = "active";
    slot.hostMemberId = slot.memberIds[0];
    const hostMember = this.members.find((m) => m.id === slot.hostMemberId);
    const joinerMember = member; // 後入り＝今回joinSlotしてきた本人

    this._notifyMember(slot.hostMemberId, {
      type: "matchAssignment",
      slotIndex,
      role: "host",
      opponentName: joinerMember.name,
      opponentPeerId: null,
    });
    this._notifyMember(memberId, {
      type: "matchAssignment",
      slotIndex,
      role: "joiner",
      opponentName: hostMember.name,
      opponentPeerId: hostMember.id,
    });

    this._broadcastState();
  }

  _handleLeaveSlot(memberId) {
    const member = this.members.find((m) => m.id === memberId);
    if (!member || member.slot === null) return;
    this._clearMemberFromSlots(memberId);
    this._broadcastState();
  }

  _handleSpectateRequest(memberId, slotIndex) {
    const member = this.members.find((m) => m.id === memberId);
    const slot = this.slots[slotIndex];
    if (!member || member.slot !== null || member.spectating !== null) return; // 対戦中・別枠観戦中は不可
    if (!slot || slot.status !== "active") return; // 対戦中の枠のみ観戦できる

    const hostMember = this.members.find((m) => m.id === slot.hostMemberId);
    if (!hostMember) return;
    member.spectating = slotIndex;
    this._notifyMember(memberId, {
      type: "spectateAssignment",
      slotIndex,
      matchHostPeerId: hostMember.id,
      matchHostName: hostMember.name,
    });
    this._broadcastState();
  }

  _handleSpectateStop(memberId) {
    const member = this.members.find((m) => m.id === memberId);
    if (!member) return;
    member.spectating = null;
    this._broadcastState();
  }

  _handleChatMessage(memberId, text) {
    const trimmed = String(text || "").trim().slice(0, 200); // 簡単な長さ制限
    if (!trimmed) return;
    const member = this.members.find((m) => m.id === memberId);
    const entry = { memberId, name: member ? member.name : "?", text: trimmed, ts: Date.now() };
    if (this.onChatMessage) this.onChatMessage(entry);
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send({ type: "chatMessage", ...entry });
    }
  }

  // memberIdが自分自身（部屋作成者）宛のときはコールバックを直接呼び、それ以外は該当メンバーの
  // 部屋コネクションへ送信する（roomStateとchatMessage以外の、個別宛メッセージ用）
  _notifyMember(memberId, message) {
    if (memberId === this.selfId) {
      this._handleOwnAssignment(message);
      return;
    }
    const conn = this.connections.get(memberId);
    if (conn && conn.open) conn.send(message);
  }

  // 自分自身（部屋作成者）が対戦・観戦の割り当てを受けたときの処理。RoomMemberの_handleMessage()の
  // matchAssignment/spectateAssignment分岐と全く同じ内容（部屋作成者も他のメンバーと同じ仕組みで対戦する）
  _handleOwnAssignment(message) {
    if (message.type === "matchAssignment") {
      if (message.role === "joiner") {
        connectAsMatchJoiner(this.peer, message.slotIndex, message.opponentPeerId, this.matchSessions, (session, slotIndex, role) => {
          if (this.onMatchSessionReady) this.onMatchSessionReady(session, slotIndex, role);
        });
      }
      if (this.onMatchAssignment) this.onMatchAssignment(message);
    } else if (message.type === "spectateAssignment") {
      connectAsSpectator(this.peer, message.slotIndex, message.matchHostPeerId, (session, slotIndex, role) => {
        if (this.onMatchSessionReady) this.onMatchSessionReady(session, slotIndex, role);
      });
      if (this.onSpectateAssignment) this.onSpectateAssignment(message);
    }
  }

  _broadcastState() {
    const members = this.members.map(publicMember);
    const slots = publicSlots(this.slots);
    if (this.onRoomState) this.onRoomState({ code: this.code, members, slots });
    for (const conn of this.connections.values()) {
      if (conn.open) conn.send({ type: "roomState", members, slots });
    }
  }

  // 部屋作成者自身の操作（HTML側のボタン等から呼ぶ）
  joinSlot(slotIndex) {
    this._handleJoinSlot(this.selfId, slotIndex);
  }

  leaveSlot() {
    this._handleLeaveSlot(this.selfId);
  }

  spectateRequest(slotIndex) {
    this._handleSpectateRequest(this.selfId, slotIndex);
  }

  spectateStop() {
    this._handleSpectateStop(this.selfId);
  }

  sendChat(text) {
    this._handleChatMessage(this.selfId, text);
  }

  close() {
    for (const conn of this.connections.values()) {
      if (conn.open) conn.close();
    }
    for (const session of this.matchSessions.values()) {
      session.close();
    }
    this.connections.clear();
    this.matchSessions.clear();
    if (this.peer) this.peer.destroy();
    this.peer = null;
  }
}

// 部屋に参加する側（幹事以外の一般メンバー）。部屋ホストへの1本のコネクション（部屋コネクション）で
// メンバー一覧・チャットを受け取り、対戦・観戦が割り当てられたら別途対戦ホストへ直接接続する
export class RoomMember {
  constructor(name) {
    this.name = name || "Player";
    this.peer = null;
    this.roomConnection = null;
    this.selfId = null;
    this.matchSessions = new Map(); // slotIndex -> NetworkSession（自分が対戦ホストになったときのみ持つ）

    this.onRoomState = null; // ({members, slots}) => void
    this.onChatMessage = null; // ({memberId, name, text, ts}) => void
    this.onJoinRejected = null; // (reason) => void
    this.onMatchAssignment = null; // ({slotIndex, role, opponentName}) => void
    this.onSpectateAssignment = null; // ({slotIndex, matchHostName}) => void
    this.onMatchSessionReady = null; // (session, slotIndex, role) => void Game.beginOnlineMatch(role, session)を呼ぶタイミング
    this.onDisconnected = null; // () => void 部屋（ホスト）との接続が切れたとき
    this.onError = null; // (message) => void
  }

  join(code) {
    this.peer = new Peer();
    this.peer.on("open", (id) => {
      this.selfId = id;
      const conn = this.peer.connect(ROOM_ID_PREFIX + code.trim().toUpperCase(), {
        metadata: { purpose: "room", name: this.name },
        reliable: true, // 部屋の状態・チャット・マッチング通知は取りこぼしたくないため信頼性のあるチャンネルを使う
      });
      this._bindRoomConnection(conn);
    });
    this.peer.on("connection", (conn) => this._handleIncomingConnection(conn));
    this.peer.on("error", (err) => {
      if (this.onError) this.onError(err?.type || String(err));
    });
  }

  _bindRoomConnection(conn) {
    this.roomConnection = conn;
    conn.on("data", (msg) => this._handleMessage(msg));
    conn.on("close", () => {
      if (this.onDisconnected) this.onDisconnected();
    });
    conn.on("error", (err) => {
      if (this.onError) this.onError(err?.type || String(err));
    });
  }

  _handleIncomingConnection(conn) {
    acceptMatchOrSpectateConnection(this.peer, conn, this.matchSessions, (session, slotIndex, role) => {
      if (this.onMatchSessionReady) this.onMatchSessionReady(session, slotIndex, role);
    });
  }

  _handleMessage(msg) {
    if (!msg) return;
    if (msg.type === "roomState") {
      if (this.onRoomState) this.onRoomState({ members: msg.members, slots: msg.slots });
    } else if (msg.type === "chatMessage") {
      if (this.onChatMessage) this.onChatMessage(msg);
    } else if (msg.type === "joinRejected") {
      if (this.onJoinRejected) this.onJoinRejected(msg.reason);
    } else if (msg.type === "matchAssignment") {
      if (msg.role === "joiner") {
        connectAsMatchJoiner(this.peer, msg.slotIndex, msg.opponentPeerId, this.matchSessions, (session, slotIndex, role) => {
          if (this.onMatchSessionReady) this.onMatchSessionReady(session, slotIndex, role);
        });
      }
      if (this.onMatchAssignment) this.onMatchAssignment(msg);
    } else if (msg.type === "spectateAssignment") {
      connectAsSpectator(this.peer, msg.slotIndex, msg.matchHostPeerId, (session, slotIndex, role) => {
        if (this.onMatchSessionReady) this.onMatchSessionReady(session, slotIndex, role);
      });
      if (this.onSpectateAssignment) this.onSpectateAssignment(msg);
    }
  }

  send(msg) {
    if (this.roomConnection && this.roomConnection.open) this.roomConnection.send(msg);
  }

  joinSlot(slotIndex) {
    this.send({ type: "joinSlot", slotIndex });
  }

  leaveSlot(slotIndex) {
    this.send({ type: "leaveSlot", slotIndex });
  }

  spectateRequest(slotIndex) {
    this.send({ type: "spectateRequest", slotIndex });
  }

  spectateStop(slotIndex) {
    this.send({ type: "spectateStop", slotIndex });
  }

  sendChat(text) {
    this.send({ type: "chatMessage", text });
  }

  close() {
    if (this.roomConnection) this.roomConnection.close();
    for (const session of this.matchSessions.values()) {
      session.close();
    }
    this.matchSessions.clear();
    if (this.peer) this.peer.destroy();
    this.peer = null;
    this.roomConnection = null;
  }
}
