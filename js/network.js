// オンライン対戦（簡易版）の接続管理。PeerJS（https://peerjs.com/）が提供する
// 無料のクラウドシグナリングサーバーを使ってWebRTCのP2P接続を確立する。
// このプロジェクト自体は自前のサーバーを持たない（Vercelで静的配信のみ）ため、
// シグナリングは全面的にPeerJSの公開サーバーに依存している。
// `Peer`クラスはindex.htmlでCDNから読み込んだグローバル変数として提供される
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(0/O, 1/I)を除いた文字集合
const ROOM_ID_PREFIX = "kogafighter-"; // PeerJSのIDは全ユーザー共通の名前空間なので、衝突を避けるため接頭辞を付ける

function generateRoomCode(length = 4) {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

// 1回のオンライン対戦セッション（ホスト側 or 参加側のどちらか一方の役割）を表す。
// コールバック（onHostReady/onConnected/onData/onDisconnected/onError）を呼び出し側が
// 差し替えて使う、単純なイベント駆動のラッパー
export class NetworkSession {
  constructor() {
    this.peer = null;
    this.connection = null;
    this.role = null; // "host" | "joiner"
    this.ownsPeer = true; // close()時にpeer.destroy()まで行うか。attachToConnection()で共有Peerに乗る場合はfalseにする
    this.spectatorConnections = []; // 観戦者への配信先（ルーム機能の対戦ホストが持つ。単体の1対1では常に空のまま）
    this.onHostReady = null; // (code) => void ホスト側: 部屋コードが決まった時点で呼ばれる
    this.onConnected = null; // () => void 相手との接続が確立した時点で呼ばれる
    this.onData = null; // (data) => void 相手からデータを受信するたびに呼ばれる
    this.onDisconnected = null; // () => void 接続が切れた時点で呼ばれる
    this.onError = null; // (message) => void 接続エラー発生時に呼ばれる
  }

  // 部屋を作ってホストになり、相手の接続を待つ
  host() {
    this.role = "host";
    const code = generateRoomCode();
    this.peer = new Peer(ROOM_ID_PREFIX + code);

    this.peer.on("open", () => {
      if (this.onHostReady) this.onHostReady(code);
    });
    this.peer.on("connection", (conn) => this._bindConnection(conn));
    this.peer.on("error", (err) => {
      if (this.onError) this.onError(err?.type || String(err));
    });
    return code;
  }

  // 相手が作った部屋に合言葉で参加する
  join(code) {
    this.role = "joiner";
    this.peer = new Peer();

    this.peer.on("open", () => {
      const conn = this.peer.connect(ROOM_ID_PREFIX + code.trim().toUpperCase(), { reliable: false });
      this._bindConnection(conn);
    });
    this.peer.on("error", (err) => {
      if (this.onError) this.onError(err?.type || String(err));
    });
  }

  // ルーム機能用: 既にオープン済みのPeer/DataConnectionへ後付けでアタッチする（新規Peerを作らない）。
  // ルームの対戦・観戦は、メンバーが部屋コネクションと共有している同一のPeerオブジェクト上に
  // 追加のDataConnectionを張って行うため、host()/join()のようにPeerそのものを新規作成できない。
  // ownsPeer: falseにすると、このセッションのclose()はconnection（と観戦者接続）だけを閉じ、
  // 部屋コネクションが道連れでpeer.destroy()されないようにする
  attachToConnection(peer, conn, role, { ownsPeer = false } = {}) {
    this.role = role;
    this.peer = peer;
    this.ownsPeer = ownsPeer;
    this._bindConnection(conn);
  }

  // 観戦者用のDataConnectionを配信先に追加する（対戦ホスト側のみ使用）。
  // 観戦者側の接続が閉じたら自動的にリストから外す
  addSpectator(conn) {
    this.spectatorConnections.push(conn);
    conn.on("close", () => this.removeSpectator(conn));
  }

  removeSpectator(conn) {
    this.spectatorConnections = this.spectatorConnections.filter((c) => c !== conn);
  }

  _bindConnection(conn) {
    this.connection = conn;
    conn.on("open", () => {
      if (this.onConnected) this.onConnected();
    });
    conn.on("data", (data) => {
      if (this.onData) this.onData(data);
    });
    conn.on("close", () => {
      if (this.onDisconnected) this.onDisconnected();
    });
    conn.on("error", (err) => {
      if (this.onError) this.onError(err?.type || String(err));
    });
  }

  // 対戦相手（this.connection）に加え、観戦者（spectatorConnections）全員にも同じデータを配信する。
  // 1人分の送信失敗（切断直後など）が他の配信を止めないよう、接続ごとに握りつぶす
  send(data) {
    for (const conn of [this.connection, ...this.spectatorConnections]) {
      if (!conn || !conn.open) continue;
      try {
        conn.send(data);
      } catch {
        // 送信失敗は無視する（次フレームの送信、またはclose検知に委ねる）
      }
    }
  }

  close() {
    if (this.connection) this.connection.close();
    for (const conn of this.spectatorConnections) {
      if (conn && conn.open) conn.close();
    }
    this.spectatorConnections = [];
    if (this.peer && this.ownsPeer) this.peer.destroy();
    this.connection = null;
    this.peer = null;
  }
}
