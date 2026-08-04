import { Player, MOVE_SPEED, BACKWARD_MOVE_SPEED, PUSH_SPEED, AIR_SPEED_MULTIPLIER } from "./player.js";
import { GROUND_Y, drawStage } from "./stage.js";
import { isKeyDown, isKeyJustPressed } from "./input.js";
import { PUNCH_DATA, rectsOverlap } from "./combat.js";

export class Game {
  constructor(ctx, canvasWidth, canvasHeight) {
    this.ctx = ctx;
    this.width = canvasWidth;
    this.height = canvasHeight;

    this.player1 = new Player({ x: 250, groundY: GROUND_Y, color: "#3366ff", facing: 1 });
    this.player2 = new Player({ x: 850, groundY: GROUND_Y, color: "#ff3333", facing: -1 });
  }

  update(dt) {
    this.handleInput();
    this.handleJumpInput();
    this.handlePunchInput();

    this.player1.update(dt, this.width);
    this.player2.update(dt, this.width);

    this.resolveCollision(dt);
    this.updateFacing();
    this.checkAttackHit(this.player1, this.player2);
  }

  resolveCollision(dt) {
    const p1 = this.player1;
    const p2 = this.player2;

    const verticallyOverlapping = p1.y < p2.y + p2.height && p1.y + p1.height > p2.y;
    if (!verticallyOverlapping) return; // ジャンプで相手の上を越えている場合は押し合わない

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
    let speed = isBackward ? BACKWARD_MOVE_SPEED : MOVE_SPEED;
    if (!p1.isGrounded) speed *= AIR_SPEED_MULTIPLIER;
    p1.vx = direction * speed;
  }

  handleJumpInput() {
    if (isKeyDown("KeyW")) this.player1.jump();
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
      console.log(`Hit! ${attacker.attack.type} (${attacker.attack.strength})`);
    }
  }

  updateFacing() {
    const center1 = this.player1.x + this.player1.width / 2;
    const center2 = this.player2.x + this.player2.width / 2;
    this.player1.facing = center1 <= center2 ? 1 : -1;
    this.player2.facing = center2 <= center1 ? 1 : -1;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    drawStage(ctx, this.width);
    this.player1.draw(ctx);
    this.player2.draw(ctx);
  }
}
