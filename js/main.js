import { Game } from "./game.js";
import { updateInputFrame } from "./input.js";
import { loadAssets } from "./assets.js";
import { NetworkSession } from "./network.js";
import { RoomHost, RoomMember, MAX_MEMBERS } from "./room.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// オンライン対戦（簡易版）の接続パネル要素。canvasには文字入力欄を置けないため、
// 通常のHTML要素として重ねて表示し、game.introPhase === "onlineLobby" の間だけ表示を切り替える
const onlinePanel = document.getElementById("onlinePanel");
const onlineChoice = document.getElementById("onlineChoice");
const onlineHostBtn = document.getElementById("onlineHostBtn");
const onlineJoinBtn = document.getElementById("onlineJoinBtn");
const onlineBackBtn = document.getElementById("onlineBackBtn");
const onlineHostPanel = document.getElementById("onlineHostPanel");
const onlineHostCode = document.getElementById("onlineHostCode");
const onlineHostStatus = document.getElementById("onlineHostStatus");
const onlineJoinPanel = document.getElementById("onlineJoinPanel");
const onlineJoinInput = document.getElementById("onlineJoinInput");
const onlineJoinSubmitBtn = document.getElementById("onlineJoinSubmitBtn");
const onlineJoinStatus = document.getElementById("onlineJoinStatus");

// ルーム機能（最大8人・対戦枠2つ・観戦・チャット）の接続パネル要素
const roomNameInput = document.getElementById("roomNameInput");
const roomCreateBtn = document.getElementById("roomCreateBtn");
const roomJoinBtn = document.getElementById("roomJoinBtn");
const roomJoinPanel = document.getElementById("roomJoinPanel");
const roomJoinInput = document.getElementById("roomJoinInput");
const roomJoinSubmitBtn = document.getElementById("roomJoinSubmitBtn");
const roomJoinStatus = document.getElementById("roomJoinStatus");

// ルームのロビー画面要素。game.introPhase === "room" の間だけ表示する
const roomPanel = document.getElementById("roomPanel");
const roomCode = document.getElementById("roomCode");
const roomMemberCount = document.getElementById("roomMemberCount");
const roomLeaveBtn = document.getElementById("roomLeaveBtn");
const roomStatus = document.getElementById("roomStatus");
const roomSlots = document.getElementById("roomSlots");
const roomMemberList = document.getElementById("roomMemberList");
const roomChatLog = document.getElementById("roomChatLog");
const roomChatInput = document.getElementById("roomChatInput");
const roomChatSendBtn = document.getElementById("roomChatSendBtn");

// ホスト/参加のどちらかの接続試行中（まだgame.beginOnlineMatchに渡す前）のNetworkSession。
// 接続成立前に「戻る」が押された場合はこれを閉じる
let pendingNetwork = null;

// 現在参加しているルームのセッション（RoomHost または RoomMember のどちらか一方）。
// 部屋にいない間はnull
let roomSession = null;
let selfMemberId = null;
const CHAT_HISTORY_LIMIT = 50; // 表示側で保持する直近チャット件数

function resetOnlineLobbyUI() {
  onlineChoice.classList.remove("hidden");
  onlineHostPanel.classList.add("hidden");
  onlineJoinPanel.classList.add("hidden");
  roomJoinPanel.classList.add("hidden");
  onlineHostCode.textContent = "----";
  onlineHostStatus.textContent = "";
  onlineJoinInput.value = "";
  onlineJoinStatus.textContent = "";
  roomJoinInput.value = "";
  roomJoinStatus.textContent = "";
  if (pendingNetwork) {
    pendingNetwork.close();
    pendingNetwork = null;
  }
}

function resetRoomPanelContent() {
  roomCode.textContent = "----";
  roomMemberCount.textContent = "人数: -/-";
  roomStatus.textContent = "";
  roomSlots.innerHTML = "";
  roomMemberList.innerHTML = "";
  roomChatLog.innerHTML = "";
}

function getRoomDisplayName() {
  return roomNameInput.value.trim().slice(0, 12) || "Player";
}

function leaveRoomSession() {
  if (roomSession) {
    roomSession.close();
    roomSession = null;
  }
  selfMemberId = null;
}

function appendChatMessage(entry) {
  const row = document.createElement("div");
  row.className = "roomChatEntry";
  const nameSpan = document.createElement("span");
  nameSpan.className = "roomChatName";
  nameSpan.textContent = `${entry.name}:`;
  const textSpan = document.createElement("span");
  textSpan.textContent = entry.text;
  row.appendChild(nameSpan);
  row.appendChild(textSpan);
  roomChatLog.appendChild(row);
  while (roomChatLog.children.length > CHAT_HISTORY_LIMIT) {
    roomChatLog.removeChild(roomChatLog.firstChild);
  }
  roomChatLog.scrollTop = roomChatLog.scrollHeight;
}

function renderRoomSlots(members, slots) {
  const me = members.find((m) => m.id === selfMemberId);
  const amBusy = !!me && (me.slot !== null || me.spectating !== null);

  roomSlots.innerHTML = "";
  slots.forEach((slot, index) => {
    const card = document.createElement("div");
    card.className = "roomSlotCard" + (slot.status === "active" ? " active" : "");

    const title = document.createElement("div");
    title.className = "roomSlotTitle";
    title.textContent = `対戦${index + 1}`;
    card.appendChild(title);

    if (slot.status === "empty") {
      const empty = document.createElement("div");
      empty.className = "roomSlotEmpty";
      empty.textContent = "対戦相手募集中";
      card.appendChild(empty);
    } else {
      const names = slot.memberIds.map((id) => members.find((m) => m.id === id)?.name || "?");
      const vs = document.createElement("div");
      vs.className = "roomSlotVs";
      if (names.length < 2) {
        vs.textContent = `${names[0]}（対戦相手待ち）`;
      } else {
        const n1 = document.createElement("span");
        n1.textContent = names[0];
        const vsLabel = document.createElement("span");
        vsLabel.className = "vsLabel";
        vsLabel.textContent = "VS";
        const n2 = document.createElement("span");
        n2.textContent = names[1];
        vs.appendChild(n1);
        vs.appendChild(vsLabel);
        vs.appendChild(n2);
      }
      card.appendChild(vs);
    }

    const actions = document.createElement("div");
    actions.className = "roomSlotActions";
    const amInThisSlot = !!me && me.slot === index;

    if (amInThisSlot) {
      const leaveBtn = document.createElement("button");
      leaveBtn.textContent = "抜ける";
      leaveBtn.addEventListener("click", () => roomSession && roomSession.leaveSlot(index));
      actions.appendChild(leaveBtn);
    } else if (slot.status === "empty" || slot.status === "waiting") {
      const joinBtn = document.createElement("button");
      joinBtn.textContent = "参加する";
      joinBtn.disabled = amBusy;
      joinBtn.addEventListener("click", () => roomSession && roomSession.joinSlot(index));
      actions.appendChild(joinBtn);
    } else if (slot.status === "active") {
      const watchBtn = document.createElement("button");
      watchBtn.textContent = "観戦する";
      watchBtn.disabled = amBusy;
      watchBtn.addEventListener("click", () => roomSession && roomSession.spectateRequest(index));
      actions.appendChild(watchBtn);
    }

    card.appendChild(actions);
    roomSlots.appendChild(card);
  });
}

function renderRoomMemberList(members) {
  roomMemberList.innerHTML = "";
  // 万一同じidのメンバーが重複して届いても1行だけ表示する（表示側の保険）
  const seenIds = new Set();
  const uniqueMembers = members.filter((member) => {
    if (seenIds.has(member.id)) return false;
    seenIds.add(member.id);
    return true;
  });
  uniqueMembers.forEach((member) => {
    const row = document.createElement("div");
    row.className = "roomMemberRow";

    // バッジ（float:right）を先に追加し、名前を後から通常フローで流し込む
    // （floatは後続の要素からしか回り込めないため、DOM順もこの並びにする）
    const parts = [];
    if (member.isHost) parts.push("幹事");
    if (member.slot !== null) parts.push(`対戦${member.slot + 1}`);
    if (member.spectating !== null) parts.push(`観戦${member.spectating + 1}`);
    if (parts.length > 0) {
      const badge = document.createElement("span");
      badge.className = "roomMemberBadge";
      badge.textContent = parts.join(" / ");
      row.appendChild(badge);
    }

    const nameSpan = document.createElement("span");
    nameSpan.className = "roomMemberName";
    nameSpan.textContent = member.name + (member.id === selfMemberId ? "（自分）" : "");
    row.appendChild(nameSpan);

    roomMemberList.appendChild(row);
  });
}

// RoomHost/RoomMemberのどちらにも共通する配線（メンバー一覧・対戦枠の表示更新、チャット表示、
// エラー表示、対戦・観戦が成立したときにGameを起動する処理）。onFirstStateは、最初のroomState受信
// （＝入室成功）のタイミングでUIをロビー画面へ切り替えるために使う。
// gameを引数で受け取るのは、この関数自体がloadAssets().then()のクロージャ外（モジュールトップレベル）で
// 定義されており、game変数（.then()内でのみ生成される）を直接キャプチャできないため
function bindRoomSessionCommonCallbacks(session, game, onFirstState) {
  let receivedFirstState = false;
  session.onRoomState = (state) => {
    if (!receivedFirstState) {
      receivedFirstState = true;
      selfMemberId = session.selfId;
      if (onFirstState) onFirstState();
    }
    roomMemberCount.textContent = `人数: ${state.members.length}/${MAX_MEMBERS}`;
    renderRoomSlots(state.members, state.slots);
    renderRoomMemberList(state.members);
  };
  session.onChatMessage = (entry) => appendChatMessage(entry);
  session.onError = (message) => {
    roomStatus.textContent = `エラー: ${message}`;
  };
  session.onMatchSessionReady = (matchSession, slotIndex, role) => {
    game.onlineContext = "room";
    game.onReturnToRoom = () => {
      if (roomSession) {
        if (role === "spectator") roomSession.spectateStop(slotIndex);
        else roomSession.leaveSlot(slotIndex);
      }
      game.enterRoom();
    };
    game.beginOnlineMatch(role, matchSession);
  };
}

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// 画面のCSS表示サイズ(resizeCanvasで拡縮される)からcanvas内部座標(1200x600基準)に変換する
function toCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

// 画像が無くても loadAssets は null で解決するため、ここで待っても起動が止まることはない
loadAssets().then((assets) => {
  const game = new Game(ctx, canvas.width, canvas.height, assets);
  let lastTime = performance.now();

  // タイトル画面のSTART/PRACTICE/VS 2P/ONLINEボタン用（クリックで開始・ホバー時はカーソルをpointerに）
  canvas.addEventListener("click", (e) => {
    const { x, y } = toCanvasCoords(e);
    game.handleClick(x, y);
  });
  canvas.addEventListener("mousemove", (e) => {
    const { x, y } = toCanvasCoords(e);
    game.setMousePosition(x, y);
    const isHovered =
      game.isHoveringStartButton(x, y) ||
      game.isHoveringPracticeButton(x, y) ||
      game.isHoveringVersusButton(x, y) ||
      game.isHoveringOnlineButton(x, y) ||
      game.isHoveringAnyMatchResultButton(x, y);
    canvas.style.cursor = isHovered ? "pointer" : "default";
  });

  // オンライン対戦（簡易版・1対1）の接続パネル操作
  onlineHostBtn.addEventListener("click", () => {
    onlineChoice.classList.add("hidden");
    onlineHostPanel.classList.remove("hidden");
    onlineHostStatus.textContent = "部屋を作成中...";

    const network = new NetworkSession();
    pendingNetwork = network;
    network.onHostReady = (code) => {
      onlineHostCode.textContent = code;
      onlineHostStatus.textContent = "相手の参加を待っています...";
    };
    network.onConnected = () => {
      onlineHostStatus.textContent = "接続しました！対戦を開始します...";
      pendingNetwork = null;
      game.onlineContext = "standalone";
      game.beginOnlineMatch("host", network);
    };
    network.onError = (message) => {
      onlineHostStatus.textContent = `接続エラー: ${message}`;
    };
    network.host();
  });

  onlineJoinBtn.addEventListener("click", () => {
    onlineChoice.classList.add("hidden");
    onlineJoinPanel.classList.remove("hidden");
  });

  onlineJoinSubmitBtn.addEventListener("click", () => {
    const code = onlineJoinInput.value.trim();
    if (!code) return;
    onlineJoinStatus.textContent = "接続中...";

    const network = new NetworkSession();
    pendingNetwork = network;
    network.onConnected = () => {
      onlineJoinStatus.textContent = "接続しました！対戦を開始します...";
      pendingNetwork = null;
      game.onlineContext = "standalone";
      game.beginOnlineMatch("joiner", network);
    };
    network.onError = (message) => {
      onlineJoinStatus.textContent = `接続エラー: ${message}`;
    };
    network.join(code);
  });

  onlineBackBtn.addEventListener("click", () => {
    resetOnlineLobbyUI();
    game.exitOnlineLobby();
  });

  // ルーム機能の接続パネル操作
  roomCreateBtn.addEventListener("click", () => {
    onlineChoice.classList.add("hidden");
    resetRoomPanelContent();
    roomStatus.textContent = "ルームを作成中...";

    const host = new RoomHost(getRoomDisplayName());
    roomSession = host;
    bindRoomSessionCommonCallbacks(host, game, () => {
      roomCode.textContent = host.code;
      roomStatus.textContent = "";
      game.enterRoom();
    });
    host.create();
  });

  roomJoinBtn.addEventListener("click", () => {
    onlineChoice.classList.add("hidden");
    roomJoinPanel.classList.remove("hidden");
  });

  roomJoinSubmitBtn.addEventListener("click", () => {
    const code = roomJoinInput.value.trim();
    if (!code) return;
    roomJoinStatus.textContent = "接続中...";

    const member = new RoomMember(getRoomDisplayName());
    roomSession = member;
    bindRoomSessionCommonCallbacks(member, game, () => {
      roomCode.textContent = code.toUpperCase();
      roomJoinStatus.textContent = "";
      game.enterRoom();
    });
    member.onJoinRejected = (reason) => {
      roomJoinStatus.textContent = reason === "full" ? "満員です" : `参加できませんでした（${reason}）`;
      roomSession = null;
    };
    member.onDisconnected = () => {
      // 部屋作成者との接続が切れた＝部屋が終了した（部屋作成者がタブを閉じた場合など）
      roomSession = null;
      if (game.introPhase === "room") game.exitRoom();
    };
    member.join(code);
  });

  roomLeaveBtn.addEventListener("click", () => {
    leaveRoomSession();
    resetRoomPanelContent();
    game.exitRoom();
  });

  function sendRoomChat() {
    const text = roomChatInput.value.trim();
    if (!text || !roomSession) return;
    roomSession.sendChat(text);
    roomChatInput.value = "";
  }
  roomChatSendBtn.addEventListener("click", sendRoomChat);
  roomChatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendRoomChat();
  });

  let wasOnlineLobby = false;

  function loop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    game.update(dt);
    game.render();
    updateInputFrame();

    const isOnlineLobby = game.introPhase === "onlineLobby";
    if (isOnlineLobby && !wasOnlineLobby) resetOnlineLobbyUI();
    onlinePanel.classList.toggle("hidden", !isOnlineLobby);
    wasOnlineLobby = isOnlineLobby;

    // ルームパネルは対戦・観戦中に隠れても内部状態は保持され続けるため（RoomHost/RoomMemberは
    // 対戦中もバックグラウンドで生き続ける）、再表示時に内容をリセットする必要はない
    roomPanel.classList.toggle("hidden", game.introPhase !== "room");

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
