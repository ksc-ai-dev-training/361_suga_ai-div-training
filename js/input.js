const keysDown = new Set();
const prevKeysDown = new Set();

window.addEventListener("keydown", (e) => keysDown.add(e.code));
window.addEventListener("keyup", (e) => keysDown.delete(e.code));

export function isKeyDown(code) {
  return keysDown.has(code);
}

// キーが押された瞬間（1フレームのみtrue）。攻撃のような単発入力に使う
export function isKeyJustPressed(code) {
  return keysDown.has(code) && !prevKeysDown.has(code);
}

// 毎フレームの最後に呼び、次フレームの「押された瞬間」判定の基準を更新する
export function updateInputFrame() {
  prevKeysDown.clear();
  for (const key of keysDown) prevKeysDown.add(key);
}
