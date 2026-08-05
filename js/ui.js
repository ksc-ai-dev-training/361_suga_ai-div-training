const HUD_MARGIN = 20;
const PORTRAIT_SIZE = 60;
const BAR_WIDTH = 380;
const BAR_HEIGHT = 24;
const SUPER_BAR_WIDTH = 260;
const SUPER_BAR_HEIGHT = 16;

// HP・SUPERゲージ・ポートレート・名前・タイマーをまとめて描画する
export function drawHud(ctx, player1, player2, canvasWidth, canvasHeight, timeRemaining) {
  drawSidePanel(ctx, player1, "1P", "PLAYER", canvasWidth, false);
  drawSidePanel(ctx, player2, "2P", "CPU", canvasWidth, true);
  drawTimer(ctx, canvasWidth, timeRemaining);
  drawSuperGauge(ctx, player1, canvasWidth, canvasHeight, false);
  drawSuperGauge(ctx, player2, canvasWidth, canvasHeight, true);
}

// reversed: 2P側（右側）はポートレート・バー・名前の並びを左右反転する
function drawSidePanel(ctx, player, cornerLabel, name, canvasWidth, reversed) {
  const portraitX = reversed ? canvasWidth - HUD_MARGIN - PORTRAIT_SIZE : HUD_MARGIN;
  const barY = HUD_MARGIN + 6;
  const barX = reversed ? portraitX - 10 - BAR_WIDTH : portraitX + PORTRAIT_SIZE + 10;

  drawPortrait(ctx, portraitX, HUD_MARGIN, player, cornerLabel);
  drawHealthBar(ctx, barX, barY, player, reversed);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = reversed ? "right" : "left";
  ctx.fillText(name, reversed ? barX + BAR_WIDTH : barX, barY + BAR_HEIGHT + 20);
}

// 実在キャラクターの絵は使わず、プレイヤーの色を使った簡易的な自作アイコン
function drawPortrait(ctx, x, y, player, cornerLabel) {
  ctx.fillStyle = "#ffaa33";
  ctx.textAlign = "center";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(cornerLabel, x + PORTRAIT_SIZE / 2, y - 6);

  ctx.fillStyle = player.color;
  ctx.fillRect(x, y, PORTRAIT_SIZE, PORTRAIT_SIZE);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, PORTRAIT_SIZE, PORTRAIT_SIZE);

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(x + PORTRAIT_SIZE * 0.35, y + PORTRAIT_SIZE * 0.42, 4, 0, Math.PI * 2);
  ctx.arc(x + PORTRAIT_SIZE * 0.65, y + PORTRAIT_SIZE * 0.42, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + PORTRAIT_SIZE / 2, y + PORTRAIT_SIZE * 0.6, 10, 0, Math.PI, false);
  ctx.stroke();
}

// reversed: 右側のバー（P2）は右端を基準に減らす
function drawHealthBar(ctx, x, y, player, reversed) {
  const ratio = player.hp / player.maxHp;
  const fillWidth = BAR_WIDTH * ratio;

  ctx.fillStyle = "#222222";
  ctx.fillRect(x, y, BAR_WIDTH, BAR_HEIGHT);

  ctx.fillStyle = ratio > 0.3 ? "#3ddc47" : "#e03c3c";
  const fillX = reversed ? x + BAR_WIDTH - fillWidth : x;
  ctx.fillRect(fillX, y, fillWidth, BAR_HEIGHT);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, BAR_WIDTH, BAR_HEIGHT);
}

function drawTimer(ctx, canvasWidth, timeRemaining) {
  const seconds = Math.ceil(timeRemaining);
  ctx.fillStyle = "#ffcc33";
  ctx.textAlign = "center";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText(String(seconds).padStart(2, "0"), canvasWidth / 2, 60);
}

// reversed: 2P側（右側）はゲージ・ラベルの並びを左右反転する
function drawSuperGauge(ctx, player, canvasWidth, canvasHeight, reversed) {
  const y = canvasHeight - HUD_MARGIN - SUPER_BAR_HEIGHT;
  const x = reversed ? canvasWidth - HUD_MARGIN - SUPER_BAR_WIDTH : HUD_MARGIN;
  const ratio = player.superGauge / player.maxSuperGauge;
  const fillWidth = SUPER_BAR_WIDTH * ratio;
  const isFull = ratio >= 1;

  ctx.fillStyle = "#222222";
  ctx.fillRect(x, y, SUPER_BAR_WIDTH, SUPER_BAR_HEIGHT);

  ctx.fillStyle = isFull ? "#ffcc33" : "#3399ff";
  const fillX = reversed ? x + SUPER_BAR_WIDTH - fillWidth : x;
  ctx.fillRect(fillX, y, fillWidth, SUPER_BAR_HEIGHT);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, SUPER_BAR_WIDTH, SUPER_BAR_HEIGHT);

  ctx.fillStyle = isFull ? "#ffcc33" : "#ffffff";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = reversed ? "right" : "left";
  ctx.textBaseline = "middle";
  ctx.fillText("SUPER", reversed ? x - 10 : x + SUPER_BAR_WIDTH + 10, y + SUPER_BAR_HEIGHT / 2);
  ctx.textBaseline = "alphabetic"; // 以降の描画に影響しないよう戻す
}

export function drawMatchResult(ctx, canvasWidth, canvasHeight, winnerLabel, headerLabel = "K.O.") {
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  ctx.font = "bold 64px sans-serif";
  ctx.fillText(headerLabel, canvasWidth / 2, canvasHeight / 2 - 20);

  ctx.font = "28px sans-serif";
  ctx.fillText(winnerLabel, canvasWidth / 2, canvasHeight / 2 + 30);
  ctx.fillText("Rキーでリスタート", canvasWidth / 2, canvasHeight / 2 + 70);
}

const HELP_LINES = [
  "移動: A / D",
  "ジャンプ: W（A/Dと同時押しで前・後ジャンプ）",
  "しゃがみ: S",
  "ガード: 後ろ方向（向いている方向と逆のA/D）",
  "弱 / 中 / 強パンチ: U / I / O",
  "弱 / 中 / 強キック: J / K / L",
  "波動拳: ↓ ↘ → の後にパンチ",
  "スーパーアーツ: 波動拳コマンドを2回連続の後にパンチ（SUPERゲージ満タン時のみ）",
  "リスタート（決着後のみ）: R",
];

export function drawHelpOverlay(ctx, canvasWidth, canvasHeight) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  ctx.font = "bold 36px sans-serif";
  ctx.fillText("操作説明", canvasWidth / 2, 90);

  ctx.font = "20px sans-serif";
  const lineHeight = 34;
  const startY = 150;
  HELP_LINES.forEach((line, i) => {
    ctx.fillText(line, canvasWidth / 2, startY + i * lineHeight);
  });

  ctx.font = "18px sans-serif";
  ctx.fillText("ESCキーで閉じる", canvasWidth / 2, startY + HELP_LINES.length * lineHeight + 30);
}
