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
