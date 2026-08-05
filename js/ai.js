import { MOVE_SPEED } from "./player.js";
import { PUNCH_DATA, KICK_DATA, CROUCH_PUNCH_DATA, CROUCH_KICK_DATA, SPECIAL_DATA } from "./combat.js";

// CPU（P2）の思考ルーチン。以下の4段階で構成する。
//
// 1. 状況認識 (perceive)      : 距離・体力差・画面端かどうかを毎フレーム把握する
// 2. モード決定 (chooseMode)  : 状況から「攻め/待ち/逃げ」を決め、一定時間（モードの粘り）維持する
// 3. 行動選択 (decide)        : モード×間合いの重み付け表から確率で行動を選ぶ（THINK_INTERVAL間隔）
// 4. 割り込み反応 (reactToThreat): 相手の攻撃発生・飛び込みを検知し、モードごとの「意識」に応じて反応する
//
// このゲームにはゲージ制度（ドライブゲージ/SAゲージ相当）が無いため、リソースとしてはHP差のみを使う。
// ダウン状態・対空専用の必殺技（昇龍拳など）も未実装のため、対空は通常攻撃で代替する。

const THINK_INTERVAL = 0.3; // 秒。この間隔でのみ行動選択(decide)を行う

const CLOSE_RANGE = 110; // px。これ以下は近距離（通常技の間合い）
const FAR_RANGE = 500; // px。これを超えたら遠距離

const CORNER_MARGIN = 150; // px。画面端からこの距離以内なら「詰まっている」とみなす

const ATTACK_COOLDOWN = 0.5; // 秒。攻撃した後、次の（反撃以外の）攻撃までの間隔
const PUNISH_CHANCE = 0.7; // 相手が攻撃硬直(recovery)中で間合い内なら反撃を狙う確率（モード・クールダウン無視）
const CROUCH_ATTACK_CHANCE = 0.3; // 攻撃を選んだ際、しゃがみ技を選ぶ確率
const SUPER_CHANCE = 0.15; // 飛び道具を選んだ際、SA（強化版）を選ぶ確率

// --- モード決定 ---
const MODE_BASE_WEIGHT = 35; // 3モードの基本重み（同じなら均等）
const MODE_MIN_DURATION = 2.5; // 秒。モードを維持する最短時間
const MODE_MAX_DURATION = 5; // 秒。モードを維持する最長時間

// --- 割り込み反応（意識の向き） ---
// モードごとに「反応できる基本確率」への倍率。aggressiveは攻めに気を取られ反応が甘く、
// watchは警戒度が高い、retreatは守り重視で反応は良いが対空はそこそこ、という想定
const MODE_ATTENTION = {
  aggressive: { guardEvade: 0.4, antiAir: 0.25 },
  watch: { guardEvade: 1.0, antiAir: 0.85 },
  retreat: { guardEvade: 0.85, antiAir: 0.5 },
};
const BASE_REACT_CHANCE = 0.8; // 反応の基本確率（上記倍率をかけて実際の確率にする）
const GUARD_VS_EVADE_RATIO = 0.6; // 反応したうちガードを選ぶ割合（残りはバックジャンプ回避）
const GUARD_HOLD_DURATION = 0.3; // 秒。ガードを選んだ場合に構えを維持する時間
const REACTION_RANGE = 220; // px。この距離以内で相手の攻撃発生を検知したら反応を検討する
const JUMP_IN_RANGE = 300; // px。この距離以内で相手が地上→空中に変わったら「飛び込み」とみなす

// モード×間合いごとの行動の重み。値は目安であり、後日バランス調整の対象。
// attack/fireball/jumpApproachは、その場の状況（クールダウンや接地状態など）で選べない場合は自動的に除外される
const ACTION_WEIGHTS = {
  aggressive: {
    close: { attack: 60, wait: 15, retreat: 5 },
    mid: { approach: 35, fireball: 25, jumpApproach: 25, wait: 15 },
    far: { approach: 30, fireball: 40, jumpApproach: 25, wait: 5 },
  },
  watch: {
    close: { attack: 30, wait: 45, retreat: 25 },
    mid: { wait: 35, fireball: 30, approach: 20, jumpApproach: 5, retreat: 10 },
    far: { wait: 30, fireball: 50, approach: 15, jumpApproach: 5 },
  },
  retreat: {
    close: { retreat: 45, attack: 20, wait: 35 },
    mid: { retreat: 40, fireball: 35, wait: 20, approach: 5 },
    far: { retreat: 20, fireball: 55, wait: 20, approach: 5 },
  },
};

const NORMAL_ATTACKS = [
  () => ["punch", "light", PUNCH_DATA.light],
  () => ["punch", "medium", PUNCH_DATA.medium],
  () => ["punch", "heavy", PUNCH_DATA.heavy],
  () => ["kick", "light", KICK_DATA.light],
  () => ["kick", "medium", KICK_DATA.medium],
  () => ["kick", "heavy", KICK_DATA.heavy],
];

const CROUCH_ATTACKS = [
  () => ["punch", "light", CROUCH_PUNCH_DATA.light],
  () => ["punch", "medium", CROUCH_PUNCH_DATA.medium],
  () => ["punch", "heavy", CROUCH_PUNCH_DATA.heavy],
  () => ["kick", "light", CROUCH_KICK_DATA.light],
  () => ["kick", "medium", CROUCH_KICK_DATA.medium],
  () => ["kick", "heavy", CROUCH_KICK_DATA.heavy],
];

// { action: weight, ... } から重み付き抽選で1つ選ぶ。正の重みが無ければnull
function pickWeighted(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;

  let roll = Math.random() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

export class CpuController {
  // hasOwnProjectile: 自分の飛び道具が画面上に残っているか判定する関数（Gameから注入）
  // canvasWidth: 画面端（コーナー）判定に使う
  constructor(player, opponent, { hasOwnProjectile = () => false, canvasWidth = 1200 } = {}) {
    this.player = player;
    this.opponent = opponent;
    this.hasOwnProjectile = hasOwnProjectile;
    this.canvasWidth = canvasWidth;

    this.thinkTimer = 0;
    this.guardTimer = 0;
    this.attackCooldown = 0;
    this.reactedAttack = null; // 直近に反応済みの相手の攻撃（同じ攻撃に何度も反応しないため）
    this.prevOpponentGrounded = true; // 相手の「地上→空中」の変化（飛び込み）を検知するため

    this.mode = "watch";
    this.modeTimer = 0; // 0にしておき、最初のupdateで即座にモードを決定させる
  }

  update(dt) {
    if (!this.player.attack) this.player.isCrouching = false; // 攻撃終了時にしゃがみ姿勢を解除
    if (this.attackCooldown > 0) this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    this.modeTimer -= dt;
    if (this.modeTimer <= 0) this.chooseMode();

    this.updateGuard(dt);
    this.reactToThreat();

    this.thinkTimer -= dt;
    if (this.thinkTimer > 0) return;
    this.thinkTimer = THINK_INTERVAL;
    this.decide();
  }

  // --- 1. 状況認識 ---
  perceive() {
    const p = this.player;
    const opp = this.opponent;
    return {
      distance: Math.abs(opp.x - p.x),
      hpAdvantage: p.hp / p.maxHp - opp.hp / opp.maxHp, // -1〜1。正なら自分が有利
      selfCornered: this.isCornered(p),
      opponentCornered: this.isCornered(opp),
    };
  }

  isCornered(player) {
    return player.x <= CORNER_MARGIN || player.x + player.width >= this.canvasWidth - CORNER_MARGIN;
  }

  rangeBucket(distance) {
    if (distance <= CLOSE_RANGE) return "close";
    if (distance <= FAR_RANGE) return "mid";
    return "far";
  }

  // --- 2. モード決定（一定時間ごとに再評価し、それまでは維持する＝モードの粘り） ---
  chooseMode() {
    const state = this.perceive();
    const weights = { aggressive: MODE_BASE_WEIGHT, watch: MODE_BASE_WEIGHT, retreat: MODE_BASE_WEIGHT };

    if (state.hpAdvantage < -0.3) {
      weights.retreat += 30;
      weights.watch += 10;
      weights.aggressive -= 20;
    } else if (state.hpAdvantage > 0.3) {
      weights.aggressive += 25;
      weights.retreat -= 15;
    }

    if (state.opponentCornered) weights.aggressive += 25; // 相手を追い詰めたら畳みかける
    if (state.selfCornered) {
      weights.retreat -= 20; // 自分が壁際なら下がる余地が無い
      weights.aggressive += 10; // 動かざるを得ない
    }

    for (const key in weights) weights[key] = Math.max(5, weights[key]);

    this.mode = pickWeighted(weights) || "watch";
    this.modeTimer = MODE_MIN_DURATION + Math.random() * (MODE_MAX_DURATION - MODE_MIN_DURATION);
  }

  updateGuard(dt) {
    if (this.guardTimer > 0) {
      this.guardTimer = Math.max(0, this.guardTimer - dt);
      this.player.vx = 0; // ガード中は動かない
    }
    // ヒット硬直中は新たにガードへ入れないが、ガード硬直中は継続してガードできる
    this.player.isGuarding = this.guardTimer > 0 && this.player.isGrounded && !this.player.attack && this.player.hitstunTimer <= 0;
  }

  // --- 4. 割り込み反応（相手の攻撃発生・飛び込みを検知し、モードの「意識」に応じて反応する） ---
  reactToThreat() {
    const p = this.player;
    const opp = this.opponent;
    const attention = MODE_ATTENTION[this.mode];

    this.reactToJumpIn(p, opp, attention);
    this.reactToAttackStartup(p, opp, attention);
  }

  reactToJumpIn(p, opp, attention) {
    const wasGrounded = this.prevOpponentGrounded;
    this.prevOpponentGrounded = opp.isGrounded;
    if (!wasGrounded || opp.isGrounded) return; // 地上→空中に変わった瞬間だけ

    if (p.attack || p.isStunned) return;
    const distance = Math.abs(opp.x - p.x);
    if (distance > JUMP_IN_RANGE) return;

    // 専用の対空技が無いため、通常攻撃を対空として使う
    if (Math.random() < attention.antiAir) this.attack();
  }

  reactToAttackStartup(p, opp, attention) {
    if (!opp.attack || opp.attack.phase !== "startup") {
      this.reactedAttack = null;
      return;
    }
    if (opp.attack === this.reactedAttack) return; // この攻撃には反応済み
    this.reactedAttack = opp.attack;

    if (p.attack || p.isStunned) return; // 自分が行動中・硬直中なら反応しない
    const distance = Math.abs(opp.x - p.x);
    if (distance > REACTION_RANGE) return; // 遠い攻撃は無視

    if (Math.random() >= BASE_REACT_CHANCE * attention.guardEvade) return; // 意識が向いておらず反応できない

    if (Math.random() < GUARD_VS_EVADE_RATIO) {
      this.guardTimer = GUARD_HOLD_DURATION;
    } else if (p.isGrounded) {
      const awayDirection = opp.x > p.x ? -1 : 1;
      p.jump(awayDirection);
    }
  }

  // --- 3. 行動選択（モード×間合いの重み付け表から選ぶ） ---
  decide() {
    const p = this.player;
    if (p.attack || p.isStunned || this.guardTimer > 0) return;

    const opp = this.opponent;
    const distance = Math.abs(opp.x - p.x);
    const direction = opp.x > p.x ? 1 : -1;

    // 反撃優先（モード共通。隙を見た反射的な差し込み）
    if (opp.attack && opp.attack.phase === "recovery" && distance <= CLOSE_RANGE) {
      if (Math.random() < PUNISH_CHANCE) {
        this.attack();
        return;
      }
    }

    const bucket = this.rangeBucket(distance);
    const weights = { ...ACTION_WEIGHTS[this.mode][bucket] };

    if (this.attackCooldown > 0 || !p.isGrounded || distance > CLOSE_RANGE) delete weights.attack;
    if (!p.isGrounded || this.hasOwnProjectile()) delete weights.fireball;
    if (!p.isGrounded) delete weights.jumpApproach;

    const action = pickWeighted(weights) || "wait";
    this.performAction(action, direction);
  }

  performAction(action, direction) {
    const p = this.player;
    switch (action) {
      case "attack":
        this.attack();
        break;
      case "fireball": {
        p.vx = 0;
        const useSuper = Math.random() < SUPER_CHANCE;
        p.startAttack("special", useSuper ? "hadoukenSuper" : "hadouken", useSuper ? SPECIAL_DATA.hadoukenSuper : SPECIAL_DATA.hadouken);
        break;
      }
      case "jumpApproach":
        p.jump(direction);
        break;
      case "approach":
        p.vx = direction * MOVE_SPEED;
        break;
      case "retreat":
        p.vx = -direction * MOVE_SPEED;
        break;
      case "wait":
      default:
        p.vx = 0;
        break;
    }
  }

  attack() {
    const p = this.player;
    this.attackCooldown = ATTACK_COOLDOWN;
    const useCrouch = p.isGrounded && Math.random() < CROUCH_ATTACK_CHANCE;
    p.isCrouching = useCrouch;
    const pool = useCrouch ? CROUCH_ATTACKS : NORMAL_ATTACKS;
    const [type, strength, data] = pool[Math.floor(Math.random() * pool.length)]();
    p.startAttack(type, strength, data);
  }
}
