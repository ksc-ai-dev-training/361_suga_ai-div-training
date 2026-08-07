export const GROUND_Y = 590;

// backgroundImage が渡されればそれを全面に描画し、無ければ黒で塗りつぶす
export function drawStage(ctx, canvasWidth, canvasHeight, backgroundImage) {
  if (backgroundImage) {
    drawImageCover(ctx, backgroundImage, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  ctx.fillStyle = "#6b4f2a";
  ctx.fillRect(0, GROUND_Y, canvasWidth, 4);
}

// canvasと画像でアスペクト比が異なっても歪ませないよう、画像を拡大して
// はみ出た分を中央基準でトリミングする（CSSの background-size: cover 相当）
function drawImageCover(ctx, img, canvasWidth, canvasHeight) {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const canvasAspect = canvasWidth / canvasHeight;

  let drawWidth, drawHeight;
  if (imgAspect > canvasAspect) {
    drawHeight = canvasHeight;
    drawWidth = drawHeight * imgAspect;
  } else {
    drawWidth = canvasWidth;
    drawHeight = drawWidth / imgAspect;
  }

  const dx = (canvasWidth - drawWidth) / 2;
  const dy = (canvasHeight - drawHeight) / 2;
  ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
}
