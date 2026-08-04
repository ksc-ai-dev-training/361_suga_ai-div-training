export const GROUND_Y = 590;

export function drawStage(ctx, canvasWidth) {
  ctx.fillStyle = "#6b4f2a";
  ctx.fillRect(0, GROUND_Y, canvasWidth, 4);
}
