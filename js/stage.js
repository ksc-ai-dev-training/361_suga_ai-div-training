export const GROUND_Y = 590;

// backgroundImage が渡されればそれを全面に描画し、無ければ元の空色で塗りつぶす
export function drawStage(ctx, canvasWidth, canvasHeight, backgroundImage) {
  if (backgroundImage) {
    ctx.drawImage(backgroundImage, 0, 0, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = "#87ceeb";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  ctx.fillStyle = "#6b4f2a";
  ctx.fillRect(0, GROUND_Y, canvasWidth, 4);
}
