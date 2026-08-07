import { Game } from "./game.js";
import { updateInputFrame } from "./input.js";
import { loadAssets } from "./assets.js";
import { NetworkSession } from "./network.js";

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

// ホスト/参加のどちらかの接続試行中（まだgame.beginOnlineMatchに渡す前）のNetworkSession。
// 接続成立前に「戻る」が押された場合はこれを閉じる
let pendingNetwork = null;

function resetOnlineLobbyUI() {
  onlineChoice.classList.remove("hidden");
  onlineHostPanel.classList.add("hidden");
  onlineJoinPanel.classList.add("hidden");
  onlineHostCode.textContent = "----";
  onlineHostStatus.textContent = "";
  onlineJoinInput.value = "";
  onlineJoinStatus.textContent = "";
  if (pendingNetwork) {
    pendingNetwork.close();
    pendingNetwork = null;
  }
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
      game.isHoveringOnlineButton(x, y);
    canvas.style.cursor = isHovered ? "pointer" : "default";
  });

  // オンライン対戦（簡易版）の接続パネル操作
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

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
