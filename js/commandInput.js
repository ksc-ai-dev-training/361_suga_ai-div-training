// 波動拳・スーパーアーツ・昇龍拳などのコマンド入力
// （↓↘→ / ↓↘→↓→ / →↓↘ + ボタン）を判定するための方向入力バッファ

const RETENTION = 1.2; // 秒。バッファに保持しておく最大期間（最も長いコマンド判定に合わせる）
const SIMPLE_WINDOW = 0.5; // 秒。波動拳（↓↘→）の入力猶予
const SUPER_WINDOW = 1.0; // 秒。スーパーアーツ（↓↘→↓→）の入力猶予
const DRAGON_PUNCH_WINDOW = 0.5; // 秒。昇龍拳（→↓↘）の入力猶予（仮値）

// 方向コード: 0=ニュートラル, 1=↓, 2=↘（↓+前）, 3=→（前）
export const DIR_NEUTRAL = 0;
export const DIR_DOWN = 1;
export const DIR_DOWN_FORWARD = 2;
export const DIR_FORWARD = 3;

const QCF = [DIR_DOWN, DIR_DOWN_FORWARD, DIR_FORWARD];
const SUPER_MOTION = [DIR_DOWN, DIR_DOWN_FORWARD, DIR_FORWARD, DIR_DOWN, DIR_FORWARD]; // ↓↘→↓→（スーパーアーツコマンド）
const DRAGON_PUNCH = [DIR_FORWARD, DIR_DOWN, DIR_DOWN_FORWARD];

export function createCommandBuffer() {
  return [];
}

// 方向が変化した瞬間だけ記録する（同じ方向を押し続けても増えない）
export function recordDirection(buffer, dir, now) {
  const last = buffer[buffer.length - 1];
  if (!last || last.dir !== dir) buffer.push({ dir, t: now });
  pruneOld(buffer, now);
}

function pruneOld(buffer, now) {
  while (buffer.length && now - buffer[0].t > RETENTION) buffer.shift();
}

// window秒以内の入力の中に、pattern の順番の部分列が存在すればtrue
function matchesSequence(buffer, now, window, pattern) {
  let idx = 0;
  for (const entry of buffer) {
    if (now - entry.t > window) continue;
    if (entry.dir === pattern[idx]) {
      idx++;
      if (idx === pattern.length) return true;
    }
  }
  return false;
}

// ↓ → ↘ → → （波動拳コマンド）
export function hasQuarterCircleForward(buffer, now) {
  return matchesSequence(buffer, now, SIMPLE_WINDOW, QCF);
}

// ↓ ↘ → ↓ →（スーパーアーツコマンド）
export function hasSuperArtsMotion(buffer, now) {
  return matchesSequence(buffer, now, SUPER_WINDOW, SUPER_MOTION);
}

// → ↓ ↘（昇龍拳コマンド）
export function hasDragonPunchMotion(buffer, now) {
  return matchesSequence(buffer, now, DRAGON_PUNCH_WINDOW, DRAGON_PUNCH);
}

export function clearBuffer(buffer) {
  buffer.length = 0;
}
