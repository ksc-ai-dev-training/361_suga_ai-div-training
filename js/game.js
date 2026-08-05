import { Player, MOVE_SPEED, BACKWARD_MOVE_SPEED, PUSH_SPEED } from "./player.js";
import { GROUND_Y, drawStage } from "./stage.js";
import { isKeyDown, isKeyJustPressed } from "./input.js";
import { PUNCH_DATA, rectsOverlap } from "./combat.js";
import { drawHealthBars, drawMatchResult } from "./ui.js";

export class Game {
  constructor(ctx, canvasWidth, canvasHeight) {
    this.ctx = ctx;
    this.width = canvasWidth;
    this.height = canvasHeight;

    this.createPlayers();
    this.matchOver = false;
    this.winner = null;
  }

  createPlayers() {
    this.player1 = new Player({ x: 250, groundY: GROUND_Y, color: "#3366ff", facing: 1 });
    this.player2 = new Player({ x: 850, groundY: GROUND_Y, color: "#ff3333", facing: -1 });
  }

  restart() {
    this.createPlayers();
    this.matchOver = false;
    this.winner = null;
  }

  update(dt) {
    if (this.matchOver) {
      if (isKeyJustPressed("KeyR")) this.restart();
      return;
    }

    this.handleInput();
    this.handleJumpInput();
    this.handlePunchInput();

    this.player1.update(dt, this.width);
    this.player2.update(dt, this.width);

    this.resolveCollision(dt);
    this.updateFacing();
    this.checkAttackHit(this.player1, this.player2);
    this.checkAttackHit(this.player2, this.player1);
    this.checkMatchEnd();
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

  handleInput() {
    const p1 = this.player1;
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
    const p1 = this.player1;
    if (isKeyJustPressed("KeyU")) p1.startAttack("punch", "light", PUNCH_DATA.light);
    else if (isKeyJustPressed("KeyI")) p1.startAttack("punch", "medium", PUNCH_DATA.medium);
    else if (isKeyJustPressed("KeyO")) p1.startAttack("punch", "heavy", PUNCH_DATA.heavy);
  }

  checkAttackHit(attacker, defender) {
    if (!attacker.attack || attacker.attack.hasHit) return;
    const hitbox = attacker.getHitbox();
    if (!hitbox) return;

    if (rectsOverlap(hitbox, defender.getHurtbox())) {
      attacker.attack.hasHit = true;
      defender.triggerHitFlash();
      defender.takeDamage(attacker.attack.data.damage);
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
    drawHealthBars(ctx, this.player1, this.player2, this.width);

    if (this.matchOver) {
      const winnerLabel = this.winner === this.player1 ? "YOU WIN" : this.winner === this.player2 ? "CPU WINS" : "DRAW";
      drawMatchResult(ctx, this.width, this.height, winnerLabel);
    }
  }
}
