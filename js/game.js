import { Player, MOVE_SPEED, BACKWARD_MOVE_SPEED, PUSH_SPEED } from "./player.js";
import { GROUND_Y, drawStage } from "./stage.js";
import { isKeyDown, isKeyJustPressed } from "./input.js";
import {
  PUNCH_DATA,
  KICK_DATA,
  CROUCH_PUNCH_DATA,
  CROUCH_KICK_DATA,
  SPECIAL_DATA,
  GUARD_CHIP_RATIO,
  SUPER_GAUGE_GAIN_RATE,
  HITSTOP_HIT_DURATION,
  HITSTOP_BLOCK_DURATION,
  rectsOverlap,
} from "./combat.js";
import {
  drawHud,
  drawMatchResult,
  drawRoundResult,
  drawHelpOverlay,
  drawIntroOverlay,
  drawTitleScreen,
  drawOnlineLobbyScreen,
  getTitleButtonRect,
  getPracticeButtonRect,
  getVersusButtonRect,
  getOnlineButtonRect,
  isPointInRect,
} from "./ui.js";
import { Projectile } from "./projectile.js";
import { CpuController } from "./ai.js";
import { createLocalInputSource, createRemoteInputSource, captureLocalActionState } from "./inputSource.js";
import {
  createCommandBuffer,
  recordDirection,
  hasQuarterCircleForward,
  hasSuperArtsMotion,
  hasDragonPunchMotion,
  clearBuffer,
  DIR_NEUTRAL,
  DIR_DOWN,
  DIR_DOWN_FORWARD,
  DIR_FORWARD,
} from "./commandInput.js";

const MOTION_GRACE = 0.25; // 秒。↘入力からこの時間は歩行を抑制する
const ROUND_TIME = 99; // 秒。ラウンドの持ち時間（タイムアップ時はHPが多い方の勝ち）
const READY_DURATION = 1.2; // 秒。「READY」表示の時間（仮値）
const FIGHT_DURATION = 0.8; // 秒。「FIGHT!」表示の時間（仮値）
const ROUNDS_TO_WIN = 2; // 先取本数（仮値）。2本先取＝3本勝負（best of 3）
const ROUND_RESULT_DURATION = 2.0; // 秒。ラウンド決着後、次のラウンドに進むまでの表示時間（仮値）

// 1P（キーボード）のキー割り当て
const P1_KEYS = {
  left: "KeyA",
  right: "KeyD",
  up: "KeyW",
  down: "KeyS",
  punchLight: "KeyU",
  punchMedium: "KeyI",
  punchHeavy: "KeyO",
  kickLight: "KeyJ",
  kickMedium: "KeyK",
  kickHeavy: "KeyL",
};
// 2P（VS 2Pモード時のみ）のキー割り当て。矢印キー＋テンキー
const P2_KEYS = {
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  punchLight: "Numpad1",
  punchMedium: "Numpad2",
  punchHeavy: "Numpad3",
  kickLight: "Numpad4",
  kickMedium: "Numpad5",
  kickHeavy: "Numpad6",
};

// オンライン対戦（簡易版）: ホストが毎フレーム送る状態スナップショット用のシリアライズ処理。
// attack.dataはPUNCH_DATA等の共有の静的テーブルへの参照であり、そのまま送信できないため、
// 描画・当たり判定の表示に必要な数値だけを抜き出してプレーンオブジェクト化する
function serializeAttack(attack) {
  if (!attack) return null;
  return {
    type: attack.type,
    strength: attack.strength,
    phase: attack.phase,
    timer: attack.timer,
    hasHit: attack.hasHit,
    data: {
      startup: attack.data.startup,
      active: attack.data.active,
      recovery: attack.data.recovery,
      range: attack.data.range,
      height: attack.data.height,
      offsetY: attack.data.offsetY,
      isProjectile: !!attack.data.isProjectile,
    },
  };
}

function serializePlayer(player) {
  return {
    x: player.x,
    y: player.y,
    width: player.width,
    height: player.height,
    facing: player.facing,
    hp: player.hp,
    superGauge: player.superGauge,
    isCrouching: player.isCrouching,
    isGuarding: player.isGuarding,
    isGrounded: player.isGrounded,
    isWalking: player.isWalking,
    walkCycleDistance: player.walkCycleDistance,
    vy: player.vy,
    vx: player.vx,
    crouchTransitionProgress: player.crouchTransitionProgress,
    hitFlashTimer: player.hitFlashTimer,
    guardFlashTimer: player.guardFlashTimer,
    hitstunTimer: player.hitstunTimer,
    blockstunTimer: player.blockstunTimer,
    downTimer: player.downTimer,
    jumpSquatTimer: player.jumpSquatTimer,
    knockbackVx: player.knockbackVx,
    attack: serializeAttack(player.attack),
  };
}

// 参加側（joiner）のPlayerインスタンスへ、受信したスナップショットの値をそのまま反映する。
// attackはネットワーク越しの表示専用の簡易オブジェクトに置き換わる（参加側は当たり判定の計算をしないため問題ない）
function applyPlayerSnapshot(player, snap) {
  Object.assign(player, snap);
}

function serializeProjectile(p) {
  return {
    x: p.x,
    y: p.y,
    width: p.width,
    height: p.height,
    direction: p.direction,
    color: p.color,
    animTimer: p.animTimer,
    hasSprites: !!p.sprites,
  };
}

export class Game {
  constructor(ctx, canvasWidth, canvasHeight, assets = {}) {
    this.ctx = ctx;
    this.width = canvasWidth;
    this.height = canvasHeight;
    this.assets = assets; // { background, player1, player2 }（画像。無ければnull）

    this.createPlayers();
    this.matchOver = false; // マッチ全体（先取本数に達した）の決着。ラウンドごとの決着とは別
    this.winner = null;
    this.endReason = null; // "ko" | "timeup"
    this.projectiles = [];
    this.commandBuffer1 = createCommandBuffer();
    this.commandBuffer2 = createCommandBuffer(); // VS 2Pモードで2Pのコマンド技判定に使う（それ以外のモードでは未使用）
    this.elapsed = 0;
    this.timeRemaining = ROUND_TIME;
    this.showHelp = false;
    this.roundWins = { player1: 0, player2: 0 }; // 各プレイヤーの獲得ラウンド数
    this.currentRound = 1;
    this.hitStopTimer = 0; // ヒット/ガード成功の瞬間、この時間だけ試合全体を停止する
    // "vs"（通常対戦、CPU）| "practice"（練習モード。CPU停止・タイマー無制限・HP自動回復）
    // | "2p"（同じキーボードでの2人対戦、CPU停止）| "online"（ネットワーク越しの2人対戦、CPU停止）
    this.mode = "vs";
    // "title"（タイトル画面、STARTなどのボタン待ち）→（"onlineLobby"（オンライン接続待ち。ONLINE選択時のみ経由）→）
    // "ready" → "fight" → "playing" → "roundEnd"
    // （decided winnerの場合はplayingに戻らずmatchOver、そうでなければ次ラウンドの"ready"へ）の順に進む。
    // playingになるまで対戦は始まらない
    this.introPhase = "title";
    this.introTimer = 0;
    this.mouseX = -1;
    this.mouseY = -1; // タイトル画面のボタンのホバー表示に使う（canvas内座標）

    // 入力ソース（ローカルのキーボード / ネットワーク越しのリモート操作を同じインターフェースで扱う）
    this.player1Input = createLocalInputSource(P1_KEYS); // 常にこのPC・このブラウザのキーボードでP1を操作する
    this.player2LocalInput = createLocalInputSource(P2_KEYS); // "2p"モード（同じキーボード）でのみ使用
    this.remoteInput = createRemoteInputSource(); // "online"モードのホスト側で、参加側から受信した入力を保持する

    // オンライン対戦（簡易版）関連
    this.onlineRole = null; // "host" | "joiner" | null
    this.network = null; // NetworkSessionインスタンス（js/network.js）。main.js側で接続確立後にセットされる
  }

  setMousePosition(x, y) {
    this.mouseX = x;
    this.mouseY = y;
  }

  createPlayers() {
    this.player1 = new Player({
      x: 250, groundY: GROUND_Y, color: "#3366ff", facing: 1,
      sprite: this.assets.player1, crouchSprite: this.assets.player1Crouch,
      walkSprites: this.assets.player1Walk, crouchTransitionSprites: this.assets.player1CrouchTransition,
      guardSprite: this.assets.player1Guard, hitSprite: this.assets.player1Hit,
      jumpSprites: this.assets.player1Jump,
      attackSprites: this.assets.player1Attacks,
      downLaunchedSprite: this.assets.player1DownLaunched, downLyingSprite: this.assets.player1DownLying,
      koSprite: this.assets.player1Ko,
    });
    this.player2 = new Player({
      x: 850, groundY: GROUND_Y, color: "#ff3333", facing: -1,
      sprite: this.assets.player2, crouchSprite: this.assets.player2Crouch,
      walkSprites: this.assets.player2Walk, crouchTransitionSprites: this.assets.player2CrouchTransition,
      guardSprite: this.assets.player2Guard, hitSprite: this.assets.player2Hit,
      jumpSprites: this.assets.player2Jump,
      attackSprites: this.assets.player2Attacks,
      downLaunchedSprite: this.assets.player2DownLaunched, downLyingSprite: this.assets.player2DownLying,
      koSprite: this.assets.player2Ko,
    });
    this.cpu = new CpuController(this.player2, this.player1, {
      hasOwnProjectile: () => this.hasActiveProjectile(this.player2),
      canvasWidth: this.width,
    });
  }

  // マッチ全体を最初からやり直す（決着後のRキー）。獲得ラウンド数もリセットする
  restart() {
    this.roundWins = { player1: 0, player2: 0 };
    this.currentRound = 1;
    this.matchOver = false;
    this.startRound();
  }

  // 1ラウンド分の状態（プレイヤー・弾・タイマー等）をリセットしてREADYから始める。
  // 獲得ラウンド数(roundWins)はリセットしない（restart()側で必要なときだけ別途リセットする）
  startRound() {
    this.createPlayers();
    this.winner = null;
    this.endReason = null;
    this.projectiles = [];
    clearBuffer(this.commandBuffer1);
    clearBuffer(this.commandBuffer2);
    this.timeRemaining = ROUND_TIME;
    this.introPhase = "ready";
    this.introTimer = READY_DURATION;
  }

  // タイトル画面のSTART/PRACTICE/VS 2Pボタンが押された（またはEnterキーが押された）ときに対戦を始める。
  // mode: "vs"（通常対戦、CPU有効）| "practice"（練習モード、CPU停止・タイマー無制限・HP自動回復）
  // | "2p"（2人対戦、CPU停止・2PはP2_KEYSで操作）
  startBattle(mode = "vs") {
    if (this.introPhase !== "title") return;
    this.mode = mode;
    this.introPhase = "ready";
    this.introTimer = READY_DURATION;
  }

  // 練習モード中にタイトル画面へ戻る
  returnToTitle() {
    this.introPhase = "title";
    this.mode = "vs";
  }

  // canvas内座標(x, y)へのクリックを受け取る。タイトル画面のSTART/PRACTICE/VS 2P/ONLINEボタン判定にのみ使う
  handleClick(x, y) {
    if (this.introPhase !== "title") return;
    if (isPointInRect(x, y, getTitleButtonRect(this.width, this.height))) this.startBattle("vs");
    else if (isPointInRect(x, y, getPracticeButtonRect(this.width, this.height))) this.startBattle("practice");
    else if (isPointInRect(x, y, getVersusButtonRect(this.width, this.height))) this.startBattle("2p");
    else if (isPointInRect(x, y, getOnlineButtonRect(this.width, this.height))) this.showOnlineLobby();
  }

  // canvas内座標(x, y)がタイトル画面の各ボタン上にあるか（カーソル表示の切り替えに使う）
  isHoveringStartButton(x, y) {
    if (this.introPhase !== "title") return false;
    return isPointInRect(x, y, getTitleButtonRect(this.width, this.height));
  }

  isHoveringPracticeButton(x, y) {
    if (this.introPhase !== "title") return false;
    return isPointInRect(x, y, getPracticeButtonRect(this.width, this.height));
  }

  isHoveringVersusButton(x, y) {
    if (this.introPhase !== "title") return false;
    return isPointInRect(x, y, getVersusButtonRect(this.width, this.height));
  }

  isHoveringOnlineButton(x, y) {
    if (this.introPhase !== "title") return false;
    return isPointInRect(x, y, getOnlineButtonRect(this.width, this.height));
  }

  // ONLINEボタンが押されたときにオンライン接続画面へ進む。実際の接続操作はHTML側のパネル（main.js）で行う
  showOnlineLobby() {
    if (this.introPhase !== "title") return;
    this.introPhase = "onlineLobby";
  }

  // オンライン接続画面から（「戻る」ボタンなどで）タイトルへ戻る。進行中の接続があれば閉じる
  exitOnlineLobby() {
    if (this.network) this.network.close();
    this.network = null;
    this.onlineRole = null;
    this.mode = "vs";
    this.introPhase = "title";
  }

  // main.js側でPeerJSの接続が確立した直後に呼ばれる。role: "host" | "joiner"
  beginOnlineMatch(role, network) {
    this.onlineRole = role;
    this.network = network;
    this.mode = "online";
    network.onData = (msg) => this.handleNetworkMessage(msg);
    network.onDisconnected = () => this.handleNetworkDisconnected();
    this.introPhase = "ready";
    this.introTimer = READY_DURATION;
  }

  handleNetworkMessage(msg) {
    if (!msg) return;
    if (msg.type === "input" && this.onlineRole === "host") {
      this.remoteInput.applyState(msg.input);
    } else if (msg.type === "state" && this.onlineRole === "joiner") {
      this.applyStateSnapshot(msg);
    }
  }

  // 簡易版のため、対戦中に切断された場合は特別な復帰処理を行わずタイトルへ戻す
  handleNetworkDisconnected() {
    if (this.network) this.network.close();
    this.network = null;
    this.onlineRole = null;
    this.mode = "vs";
    this.introPhase = "title";
  }

  // ホスト側: このフレームのシミュレーション結果を丸ごと参加側へ送信するためのスナップショットを作る
  buildStateSnapshot() {
    return {
      type: "state",
      player1: serializePlayer(this.player1),
      player2: serializePlayer(this.player2),
      projectiles: this.projectiles.map(serializeProjectile),
      introPhase: this.introPhase,
      currentRound: this.currentRound,
      roundWins: this.roundWins,
      winnerIndex: this.winner === this.player1 ? 0 : this.winner === this.player2 ? 1 : null,
      endReason: this.endReason,
      matchOver: this.matchOver,
      timeRemaining: this.timeRemaining,
    };
  }

  // 参加側: ホストから届いたスナップショットをそのまま自分の表示状態へ反映する（シミュレーションは一切行わない）
  applyStateSnapshot(snap) {
    applyPlayerSnapshot(this.player1, snap.player1);
    applyPlayerSnapshot(this.player2, snap.player2);
    this.projectiles = snap.projectiles.map((s) => {
      const projectile = new Projectile({
        x: s.x,
        y: s.y,
        direction: s.direction,
        owner: null,
        config: { width: s.width, height: s.height, damage: 0, speed: 0, color: s.color, hitstun: 0, blockstun: 0 },
        sprites: s.hasSprites ? this.assets.hadoukenSprites : null,
      });
      projectile.animTimer = s.animTimer;
      return projectile;
    });
    this.introPhase = snap.introPhase;
    this.currentRound = snap.currentRound;
    this.roundWins = snap.roundWins;
    this.winner = snap.winnerIndex === 0 ? this.player1 : snap.winnerIndex === 1 ? this.player2 : null;
    this.endReason = snap.endReason;
    this.matchOver = snap.matchOver;
    this.timeRemaining = snap.timeRemaining;
  }

  // 「READY」→「FIGHT!」→（ラウンド終了後）「roundEnd」の演出中はタイマーを進めず、入力も一切受け付けない
  updateIntro(dt) {
    this.introTimer -= dt;
    if (this.introTimer > 0) return;

    if (this.introPhase === "ready") {
      this.introPhase = "fight";
      this.introTimer = FIGHT_DURATION;
    } else if (this.introPhase === "fight") {
      this.introPhase = "playing";
    } else if (this.introPhase === "roundEnd") {
      this.advanceRound();
    }
  }

  // ラウンド決着後、先取本数に達していればマッチ終了、そうでなければ次のラウンドを始める
  advanceRound() {
    if (this.roundWins.player1 >= ROUNDS_TO_WIN || this.roundWins.player2 >= ROUNDS_TO_WIN) {
      this.matchOver = true;
      // "roundEnd"のままだと毎フレームここに来てしまうため、"playing"に戻して
      // 以降は通常のmatchOver処理（Rキー待ち）に委ねる
      this.introPhase = "playing";
      return;
    }
    this.currentRound++;
    this.startRound();
  }

  // オンライン対戦の参加側（joiner）以外はこちらが毎フレーム呼ばれる（ホスト・ローカルモード共通）。
  // ホストの場合は、シミュレーション後にその結果を状態スナップショットとして参加側へ送信する
  update(dt) {
    if (this.mode === "online" && this.onlineRole === "joiner") {
      this.updateJoinerNetworking();
      return;
    }

    this.updateLocalSimulation(dt);

    if (this.mode === "online" && this.onlineRole === "host" && this.network) {
      this.network.send(this.buildStateSnapshot());
    }
  }

  // オンライン対戦の参加側は自分でシミュレーションを行わず、ローカル入力を送信して
  // ホストから届く状態スナップショットを待つだけ（applyStateSnapshotで反映される）
  updateJoinerNetworking() {
    if (isKeyJustPressed("Escape")) this.showHelp = !this.showHelp;
    if (this.introPhase === "title" || this.introPhase === "onlineLobby") return;
    if (this.network) {
      this.network.send({ type: "input", input: captureLocalActionState(P1_KEYS) });
    }
  }

  updateLocalSimulation(dt) {
    if (this.introPhase === "title") {
      if (isKeyJustPressed("Enter")) this.startBattle("vs");
      return;
    }

    if (this.mode === "practice" && isKeyJustPressed("Backspace")) {
      this.returnToTitle();
      return;
    }

    if (isKeyJustPressed("Escape")) this.showHelp = !this.showHelp;
    if (this.showHelp) return; // 説明表示中はゲームを一時停止する

    if (this.introPhase !== "playing") {
      this.updateIntro(dt);
      return;
    }

    if (this.matchOver) {
      if (isKeyJustPressed("KeyR")) this.restart();
      return;
    }

    // ヒットストップ中は試合全体を一時停止する（タイマー・双方の動き・CPU思考すべて含めて）
    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
      return;
    }

    this.elapsed += dt;
    if (this.mode !== "practice") {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    }

    this.handleInput(this.player1, this.player1Input, this.commandBuffer1);
    this.handleJumpInput(this.player1, this.player1Input);
    this.updateCrouchState(this.player1, this.player1Input);
    this.updateGuardState(this.player1, this.player1Input);
    this.updateCommandBuffer(this.player1, this.player1Input, this.commandBuffer1);
    this.handlePunchInput(this.player1, this.player1Input, this.commandBuffer1);
    this.handleKickInput(this.player1, this.player1Input);

    if (this.mode === "2p") {
      // VS 2Pモードは2PもP2_KEYSでキーボード操作する（CPUは動かさない）
      this.handleInput(this.player2, this.player2LocalInput, this.commandBuffer2);
      this.handleJumpInput(this.player2, this.player2LocalInput);
      this.updateCrouchState(this.player2, this.player2LocalInput);
      this.updateGuardState(this.player2, this.player2LocalInput);
      this.updateCommandBuffer(this.player2, this.player2LocalInput, this.commandBuffer2);
      this.handlePunchInput(this.player2, this.player2LocalInput, this.commandBuffer2);
      this.handleKickInput(this.player2, this.player2LocalInput);
    } else if (this.mode === "online") {
      // オンライン対戦はホストが2P分もシミュレーションする。2Pの操作は参加側から受信した入力
      this.handleInput(this.player2, this.remoteInput, this.commandBuffer2);
      this.handleJumpInput(this.player2, this.remoteInput);
      this.updateCrouchState(this.player2, this.remoteInput);
      this.updateGuardState(this.player2, this.remoteInput);
      this.updateCommandBuffer(this.player2, this.remoteInput, this.commandBuffer2);
      this.handlePunchInput(this.player2, this.remoteInput, this.commandBuffer2);
      this.handleKickInput(this.player2, this.remoteInput);
    } else if (this.mode !== "practice") {
      this.cpu.update(dt); // 練習モードはCPUが何もしない（練習用のダミーにする）
    }

    this.player1.update(dt, this.width);
    this.player2.update(dt, this.width);
    this.updateProjectiles(dt);

    this.resolveCollision(dt);
    this.updateFacing();
    this.checkAttackHit(this.player1, this.player2);
    this.checkAttackHit(this.player2, this.player1);
    this.spawnPendingProjectiles();
    this.checkProjectileClashes();
    this.checkProjectileHits();

    if (this.mode === "practice") {
      this.updatePracticeHealing();
    } else {
      this.checkRoundEnd();
    }
  }

  // 練習モードでは決着させず、HPが尽きたプレイヤーは即座に全回復させる
  updatePracticeHealing() {
    if (this.player1.hp <= 0) this.player1.hp = this.player1.maxHp;
    if (this.player2.hp <= 0) this.player2.hp = this.player2.maxHp;
  }

  // しゃがみキー押下中かつ接地中であればしゃがみ状態にする（空中ではしゃがめない）
  updateCrouchState(player, input) {
    player.isCrouching = input.isDown("down") && player.isGrounded;
  }

  // 後方（facingと逆方向）のキーを押している間・接地中・非攻撃中はガード状態にする。
  // ヒット硬直中は新たにガードへ入れないが、ガード硬直中は継続してガードできる
  updateGuardState(player, input) {
    const backAction = player.facing === 1 ? "left" : "right";
    player.isGuarding = input.isDown(backAction) && player.isGrounded && !player.attack && player.hitstunTimer <= 0 && player.downTimer <= 0;
  }

  // ↓/↘/→ の方向をコマンド判定バッファに記録する（しゃがみキーは↓入力と兼用）
  updateCommandBuffer(player, input, buffer) {
    const down = input.isDown("down");
    const forwardAction = player.facing === 1 ? "right" : "left";
    const forward = input.isDown(forwardAction);

    let dir = DIR_NEUTRAL;
    if (down && forward) dir = DIR_DOWN_FORWARD;
    else if (down) dir = DIR_DOWN;
    else if (forward) dir = DIR_FORWARD;

    recordDirection(buffer, dir, this.elapsed);
  }

  updateProjectiles(dt) {
    for (const projectile of this.projectiles) projectile.update(dt, this.width);
  }

  spawnPendingProjectiles() {
    this.trySpawnProjectile(this.player1);
    this.trySpawnProjectile(this.player2);
  }

  trySpawnProjectile(player) {
    const a = player.attack;
    if (!a || !a.data.isProjectile || a.phase !== "active" || a.projectileSpawned) return;

    a.projectileSpawned = true;
    const cfg = a.data.projectile;
    const x = player.facing === 1 ? player.x + player.width : player.x - cfg.width;
    const y = player.y + cfg.offsetY;
    // 波動拳(通常技)のみ専用の弾絵を使う。SA(hadoukenSuper)は今のところ専用絵が無いため図形描画のまま
    const sprites = a.strength === "hadouken" ? this.assets.hadoukenSprites : null;
    this.projectiles.push(new Projectile({ x, y, direction: player.facing, owner: player, config: cfg, sprites }));
  }

  // 持ち主が異なる弾同士が重なったら、威力(damage)が高い方が生き残り、低い方だけ消える。
  // 同威力同士は相殺で両方消える
  checkProjectileClashes() {
    for (let i = 0; i < this.projectiles.length; i++) {
      const a = this.projectiles[i];
      if (a.dead) continue;

      for (let j = i + 1; j < this.projectiles.length; j++) {
        const b = this.projectiles[j];
        if (b.dead || b.owner === a.owner) continue;

        if (rectsOverlap(a.getHitbox(), b.getHitbox())) {
          if (a.damage > b.damage) b.dead = true;
          else if (b.damage > a.damage) a.dead = true;
          else {
            a.dead = true;
            b.dead = true;
          }
          break;
        }
      }
    }
  }

  checkProjectileHits() {
    for (const projectile of this.projectiles) {
      if (projectile.dead) continue;
      const target = projectile.owner === this.player1 ? this.player2 : this.player1;
      if (target.isDowned) continue; // ダウン中は無敵（弾は素通りする）
      if (rectsOverlap(projectile.getHitbox(), target.getHurtbox())) {
        this.applyHit(projectile.owner, target, projectile);
        projectile.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ガード中なら削りダメージ＋ガード硬直、そうでなければ通常ダメージ＋ヒット硬直を与える。
  // 攻撃側・防御側ともにダメージに応じてSUPERゲージが溜まる。
  // attackData は { damage, hitstun, blockstun } を持つオブジェクト（技データ or Projectile）
  applyHit(attacker, defender, attackData) {
    if (defender.isGuarding) {
      defender.triggerGuardFlash();
      defender.takeDamage(Math.round(attackData.damage * GUARD_CHIP_RATIO));
      defender.applyBlockstun(attackData.blockstun);
      this.triggerHitStop(HITSTOP_BLOCK_DURATION);
    } else {
      defender.triggerHitFlash();
      defender.takeDamage(attackData.damage);
      if (attackData.causesKnockdown) {
        defender.applyKnockdown();
      } else {
        defender.applyHitstun(attackData.hitstun);
      }
      // 攻撃側から見て反対方向（＝防御側から見て攻撃側と反対方向）へ弾き飛ばす
      const knockbackDirection = defender.x >= attacker.x ? 1 : -1;
      defender.applyKnockback(knockbackDirection);
      this.triggerHitStop(HITSTOP_HIT_DURATION);
    }

    const gaugeGain = attackData.damage * SUPER_GAUGE_GAIN_RATE;
    attacker.gainSuperGauge(gaugeGain);
    defender.gainSuperGauge(gaugeGain);
  }

  // ヒットストップを開始する。連続で呼ばれた場合は長い方を採用する（積み増しはしない）
  triggerHitStop(duration) {
    this.hitStopTimer = Math.max(this.hitStopTimer, duration);
  }

  // 1ラウンドの決着を判定する。マッチ全体の決着（先取本数到達）はadvanceRound()側で見る
  checkRoundEnd() {
    const p1Down = this.player1.hp <= 0;
    const p2Down = this.player2.hp <= 0;
    const timeUp = this.timeRemaining <= 0;
    if (!p1Down && !p2Down && !timeUp) return;

    this.endReason = p1Down || p2Down ? "ko" : "timeup";

    if (p1Down && p2Down) this.winner = null; // 相打ち
    else if (p1Down) this.winner = this.player2;
    else if (p2Down) this.winner = this.player1;
    else if (this.player1.hp === this.player2.hp) this.winner = null; // タイムアップかつ体力同値
    else this.winner = this.player1.hp > this.player2.hp ? this.player1 : this.player2; // タイムアップはHPが多い方の勝ち

    if (this.winner === this.player1) this.roundWins.player1++;
    else if (this.winner === this.player2) this.roundWins.player2++;
    // 引き分けラウンドはどちらの獲得本数も増えない（そのまま次のラウンドが行われる）

    this.introPhase = "roundEnd";
    this.introTimer = ROUND_RESULT_DURATION;
  }

  resolveCollision(dt) {
    const p1 = this.player1;
    const p2 = this.player2;

    // どちらかが空中にいる間は押し合わない（ジャンプの軌道を一定に保つ）
    if (!p1.isGrounded || !p2.isGrounded) return;

    const center1 = p1.x + p1.width / 2;
    const center2 = p2.x + p2.width / 2;
    const overlap = (p1.width + p2.width) / 2 - Math.abs(center1 - center2);

    if (overlap <= 0) return;

    // p1側からp2側へ向かう方向（p2が押される向き）
    const pushDir = center1 <= center2 ? 1 : -1;
    const pushDistance = Math.min(overlap, PUSH_SPEED * dt);

    p2.x += pushDir * pushDistance;
    p2.x = Math.max(0, Math.min(this.width - p2.width, p2.x));

    // p1はp2が譲った分までしか進めない（押している側も足止めされる）
    const newCenter2 = p2.x + p2.width / 2;
    const remainingOverlap = (p1.width + p2.width) / 2 - Math.abs(center1 - newCenter2);
    if (remainingOverlap > 0) {
      p1.x -= pushDir * remainingOverlap;
      p1.x = Math.max(0, Math.min(this.width - p1.width, p1.x));
    }
  }

  // 直近に↘（下+前）を入力していた場合、そこから短時間は歩かせない。
  // 波動拳コマンドの「→」に移る瞬間だけ前進してしまうのを防ぐため
  isInSpecialMotionGrace(buffer) {
    for (let i = buffer.length - 1; i >= 0; i--) {
      const entry = buffer[i];
      if (this.elapsed - entry.t > MOTION_GRACE) break;
      if (entry.dir === DIR_DOWN_FORWARD) return true;
    }
    return false;
  }

  handleInput(player, input, buffer) {
    // 下入力中、または直後の一定時間は歩かない（波動拳などのコマンド入力中に誤って前進しないようにするため）
    if (input.isDown("down") || this.isInSpecialMotionGrace(buffer)) {
      player.vx = 0;
      return;
    }

    let direction = 0;
    if (input.isDown("left")) direction -= 1;
    if (input.isDown("right")) direction += 1;

    if (direction === 0) {
      player.vx = 0;
      return;
    }

    const isBackward = direction !== player.facing;
    player.vx = direction * (isBackward ? BACKWARD_MOVE_SPEED : MOVE_SPEED);
  }

  handleJumpInput(player, input) {
    if (!input.isJustPressed("up")) return;

    let direction = 0;
    if (input.isDown("left")) direction -= 1;
    if (input.isDown("right")) direction += 1;
    player.jump(direction);
  }

  handlePunchInput(player, input, buffer) {
    // 波動拳などのコマンド技はしゃがみ中は出さない（しゃがみパンチ優先）
    const data = player.isCrouching ? CROUCH_PUNCH_DATA : PUNCH_DATA;
    if (input.isJustPressed("punchLight")) this.tryPunchOrSpecial(player, buffer, "light", data.light);
    else if (input.isJustPressed("punchMedium")) this.tryPunchOrSpecial(player, buffer, "medium", data.medium);
    else if (input.isJustPressed("punchHeavy")) this.tryPunchOrSpecial(player, buffer, "heavy", data.heavy);
  }

  // パンチ入力の直前に昇龍拳／波動拳／スーパーアーツのコマンドが成立していればそちらを、
  // そうでなければ通常のパンチを出す。波動拳・SAは地上限定・同時に自分の弾は1発までかつ非しゃがみ時のみ。
  // 昇龍拳（→↓↘）はコマンドの完成時点で必然的に下キーを押している（しゃがみ入力中）ため、
  // 波動拳・SAとは異なりisCrouchingを問わず成立させる。
  // SA（↓↘→↓→）は波動拳（↓↘→）で始まる上位互換の入力なので波動拳より先にチェックする。
  // さらに昇龍拳（→↓↘）より先にチェックする必要がある。SAをキーボードで入力する際、
  // 2つ目の「↓」から最後の「→」に切り替える瞬間に下キーと前キーが一瞬同時押しになり、
  // 意図せず「↘」が記録されることがあり、その結果バッファの末尾が「→↓↘」
  // （昇龍拳コマンド）と一致してしまうことがあるため。SAはSUPERゲージが満タンでないと
  // 出せず、コマンドが成立していても波動拳になる
  tryPunchOrSpecial(player, buffer, strength, punchData) {
    if (player.attack) return;

    const canFireProjectile = player.isGrounded && !player.isCrouching && !this.hasActiveProjectile(player);

    if (canFireProjectile && player.hasFullSuperGauge() && hasSuperArtsMotion(buffer, this.elapsed)) {
      clearBuffer(buffer); // 連続で誤爆しないようコマンドを消費する
      player.consumeSuperGauge();
      player.startAttack("special", "hadoukenSuper", SPECIAL_DATA.hadoukenSuper);
      return;
    }

    if (player.isGrounded && hasDragonPunchMotion(buffer, this.elapsed)) {
      clearBuffer(buffer);
      player.startAttack("special", "shoryuken", SPECIAL_DATA.shoryuken);
      return;
    }

    if (canFireProjectile && hasQuarterCircleForward(buffer, this.elapsed)) {
      clearBuffer(buffer);
      player.startAttack("special", "hadouken", SPECIAL_DATA.hadouken);
      return;
    }

    player.startAttack("punch", strength, punchData);
  }

  hasActiveProjectile(player) {
    return this.projectiles.some((p) => p.owner === player);
  }

  handleKickInput(player, input) {
    const data = player.isCrouching ? CROUCH_KICK_DATA : KICK_DATA;
    if (input.isJustPressed("kickLight")) player.startAttack("kick", "light", data.light);
    else if (input.isJustPressed("kickMedium")) player.startAttack("kick", "medium", data.medium);
    else if (input.isJustPressed("kickHeavy")) player.startAttack("kick", "heavy", data.heavy);
  }

  checkAttackHit(attacker, defender) {
    if (!attacker.attack || attacker.attack.hasHit) return;
    if (defender.isDowned) return; // ダウン中は無敵（追撃されない）
    const hitbox = attacker.getHitbox();
    if (!hitbox) return;

    if (rectsOverlap(hitbox, defender.getHurtbox())) {
      attacker.attack.hasHit = true;
      this.applyHit(attacker, defender, attacker.attack.data);
    }
  }

  updateFacing() {
    const center1 = this.player1.x + this.player1.width / 2;
    const center2 = this.player2.x + this.player2.width / 2;
    // 空中では向きを固定する（着地している側だけ相手の方を向く）
    if (this.player1.isGrounded) this.player1.facing = center1 <= center2 ? 1 : -1;
    if (this.player2.isGrounded) this.player2.facing = center2 <= center1 ? 1 : -1;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (this.introPhase === "title") {
      const isStartHovered = this.isHoveringStartButton(this.mouseX, this.mouseY);
      const isPracticeHovered = this.isHoveringPracticeButton(this.mouseX, this.mouseY);
      const isVersusHovered = this.isHoveringVersusButton(this.mouseX, this.mouseY);
      const isOnlineHovered = this.isHoveringOnlineButton(this.mouseX, this.mouseY);
      drawTitleScreen(ctx, this.width, this.height, this.assets.titleLogo, isStartHovered, isPracticeHovered, isVersusHovered, isOnlineHovered);
      return;
    }

    if (this.introPhase === "onlineLobby") {
      drawOnlineLobbyScreen(ctx, this.width, this.height);
      return;
    }

    const isPractice = this.mode === "practice";

    drawStage(ctx, this.width, this.height, this.assets.background);
    this.player1.draw(ctx);
    this.player2.draw(ctx);
    for (const projectile of this.projectiles) projectile.draw(ctx);
    drawHud(
      ctx,
      this.player1,
      this.player2,
      this.width,
      this.height,
      isPractice ? null : this.timeRemaining,
      isPractice ? null : this.roundWins,
      isPractice ? null : ROUNDS_TO_WIN,
      this.mode === "2p" || this.mode === "online" ? "2P" : "CPU"
    );

    if (isPractice) {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.font = "16px sans-serif";
      ctx.fillText("練習モード（Backspaceキーでタイトルへ）", this.width / 2, this.height - 12);
    }

    if (this.introPhase === "ready" || this.introPhase === "fight") {
      drawIntroOverlay(ctx, this.width, this.height, this.introPhase, isPractice ? null : this.currentRound);
    } else if (this.introPhase === "roundEnd") {
      const headerLabel = this.endReason === "timeup" ? "TIME UP" : "K.O.";
      drawRoundResult(ctx, this.width, this.height, this.getWinnerLabel(false), headerLabel);
    }

    if (this.matchOver) {
      const headerLabel = this.endReason === "timeup" ? "TIME UP" : "K.O.";
      drawMatchResult(ctx, this.width, this.height, this.getWinnerLabel(true), headerLabel, this.roundWins);
    }

    if (this.showHelp) drawHelpOverlay(ctx, this.width, this.height);
  }

  // 決着画面の勝者表示テキストを、モード（vs/2p）と決着の種類（ラウンド/マッチ全体）に応じて決める。
  // finalMatch: マッチ全体の決着（matchOver）ならtrue、1ラウンドの決着（roundEnd）ならfalse
  getWinnerLabel(finalMatch) {
    if (!this.winner) return "DRAW";
    if (this.mode === "2p" || this.mode === "online") {
      return this.winner === this.player1 ? "1P WINS" : "2P WINS";
    }
    if (this.winner === this.player1) return finalMatch ? "YOU WIN" : "PLAYER WINS";
    return "CPU WINS";
  }
}
