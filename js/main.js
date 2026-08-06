import { Game } from "./game.js";
import { updateInputFrame } from "./input.js";
import { loadAssets } from "./assets.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

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

  // タイトル画面のSTARTボタン用（クリックで開始・ホバー時はカーソルをpointerに）
  canvas.addEventListener("click", (e) => {
    const { x, y } = toCanvasCoords(e);
    game.handleClick(x, y);
  });
  canvas.addEventListener("mousemove", (e) => {
    const { x, y } = toCanvasCoords(e);
    game.setMousePosition(x, y);
    canvas.style.cursor = game.isHoveringTitleButton(x, y) ? "pointer" : "default";
  });

  function loop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    game.update(dt);
    game.render();
    updateInputFrame();

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
