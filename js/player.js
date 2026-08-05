export const MOVE_SPEED = 250; // px/秒（前進）
export const BACKWARD_MOVE_SPEED = 150; // px/秒（後ろ下がり）
export const FORWARD_JUMP_SPEED = 500; // px/秒（前ジャンプの水平速度）
export const BACKWARD_JUMP_SPEED = 300; // px/秒（後ろジャンプの水平速度）
export const PUSH_SPEED = 100; // px/秒（相手を押すときの速度）
export const GRAVITY = 2800; // px/秒^2（上昇中）
export const FALL_GRAVITY = 3600; // px/秒^2（下降中、上昇より速く落ちる）
export const JUMP_VELOCITY = 1300; // px/秒（上向き初速）
const HIT_FLASH_DURATION = 0.15; // 秒

export class Player {
  constructor({ x, groundY, color, facing }) {
    this.width = 100;
    this.height = 220;
    this.x = x;
    this.groundY = groundY;
    this.y = groundY - this.height;
    this.color = color;
    this.facing = facing; // 1: 右向き, -1: 左向き
    this.vx = 0;
    this.vy = 0;
    this.jumpVx = 0; // 踏み切った瞬間に固定される空中の横移動速度
    this.isGrounded = true;
    this.attack = null; // { type, strength, data, phase, timer, hasHit }
    this.hitFlashTimer = 0;
  }

  // direction: -1(左) / 0(入力なし) / 1(右) … 踏み切った瞬間の入力方向
  jump(direction) {
    if (!this.isGrounded || this.attack) return;
    this.vy = -JUMP_VELOCITY;
    this.isGrounded = false;

    if (direction === 0) {
      this.jumpVx = 0; // 垂直ジャンプ
    } else if (direction === this.facing) {
      this.jumpVx = direction * FORWARD_JUMP_SPEED; // 前ジャンプ
    } else {
      this.jumpVx = direction * BACKWARD_JUMP_SPEED; // 後ろジャンプ
    }
  }

  startAttack(type, strength, data) {
    if (this.attack) return; // 攻撃中は新しい攻撃を受け付けない
    this.attack = { type, strength, data, phase: "startup", timer: 0, hasHit: false };
  }

  updateAttack(dt) {
    if (!this.attack) return;
    const a = this.attack;
    a.timer += dt;

    if (a.phase === "startup" && a.timer >= a.data.startup) {
      a.phase = "active";
      a.timer = 0;
    } else if (a.phase === "active" && a.timer >= a.data.active) {
      a.phase = "recovery";
      a.timer = 0;
    } else if (a.phase === "recovery" && a.timer >= a.data.recovery) {
      this.attack = null;
    }
  }

  // 攻撃の発生中（active）のみヒットボックスを返す
  getHitbox() {
    if (!this.attack || this.attack.phase !== "active") return null;
    const d = this.attack.data;
    const x = this.facing === 1 ? this.x + this.width : this.x - d.range;
    const y = this.y + d.offsetY;
    return { x, y, width: d.range, height: d.height };
  }

  getHurtbox() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  triggerHitFlash() {
    this.hitFlashTimer = HIT_FLASH_DURATION;
  }

  update(dt, canvasWidth) {
    const isAttacking = !!this.attack;

    if (!isAttacking) {
      const moveVx = this.isGrounded ? this.vx : this.jumpVx;
      this.x += moveVx * dt;
      this.x = Math.max(0, Math.min(canvasWidth - this.width, this.x));
    }

    this.vy += (this.vy < 0 ? GRAVITY : FALL_GRAVITY) * dt;
    this.y += this.vy * dt;

    const groundLevel = this.groundY - this.height;
    if (this.y >= groundLevel) {
      this.y = groundLevel;
      this.vy = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    this.updateAttack(dt);

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
    }
  }

  draw(ctx) {
    ctx.fillStyle = this.hitFlashTimer > 0 ? "#ffffff" : this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);

    // 向きを示すインジケーター（前面に濃い帯を表示）
    const stripeWidth = 8;
    const stripeX = this.facing === 1 ? this.x + this.width - stripeWidth : this.x;
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(stripeX, this.y, stripeWidth, this.height);

    const hitbox = this.getHitbox();
    if (hitbox) {
      ctx.fillStyle = "rgba(255, 230, 0, 0.6)";
      ctx.fillRect(hitbox.x, hitbox.y, hitbox.width, hitbox.height);
    }
  }
}
