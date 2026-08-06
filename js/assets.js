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
const ATTACK_TYPES = ["punch", "kick"];
const ATTACK_STRENGTHS = ["light", "medium", "heavy"];
const ATTACK_PHASES = ["startup", "active"]; // recoveryは専用画像を用意せず、activeのポーズを流用する

// assets/{prefix}_walk1.png, _walk2.png, ... を連番で読み込み、存在するものだけを順番に配列で返す
async function loadWalkFrames(prefix) {
  const promises = [];
  for (let i = 1; i <= MAX_WALK_FRAMES; i++) {
    promises.push(loadImage(`assets/${prefix}_walk${i}.png`));
  }
  const results = await Promise.all(promises);
  return results.filter((img) => img !== null);
}

// assets/{prefix}_{type}_{strength}_{phase}.png （例: player1_punch_heavy_active.png）を
// 存在する組み合わせだけ読み込み、{ "punch_heavy": { startup, active }, ... } の形で返す
async function loadAttackSprites(prefix) {
  const result = {};
  const jobs = [];
  for (const type of ATTACK_TYPES) {
    for (const strength of ATTACK_STRENGTHS) {
      const key = `${type}_${strength}`;
      for (const phase of ATTACK_PHASES) {
        const job = loadImage(`assets/${prefix}_${key}_${phase}.png`).then((img) => {
          if (!img) return;
          if (!result[key]) result[key] = {};
          result[key][phase] = img;
        });
        jobs.push(job);
      }
    }
  }
  await Promise.all(jobs);
  return result;
}

// assets/ フォルダに背景・キャラクター画像を置くと自動的に読み込まれる。
// - assets/background.png     : ステージ背景
// - assets/player1.png        : P1キャラクター 立ち絵（透過PNG推奨、右向き）
// - assets/player1_crouch.png : P1キャラクター しゃがみ絵（無ければ立ち絵を使う）
// - assets/player1_walkN.png  : P1キャラクター 歩行コマ（N=1,2,3...連番。無ければ立ち絵のまま歩く）
// - assets/player1_{type}_{strength}_{phase}.png : 攻撃ポーズ（type=punch/kick, strength=light/medium/heavy,
//   phase=startup/active）。無ければ立ち絵のまま攻撃する
// - assets/player2.png / player2_crouch.png / player2_walkN.png / player2_{...}.png : P2側も同様
export async function loadAssets() {
  const [background, player1, player1Crouch, player2, player2Crouch, player1Walk, player2Walk, player1Attacks, player2Attacks] =
    await Promise.all([
      loadImage("assets/background.png"),
      loadImage("assets/player1.png"),
      loadImage("assets/player1_crouch.png"),
      loadImage("assets/player2.png"),
      loadImage("assets/player2_crouch.png"),
      loadWalkFrames("player1"),
      loadWalkFrames("player2"),
      loadAttackSprites("player1"),
      loadAttackSprites("player2"),
    ]);
  return { background, player1, player1Crouch, player2, player2Crouch, player1Walk, player2Walk, player1Attacks, player2Attacks };
}
