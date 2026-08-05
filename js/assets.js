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

// assets/ フォルダに背景・キャラクター画像を置くと自動的に読み込まれる。
// - assets/background.png     : ステージ背景
// - assets/player1.png        : P1キャラクター 立ち絵（透過PNG推奨、右向き）
// - assets/player1_crouch.png : P1キャラクター しゃがみ絵（無ければ立ち絵を使う）
// - assets/player2.png        : P2キャラクター 立ち絵（透過PNG推奨、右向き）
// - assets/player2_crouch.png : P2キャラクター しゃがみ絵（無ければ立ち絵を使う）
export async function loadAssets() {
  const [background, player1, player1Crouch, player2, player2Crouch] = await Promise.all([
    loadImage("assets/background.png"),
    loadImage("assets/player1.png"),
    loadImage("assets/player1_crouch.png"),
    loadImage("assets/player2.png"),
    loadImage("assets/player2_crouch.png"),
  ]);
  return { background, player1, player1Crouch, player2, player2Crouch };
}
