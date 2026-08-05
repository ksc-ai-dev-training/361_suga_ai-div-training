import { Player, MOVE_SPEED, BACKWARD_MOVE_SPEED, PUSH_SPEED } from "./player.js";
import { GROUND_Y, drawStage } from "./stage.js";
import { isKeyDown, isKeyJustPressed } from "./input.js";
import { PUNCH_DATA, KICK_DATA, CROUCH_PUNCH_DATA, CROUCH_KICK_DATA, SPECIAL_DATA, GUARD_CHIP_RATIO, rectsOverlap } from "./combat.js";
import { drawHealthBars, drawMatchResult, drawHelpOverlay } from "./ui.js";
import { Projectile } from "./projectile.js";
import { CpuController } from "./ai.js";
import {
  createCommandBuffer,
  recordDirection,
  hasQuarterCircleForward,
  hasDoubleQuarterCircleForward,
  clearBuffer,
  DIR_NEUTRAL,
  DIR_DOWN,
  DIR_DOWN_FORWARD,
  DIR_FORWARD,
} from "./commandInput.js";

const MOTION_GRACE = 0.25; // 秒。↘入力からこの時間は歩行を抑制する

export class Game {
  constructor(ctx, canvasWidth, canvasHeight) {
    this.ctx = ctx;
    this.width = canvasWidth;
    this.height = canvasHeight;

    this.createPlayers();
    this.matchOver = false;
    this.winner = null;
    this.projectiles = [];
    this.commandBuffer1 = createCommandBuffer();
    this.elapsed = 0;
    this.showHelp = false;
  }

  createPlayers() {
    this.player1 = new Player({ x: 250, groundY: GROUND_Y, color: "#3366ff", facing: 1 });
    this.player2 = new Player({ x: 850, groundY: GROUND_Y, color: "#ff3333", facing: -1 });
    this.cpu = new CpuController(this.player2, this.player1, {
      hasOwnProjectile: () => this.hasActiveProjectile(this.player2),
      canvasWidth: this.width,
    });
  }

  restart() {
    this.createPlayers();
    this.matchOver = false;
    this.winner = null;
    this.projectiles = [];
    clearBuffer(this.commandBuffer1);
  }

  update(dt) {
    if (isKeyJustPressed("Escape")) this.showHelp = !this.showHelp;
    if (this.showHelp) return; // 説明表示中はゲームを一時停止する

    if (this.matchOver) {
      if (isKeyJustPressed("KeyR")) this.restart();
      return;
    }

    this.elapsed += dt;

    this.handleInput();
    this.handleJumpInput();
    this.updateCrouchState();
    this.updateGuardState();
    this.updateCommandBuffer();
    this.handlePunchInput();
    this.handleKickInput();
    this.cpu.update(dt);

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
    this.checkMatchEnd();
  }

  // Sキー押下中かつ接地中であればしゃがみ状態にする（空中ではしゃがめない）
  updateCrouchState() {
    this.player1.isCrouching = isKeyDown("KeyS") && this.player1.isGrounded;
  }

  // 後方（facingと逆方向）のキーを押している間・接地中・非攻撃中はガード状態にする。
  // ヒット硬直中は新たにガードへ入れないが、ガード硬直中は継続してガードできる
  updateGuardState() {
    const p1 = this.player1;
    const backKey = p1.facing === 1 ? "KeyA" : "KeyD";
    p1.isGuarding = isKeyDown(backKey) && p1.isGrounded && !p1.attack && p1.hitstunTimer <= 0;
  }

  // ↓/↘/→ の方向をコマンド判定バッファに記録する（Sキーはしゃがみ入力と兼用）
  updateCommandBuffer() {
    const p1 = this.player1;
    const down = isKeyDown("KeyS");
    const forwardKey = p1.facing === 1 ? "KeyD" : "KeyA";
    const forward = isKeyDown(forwardKey);

    let dir = DIR_NEUTRAL;
    if (down && forward) dir = DIR_DOWN_FORWARD;
    else if (down) dir = DIR_DOWN;
    else if (forward) dir = DIR_FORWARD;

    recordDirection(this.commandBuffer1, dir, this.elapsed);
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
    this.projectiles.push(new Projectile({ x, y, direction: player.facing, owner: player, config: cfg }));
  }

  // 持ち主が異なる弾同士が重なったら、両方消して相殺する
  checkProjectileClashes() {
    for (let i = 0; i < this.projectiles.length; i++) {
      const a = this.projectiles[i];
      if (a.dead) continue;

      for (let j = i + 1; j < this.projectiles.length; j++) {
        const b = this.projectiles[j];
        if (b.dead || b.owner === a.owner) continue;

        if (rectsOverlap(a.getHitbox(), b.getHitbox())) {
          a.dead = true;
          b.dead = true;
          break;
        }
      }
    }
  }

  checkProjectileHits() {
    for (const projectile of this.projectiles) {
      if (projectile.dead) continue;
      const target = projectile.owner === this.player1 ? this.player2 : this.player1;
      if (rectsOverlap(projectile.getHitbox(), target.getHurtbox())) {
        this.applyHit(target, projectile);
        projectile.dead = true;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ガード中なら削りダメージ＋ガード硬直、そうでなければ通常ダメージ＋ヒット硬直を与える。
  // attackData は { damage, hitstun, blockstun } を持つオブジェクト（技データ or Projectile）
  applyHit(defender, attackData) {
    if (defender.isGuarding) {
      defender.triggerGuardFlash();
      defender.takeDamage(Math.round(attackData.damage * GUARD_CHIP_RATIO));
      defender.applyBlockstun(attackData.blockstun);
    } else {
      defender.triggerHitFlash();
      defender.takeDamage(attackData.damage);
      defender.applyHitstun(attackData.hitstun);
    }
  }

  checkMatchEnd() {
    const p1Down = this.player1.hp <= 0;
    const p2Down = this.player2.hp <= 0;
    if (!p1Down && !p2Down) return;

    this.matchOver = true;
    if (p1Down && p2Down) this.winner = null; // 相打ち
    else this.winner = p1Down ? this.player2 : this.player1;
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
  isInSpecialMotionGrace() {
    const buffer = this.commandBuffer1;
    for (let i = buffer.length - 1; i >= 0; i--) {
      const entry = buffer[i];
      if (this.elapsed - entry.t > MOTION_GRACE) break;
      if (entry.dir === DIR_DOWN_FORWARD) return true;
    }
    return false;
  }

  handleInput() {
    const p1 = this.player1;

    // 下入力中、または直後の一定時間は歩かない（波動拳などのコマンド入力中に誤って前進しないようにするため）
    if (isKeyDown("KeyS") || this.isInSpecialMotionGrace()) {
      p1.vx = 0;
      return;
    }

    let direction = 0;
    if (isKeyDown("KeyA")) direction -= 1;
    if (isKeyDown("KeyD")) direction += 1;

    if (direction === 0) {
      p1.vx = 0;
      return;
    }

    const isBackward = direction !== p1.facing;
    p1.vx = direction * (isBackward ? BACKWARD_MOVE_SPEED : MOVE_SPEED);
  }

  handleJumpInput() {
    if (!isKeyJustPressed("KeyW")) return;

    let direction = 0;
    if (isKeyDown("KeyA")) direction -= 1;
    if (isKeyDown("KeyD")) direction += 1;
    this.player1.jump(direction);
  }

  handlePunchInput() {
    // 波動拳などのコマンド技はしゃがみ中は出さない（しゃがみパンチ優先）
    const data = this.player1.isCrouching ? CROUCH_PUNCH_DATA : PUNCH_DATA;
    if (isKeyJustPressed("KeyU")) this.tryPunchOrSpecial("light", data.light);
    else if (isKeyJustPressed("KeyI")) this.tryPunchOrSpecial("medium", data.medium);
    else if (isKeyJustPressed("KeyO")) this.tryPunchOrSpecial("heavy", data.heavy);
  }

  // パンチ入力の直前に波動拳／スーパーアーツのコマンドが成立していればそちらを、
  // そうでなければ通常のパンチを出す。どちらも地上限定・同時に自分の弾は1発まで。
  // スーパーアーツ（↓↘→↓↘→）は波動拳（↓↘→）の上位互換の入力なので先にチェックする
  tryPunchOrSpecial(strength, punchData) {
    const p1 = this.player1;
    if (p1.attack) return;

    const canFireProjectile = p1.isGrounded && !p1.isCrouching && !this.hasActiveProjectile(p1);

    if (canFireProjectile && hasDoubleQuarterCircleForward(this.commandBuffer1, this.elapsed)) {
      clearBuffer(this.commandBuffer1); // 連続で誤爆しないようコマンドを消費する
      p1.startAttack("special", "hadoukenSuper", SPECIAL_DATA.hadoukenSuper);
      return;
    }

    if (canFireProjectile && hasQuarterCircleForward(this.commandBuffer1, this.elapsed)) {
      clearBuffer(this.commandBuffer1);
      p1.startAttack("special", "hadouken", SPECIAL_DATA.hadouken);
      return;
    }

    p1.startAttack("punch", strength, punchData);
  }

  hasActiveProjectile(player) {
    return this.projectiles.some((p) => p.owner === player);
  }

  handleKickInput() {
    const p1 = this.player1;
    const data = p1.isCrouching ? CROUCH_KICK_DATA : KICK_DATA;
    if (isKeyJustPressed("KeyJ")) p1.startAttack("kick", "light", data.light);
    else if (isKeyJustPressed("KeyK")) p1.startAttack("kick", "medium", data.medium);
    else if (isKeyJustPressed("KeyL")) p1.startAttack("kick", "heavy", data.heavy);
  }

  checkAttackHit(attacker, defender) {
    if (!attacker.attack || attacker.attack.hasHit) return;
    const hitbox = attacker.getHitbox();
    if (!hitbox) return;

    if (rectsOverlap(hitbox, defender.getHurtbox())) {
      attacker.attack.hasHit = true;
      this.applyHit(defender, attacker.attack.data);
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
    drawStage(ctx, this.width);
    this.player1.draw(ctx);
    this.player2.draw(ctx);
    for (const projectile of this.projectiles) projectile.draw(ctx);
    drawHealthBars(ctx, this.player1, this.player2, this.width);

    if (this.matchOver) {
      const winnerLabel = this.winner === this.player1 ? "YOU WIN" : this.winner === this.player2 ? "CPU WINS" : "DRAW";
      drawMatchResult(ctx, this.width, this.height, winnerLabel);
    }

    if (this.showHelp) drawHelpOverlay(ctx, this.width, this.height);
  }
}
