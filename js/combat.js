// フレームデータは60fps基準の「フレーム数」で管理し、秒に変換して使う
const FPS = 60;
const framesToSeconds = (frames) => frames / FPS;

// ガード成功時のダメージ倍率（削りダメージ）。高中低の区別はなく、ガード中は常にこの割合を受ける
export const GUARD_CHIP_RATIO = 0.1;

// SUPERゲージの増加量 = ダメージ量 × この係数。攻撃側・防御側の両方に加算される（仮値）
export const SUPER_GAUGE_GAIN_RATE = 0.03;

// 技データ（startup=発生, active=持続フレーム数, recovery=硬直, damage=与えるダメージ量,
//           hitstun=ヒット時に相手が動けなくなるフレーム数, blockstun=ガード時に相手が動けなくなるフレーム数）
// 発生・持続・硬直・ダメージ・硬直差は参考にしたフレームデータ表の「立ち技」の値と一致させている。
// hitstun/blockstunは表の「硬直差」列から逆算した値（硬直差 = 相手の硬直 - 自分のrecovery なので、
// 相手の硬直 = 硬直差 + recovery）。range/height/offsetY（当たり判定のサイズ・位置）は表に記載がないため、
// 既存の値を踏襲している。
export const PUNCH_DATA = {
  light: { startup: framesToSeconds(4), active: framesToSeconds(3), recovery: framesToSeconds(7), range: 45, height: 40, offsetY: 70, damage: 300, hitstun: framesToSeconds(11), blockstun: framesToSeconds(6) },
  medium: { startup: framesToSeconds(6), active: framesToSeconds(4), recovery: framesToSeconds(11), range: 60, height: 50, offsetY: 60, damage: 600, hitstun: framesToSeconds(18), blockstun: framesToSeconds(10) },
  heavy: { startup: framesToSeconds(10), active: framesToSeconds(5), recovery: framesToSeconds(18), range: 75, height: 60, offsetY: 50, damage: 800, hitstun: framesToSeconds(22), blockstun: framesToSeconds(16) },
};

export const KICK_DATA = {
  light: { startup: framesToSeconds(5), active: framesToSeconds(3), recovery: framesToSeconds(11), range: 55, height: 45, offsetY: 130, damage: 300, hitstun: framesToSeconds(13), blockstun: framesToSeconds(7) },
  medium: { startup: framesToSeconds(9), active: framesToSeconds(3), recovery: framesToSeconds(18), range: 70, height: 55, offsetY: 120, damage: 700, hitstun: framesToSeconds(22), blockstun: framesToSeconds(14) },
  heavy: { startup: framesToSeconds(12), active: framesToSeconds(4), recovery: framesToSeconds(20), range: 85, height: 65, offsetY: 110, damage: 900, hitstun: framesToSeconds(29), blockstun: framesToSeconds(21) },
};

// しゃがみ技データ（しゃがみ状態自体が未実装のため未使用。実装したら使用する）
// フレーム・ダメージ・硬直差は表の「しゃがみ技」の値と一致させている。
// しゃがみ強Kの「ダウン（相手を転倒させる）」効果は未実装のため、代わりに長めのhitstun（仮値）を割り当てている。
export const CROUCH_PUNCH_DATA = {
  light: { startup: framesToSeconds(4), active: framesToSeconds(2), recovery: framesToSeconds(9), range: 45, height: 35, offsetY: 100, damage: 300, hitstun: framesToSeconds(13), blockstun: framesToSeconds(8) },
  medium: { startup: framesToSeconds(6), active: framesToSeconds(4), recovery: framesToSeconds(13), range: 60, height: 40, offsetY: 90, damage: 600, hitstun: framesToSeconds(18), blockstun: framesToSeconds(13) },
  heavy: { startup: framesToSeconds(9), active: framesToSeconds(6), recovery: framesToSeconds(22), range: 75, height: 45, offsetY: 80, damage: 800, hitstun: framesToSeconds(23), blockstun: framesToSeconds(15) },
};

export const CROUCH_KICK_DATA = {
  light: { startup: framesToSeconds(5), active: framesToSeconds(2), recovery: framesToSeconds(10), range: 55, height: 40, offsetY: 150, damage: 200, hitstun: framesToSeconds(13), blockstun: framesToSeconds(9) },
  medium: { startup: framesToSeconds(8), active: framesToSeconds(3), recovery: framesToSeconds(19), range: 70, height: 50, offsetY: 140, damage: 500, hitstun: framesToSeconds(20), blockstun: framesToSeconds(13) },
  heavy: { startup: framesToSeconds(9), active: framesToSeconds(3), recovery: framesToSeconds(23), range: 85, height: 60, offsetY: 130, damage: 900, hitstun: framesToSeconds(45), blockstun: framesToSeconds(11) }, // 本来はヒット時ダウン(D)効果があるが未実装。hitstunは仮の代替値
};

// 必殺技。isProjectile:true の場合、本体には打撃判定を持たせず、
// active フェーズに入った瞬間に projectile 設定を使って飛び道具を1つ生成する
// ダメージ・hitstun/blockstunはHP=10000のスケールに合わせて設定（表に必殺技の記載はないため独自設定、仮値）
export const SPECIAL_DATA = {
  hadouken: {
    startup: framesToSeconds(13),
    active: 0.05,
    recovery: 0.35,
    range: 0,
    height: 0,
    offsetY: 0,
    damage: 0,
    isProjectile: true,
    projectile: { speed: 600, width: 40, height: 30, damage: 1000, offsetY: 90, color: "#33ccff", hitstun: framesToSeconds(25), blockstun: framesToSeconds(14) },
  },
  // スーパーアーツ（↓↘→↓↘→+パンチ）。通常の波動拳より高威力・大型・高速
  hadoukenSuper: {
    startup: framesToSeconds(18),
    active: 0.06,
    recovery: 0.5,
    range: 0,
    height: 0,
    offsetY: 0,
    damage: 0,
    isProjectile: true,
    projectile: { speed: 700, width: 70, height: 50, damage: 3000, offsetY: 80, color: "#ff6600", hitstun: framesToSeconds(40), blockstun: framesToSeconds(22) },
  },
};

export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}
