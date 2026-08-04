import { Game } from "./game.js";
import { updateInputFrame } from "./input.js";

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

function resizeCanvas() {
  const scale = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
  canvas.style.width = `${canvas.width * scale}px`;
  canvas.style.height = `${canvas.height * scale}px`;
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

const game = new Game(ctx, canvas.width, canvas.height);

let lastTime = performance.now();

function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  game.update(dt);
  game.render();
  updateInputFrame();

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
