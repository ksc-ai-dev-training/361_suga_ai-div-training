const BAR_WIDTH = 400;
const BAR_HEIGHT = 24;
const BAR_MARGIN = 20;

export function drawHealthBars(ctx, player1, player2, canvasWidth) {
  drawHealthBar(ctx, BAR_MARGIN, BAR_MARGIN, player1, false);
  drawHealthBar(ctx, canvasWidth - BAR_MARGIN - BAR_WIDTH, BAR_MARGIN, player2, true);
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

export function drawMatchResult(ctx, canvasWidth, canvasHeight, winnerLabel) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  ctx.font = "bold 64px sans-serif";
  ctx.fillText("K.O.", canvasWidth / 2, canvasHeight / 2 - 20);

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
  "波動拳: ↓ → ↘ → → の後にパンチ",
  "スーパーアーツ: 波動拳コマンドを2回連続の後にパンチ",
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
