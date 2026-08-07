const HUD_MARGIN = 20;
const PORTRAIT_SIZE = 60;
const BAR_WIDTH = 380;
const BAR_HEIGHT = 24;
const SUPER_BAR_WIDTH = 260;
const SUPER_BAR_HEIGHT = 16;
const TITLE_BUTTON_WIDTH = 220;
const TITLE_BUTTON_HEIGHT = 64;
const TITLE_BUTTON_GAP = 30;

// タイトル画面のSTARTボタンの矩形（描画・クリック判定の両方で共有する）。PRACTICEボタンの左に並ぶ
export function getTitleButtonRect(canvasWidth, canvasHeight) {
  return {
    x: canvasWidth / 2 - TITLE_BUTTON_GAP / 2 - TITLE_BUTTON_WIDTH,
    y: canvasHeight * 0.68,
    width: TITLE_BUTTON_WIDTH,
    height: TITLE_BUTTON_HEIGHT,
  };
}

// タイトル画面のPRACTICEボタンの矩形。STARTボタンの右に並ぶ
export function getPracticeButtonRect(canvasWidth, canvasHeight) {
  return {
    x: canvasWidth / 2 + TITLE_BUTTON_GAP / 2,
    y: canvasHeight * 0.68,
    width: TITLE_BUTTON_WIDTH,
    height: TITLE_BUTTON_HEIGHT,
  };
}

export function isPointInRect(x, y, rect) {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

// 対戦開始前のタイトル画面。ロゴ画像とSTART/PRACTICEボタンを表示する
export function drawTitleScreen(ctx, canvasWidth, canvasHeight, logoImage, isStartHovered, isPracticeHovered) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
  gradient.addColorStop(0, "#1a1a3a");
  gradient.addColorStop(1, "#3a1a2a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  if (logoImage) {
    const maxWidth = canvasWidth * 0.7;
    const maxHeight = canvasHeight * 0.4;
    const aspect = logoImage.naturalWidth / logoImage.naturalHeight;
    let drawWidth = maxWidth;
    let drawHeight = drawWidth / aspect;
    if (drawHeight > maxHeight) {
      drawHeight = maxHeight;
      drawWidth = drawHeight * aspect;
    }
    ctx.drawImage(logoImage, canvasWidth / 2 - drawWidth / 2, canvasHeight * 0.15, drawWidth, drawHeight);
  } else {
    // ロゴ画像が無い場合のフォールバック（テキストのみ）
    ctx.fillStyle = "#ffcc33";
    ctx.textAlign = "center";
    ctx.font = "bold 64px sans-serif";
    ctx.fillText("KogaFighter", canvasWidth / 2, canvasHeight * 0.35);
  }

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = "20px sans-serif";
  ctx.fillText("PLAYER vs CPU", canvasWidth / 2, canvasHeight * 0.6);

  drawTitleButton(ctx, getTitleButtonRect(canvasWidth, canvasHeight), "START", isStartHovered);
  drawTitleButton(ctx, getPracticeButtonRect(canvasWidth, canvasHeight), "PRACTICE", isPracticeHovered);

  ctx.fillStyle = "#ffffff";
  ctx.font = "16px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("クリック または Enterキーで対戦開始", canvasWidth / 2, canvasHeight * 0.68 + TITLE_BUTTON_HEIGHT + 32);
}

function drawTitleButton(ctx, btn, label, isHovered) {
  ctx.fillStyle = isHovered ? "#ffe27a" : "#ffcc33";
  ctx.fillRect(btn.x, btn.y, btn.width, btn.height);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.strokeRect(btn.x, btn.y, btn.width, btn.height);

  ctx.fillStyle = "#1a1a3a";
  ctx.textAlign = "center";
  ctx.font = "bold 24px sans-serif";
  ctx.fillText(label, btn.x + btn.width / 2, btn.y + btn.height / 2 + 9);
}

// HP・SUPERゲージ・ポートレート・名前・タイマー・獲得ラウンド数をまとめて描画する。
// roundWins/roundsToWinを渡さなければラウンドの丸印は表示しない（省略可能）
export function drawHud(ctx, player1, player2, canvasWidth, canvasHeight, timeRemaining, roundWins, roundsToWin) {
  drawSidePanel(ctx, player1, "1P", "PLAYER", canvasWidth, false, roundWins?.player1, roundsToWin);
  drawSidePanel(ctx, player2, "2P", "CPU", canvasWidth, true, roundWins?.player2, roundsToWin);
  drawTimer(ctx, canvasWidth, timeRemaining);
  drawSuperGauge(ctx, player1, canvasWidth, canvasHeight, false);
  drawSuperGauge(ctx, player2, canvasWidth, canvasHeight, true);
}

// reversed: 2P側（右側）はポートレート・バー・名前の並びを左右反転する
function drawSidePanel(ctx, player, cornerLabel, name, canvasWidth, reversed, wins, roundsToWin) {
  const portraitX = reversed ? canvasWidth - HUD_MARGIN - PORTRAIT_SIZE : HUD_MARGIN;
  const barY = HUD_MARGIN + 6;
  const barX = reversed ? portraitX - 10 - BAR_WIDTH : portraitX + PORTRAIT_SIZE + 10;

  drawPortrait(ctx, portraitX, HUD_MARGIN, player, cornerLabel);
  drawHealthBar(ctx, barX, barY, player, reversed);
  if (roundsToWin) drawRoundPips(ctx, barX, barY - 12, wins || 0, roundsToWin, reversed);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 16px sans-serif";
  ctx.textAlign = reversed ? "right" : "left";
  ctx.fillText(name, reversed ? barX + BAR_WIDTH : barX, barY + BAR_HEIGHT + 20);
}

// 獲得ラウンド数を丸印で表示する（塗りつぶし=獲得済み、輪郭のみ=未獲得）。HPバーの右上/左上に並べる
function drawRoundPips(ctx, barX, y, wins, roundsToWin, reversed) {
  const radius = 6;
  const gap = 16;
  for (let i = 0; i < roundsToWin; i++) {
    const offset = i * gap;
    const cx = reversed ? barX + BAR_WIDTH - offset - radius : barX + offset + radius;
    ctx.beginPath();
    ctx.arc(cx, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = i < wins ? "#ffcc33" : "rgba(255, 255, 255, 0.2)";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// 実在キャラクターの絵は使わず、プレイヤーの色を使った簡易的な自作アイコン
function drawPortrait(ctx, x, y, player, cornerLabel) {
  ctx.fillStyle = "#ffaa33";
  ctx.textAlign = "center";
  ctx.font = "bold 14px sans-serif";
  ctx.fillText(cornerLabel, x + PORTRAIT_SIZE / 2, y - 6);

  ctx.fillStyle = player.color;
  ctx.fillRect(x, y, PORTRAIT_SIZE, PORTRAIT_SIZE);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, PORTRAIT_SIZE, PORTRAIT_SIZE);

  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(x + PORTRAIT_SIZE * 0.35, y + PORTRAIT_SIZE * 0.42, 4, 0, Math.PI * 2);
  ctx.arc(x + PORTRAIT_SIZE * 0.65, y + PORTRAIT_SIZE * 0.42, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + PORTRAIT_SIZE / 2, y + PORTRAIT_SIZE * 0.6, 10, 0, Math.PI, false);
  ctx.stroke();
}

// reversed: 右側のバー（P2）は右端を基準に減らす
function drawHealthBar(ctx, x, y, player, reversed) {
  const ratio = player.hp / player.maxHp;
  const fillWidth = BAR_WIDTH * ratio;

  ctx.fillStyle = "#222222";
  ctx.fillRect(x, y, BAR_WIDTH, BAR_HEIGHT);

  ctx.fillStyle = ratio > 0.3 ? "#3ddc47" : "#e03c3c";
  const fillX = reversed ? x + BAR_WIDTH - fillWidth : x;
  ctx.fillRect(fillX, y, fillWidth, BAR_HEIGHT);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, BAR_WIDTH, BAR_HEIGHT);
}

// timeRemainingがnull（練習モードなど、タイマー無し）のときは"∞"を表示する
function drawTimer(ctx, canvasWidth, timeRemaining) {
  const label = timeRemaining === null ? "∞" : String(Math.ceil(timeRemaining)).padStart(2, "0");
  ctx.fillStyle = "#ffcc33";
  ctx.textAlign = "center";
  ctx.font = "bold 48px sans-serif";
  ctx.fillText(label, canvasWidth / 2, 60);
}

// reversed: 2P側（右側）はゲージ・ラベルの並びを左右反転する
function drawSuperGauge(ctx, player, canvasWidth, canvasHeight, reversed) {
  const y = canvasHeight - HUD_MARGIN - SUPER_BAR_HEIGHT;
  const x = reversed ? canvasWidth - HUD_MARGIN - SUPER_BAR_WIDTH : HUD_MARGIN;
  const ratio = player.superGauge / player.maxSuperGauge;
  const fillWidth = SUPER_BAR_WIDTH * ratio;
  const isFull = ratio >= 1;

  ctx.fillStyle = "#222222";
  ctx.fillRect(x, y, SUPER_BAR_WIDTH, SUPER_BAR_HEIGHT);

  ctx.fillStyle = isFull ? "#ffcc33" : "#3399ff";
  const fillX = reversed ? x + SUPER_BAR_WIDTH - fillWidth : x;
  ctx.fillRect(fillX, y, fillWidth, SUPER_BAR_HEIGHT);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, SUPER_BAR_WIDTH, SUPER_BAR_HEIGHT);

  ctx.fillStyle = isFull ? "#ffcc33" : "#ffffff";
  ctx.font = "bold 14px sans-serif";
  ctx.textAlign = reversed ? "right" : "left";
  ctx.textBaseline = "middle";
  ctx.fillText("SUPER", reversed ? x - 10 : x + SUPER_BAR_WIDTH + 10, y + SUPER_BAR_HEIGHT / 2);
  ctx.textBaseline = "alphabetic"; // 以降の描画に影響しないよう戻す
}

// 対戦開始前の「ROUND N」→「FIGHT!」演出。背景は暗くせず、選手の立ち姿はそのまま見せる
export function drawIntroOverlay(ctx, canvasWidth, canvasHeight, phase, roundNumber) {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  ctx.textAlign = "center";
  ctx.lineJoin = "round";

  if (phase === "ready") {
    ctx.font = "bold 72px sans-serif";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#000000";
    const label = roundNumber ? `ROUND ${roundNumber}` : "READY";
    ctx.strokeText(label, centerX, centerY);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, centerX, centerY);
  } else if (phase === "fight") {
    ctx.font = "bold 100px sans-serif";
    ctx.lineWidth = 10;
    ctx.strokeStyle = "#000000";
    ctx.strokeText("FIGHT!", centerX, centerY);
    ctx.fillStyle = "#ff3333";
    ctx.fillText("FIGHT!", centerX, centerY);
  }
}

// 1ラウンドの決着表示（次のラウンドへ自動で進むため、暗転もリスタート案内も無い軽量版）
export function drawRoundResult(ctx, canvasWidth, canvasHeight, winnerLabel, headerLabel = "K.O.") {
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;

  ctx.textAlign = "center";
  ctx.lineJoin = "round";

  ctx.font = "bold 56px sans-serif";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#000000";
  ctx.strokeText(headerLabel, centerX, centerY - 10);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(headerLabel, centerX, centerY - 10);

  ctx.font = "bold 28px sans-serif";
  ctx.lineWidth = 5;
  ctx.strokeText(winnerLabel, centerX, centerY + 40);
  ctx.fillStyle = "#ffcc33";
  ctx.fillText(winnerLabel, centerX, centerY + 40);
}

export function drawMatchResult(ctx, canvasWidth, canvasHeight, winnerLabel, headerLabel = "K.O.", roundWins) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  ctx.font = "bold 64px sans-serif";
  ctx.fillText(headerLabel, canvasWidth / 2, canvasHeight / 2 - 20);

  ctx.font = "28px sans-serif";
  ctx.fillText(winnerLabel, canvasWidth / 2, canvasHeight / 2 + 30);

  if (roundWins) {
    ctx.font = "20px sans-serif";
    ctx.fillText(`${roundWins.player1} - ${roundWins.player2}`, canvasWidth / 2, canvasHeight / 2 + 65);
  }

  ctx.font = "20px sans-serif";
  ctx.fillText("Rキーでリスタート", canvasWidth / 2, canvasHeight / 2 + (roundWins ? 100 : 70));
}

const HELP_LINES = [
  "移動: A / D",
  "ジャンプ: W（A/Dと同時押しで前・後ジャンプ）",
  "しゃがみ: S",
  "ガード: 後ろ方向（向いている方向と逆のA/D）",
  "弱 / 中 / 強パンチ: U / I / O",
  "弱 / 中 / 強キック: J / K / L",
  "波動拳: ↓ ↘ → の後にパンチ",
  "スーパーアーツ: 波動拳コマンドを2回連続の後にパンチ（SUPERゲージ満タン時のみ）",
  "昇龍拳: → ↓ ↘ の後にパンチ",
  "リスタート（決着後のみ）: R",
];

export function drawHelpOverlay(ctx, canvasWidth, canvasHeight) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";

  ctx.font = "bold 36px sans-serif";
  ctx.fillText("操作説明", canvasWidth / 2, 90);

  ctx.font = "20px sans-serif";
  const lineHeight = 34;
  const startY = 150;
  HELP_LINES.forEach((line, i) => {
    ctx.fillText(line, canvasWidth / 2, startY + i * lineHeight);
  });

  ctx.font = "18px sans-serif";
  ctx.fillText("ESCキーで閉じる", canvasWidth / 2, startY + HELP_LINES.length * lineHeight + 30);
}
