// フレームデータは60fps基準の「フレーム数」で管理し、秒に変換して使う
const FPS = 60;
const framesToSeconds = (frames) => frames / FPS;

// 技データ（startup=発生, active=持続, recovery=硬直）
export const PUNCH_DATA = {
  light: { startup: framesToSeconds(6), active: 0.07, recovery: 0.15, range: 45, height: 40, offsetY: 70 },
  medium: { startup: framesToSeconds(8), active: 0.09, recovery: 0.22, range: 60, height: 50, offsetY: 60 },
  heavy: { startup: framesToSeconds(13), active: 0.11, recovery: 0.32, range: 75, height: 60, offsetY: 50 },
};

// しゃがみパンチ用データ（フェーズ7でしゃがみ状態を実装したら使用する）
export const CROUCH_PUNCH_DATA = {
  light: { startup: framesToSeconds(5), active: 0.07, recovery: 0.15, range: 45, height: 35, offsetY: 100 },
  medium: { startup: framesToSeconds(7), active: 0.09, recovery: 0.22, range: 60, height: 40, offsetY: 90 },
  heavy: { startup: framesToSeconds(10), active: 0.11, recovery: 0.32, range: 75, height: 45, offsetY: 80 },
};

export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
