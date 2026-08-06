// キャラクター・背景の画像を読み込む。ファイルが無い/読み込みに失敗しても
// ゲームは止めず、呼び出し側が null を受け取って既存の図形描画にフォールバックする。
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const MAX_WALK_FRAMES = 8; // player{1,2}_walk1.png 〜 walk8.png まで試しに読み込む（存在しない分は無視される）
const MAX_CROUCH_TRANSITION_FRAMES = 4; // player{1,2}_crouch_transition1.png 〜 transition4.png まで試す
const MAX_PHASE_FRAMES = 6; // 1フェーズあたり最大何コマまで試すか（例: startup1.png 〜 startup6.png）
const ATTACK_STRENGTHS_BY_TYPE = {
  punch: ["light", "medium", "heavy"],
  kick: ["light", "medium", "heavy"],
  special: ["hadouken", "hadoukenSuper"],
};
const ATTACK_PHASES = ["startup", "active"]; // recoveryは専用画像を用意せず、activeの最終コマを流用する

// assets/{baseName}1.png, {baseName}2.png, ... を連番で読み込み、存在するものだけを順番に配列で返す
async function loadNumberedFrames(baseName, maxCount) {
  const promises = [];
  for (let i = 1; i <= maxCount; i++) {
    promises.push(loadImage(`assets/${baseName}${i}.png`));
  }
  const results = await Promise.all(promises);
  return results.filter((img) => img !== null);
}

// assets/{prefix}_{type}_{strength}_{phase}{N}.png （例: player1_special_hadouken_startup1.png）を
// 存在する組み合わせだけ読み込み、{ "punch_heavy": { startup: [img,...], active: [img,...] }, ... } の形で返す。
// フェーズごとに複数コマ（N=1,2,3...）用意すれば、そのフェーズの経過時間に応じて順番に再生される
async function loadAttackSprites(prefix) {
  const result = {};
  const jobs = [];
  for (const type of Object.keys(ATTACK_STRENGTHS_BY_TYPE)) {
    for (const strength of ATTACK_STRENGTHS_BY_TYPE[type]) {
      const key = `${type}_${strength}`;
      for (const phase of ATTACK_PHASES) {
        for (let n = 1; n <= MAX_PHASE_FRAMES; n++) {
          const job = loadImage(`assets/${prefix}_${key}_${phase}${n}.png`).then((img) => {
            if (!img) return;
            if (!result[key]) result[key] = {};
            if (!result[key][phase]) result[key][phase] = [];
            result[key][phase][n - 1] = img;
          });
          jobs.push(job);
        }
      }
    }
  }
  await Promise.all(jobs);
  // 番号が飛んでいる場合に配列に穴が空くことがあるので詰める
  for (const key in result) {
    for (const phase in result[key]) {
      result[key][phase] = result[key][phase].filter(Boolean);
    }
  }
  return result;
}

// assets/ フォルダに背景・キャラクター画像を置くと自動的に読み込まれる。
// - assets/background.png     : ステージ背景
// - assets/player1.png        : P1キャラクター 立ち絵（透過PNG推奨、右向き）
// - assets/player1_crouch.png : P1キャラクター しゃがみ絵（無ければ立ち絵を使う）
// - assets/player1_walkN.png  : P1キャラクター 歩行コマ（N=1,2,3...連番。無ければ立ち絵のまま歩く）
// - assets/player1_crouch_transitionN.png : 立ち⇔しゃがみの遷移コマ（N=1,2,3...連番。無ければ遷移なしで
//   即座にしゃがみ絵に切り替わる）
// - assets/player1_guard.png  : P1キャラクター ガード絵（無ければ通常のポーズのまま暗く色が乗る）
// - assets/player1_{type}_{strength}_{phase}{N}.png : 攻撃ポーズ（type=punch/kick/special,
//   strength=light/medium/heavy または hadouken/hadoukenSuper, phase=startup/active, N=1,2,3...連番）。
//   無ければ立ち絵のまま攻撃する
// - assets/player2.png / player2_crouch.png / player2_walkN.png / player2_{...}.png : P2側も同様
export async function loadAssets() {
  const [
    background,
    player1,
    player1Crouch,
    player2,
    player2Crouch,
    player1Walk,
    player2Walk,
    player1CrouchTransition,
    player2CrouchTransition,
    player1Guard,
    player2Guard,
    player1Attacks,
    player2Attacks,
  ] = await Promise.all([
    loadImage("assets/background.png"),
    loadImage("assets/player1.png"),
    loadImage("assets/player1_crouch.png"),
    loadImage("assets/player2.png"),
    loadImage("assets/player2_crouch.png"),
    loadNumberedFrames("player1_walk", MAX_WALK_FRAMES),
    loadNumberedFrames("player2_walk", MAX_WALK_FRAMES),
    loadNumberedFrames("player1_crouch_transition", MAX_CROUCH_TRANSITION_FRAMES),
    loadNumberedFrames("player2_crouch_transition", MAX_CROUCH_TRANSITION_FRAMES),
    loadImage("assets/player1_guard.png"),
    loadImage("assets/player2_guard.png"),
    loadAttackSprites("player1"),
    loadAttackSprites("player2"),
  ]);
  return {
    background,
    player1,
    player1Crouch,
    player2,
    player2Crouch,
    player1Walk,
    player2Walk,
    player1CrouchTransition,
    player2CrouchTransition,
    player1Guard,
    player2Guard,
    player1Attacks,
    player2Attacks,
  };
}
