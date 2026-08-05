export const MOVE_SPEED = 250; // px/秒（前進）
export const BACKWARD_MOVE_SPEED = 150; // px/秒（後ろ下がり）
export const FORWARD_JUMP_SPEED = 500; // px/秒（前ジャンプの水平速度）
export const BACKWARD_JUMP_SPEED = 300; // px/秒（後ろジャンプの水平速度）
export const PUSH_SPEED = 100; // px/秒（相手を押すときの速度）
export const GRAVITY = 2800; // px/秒^2（上昇中）
export const FALL_GRAVITY = 3600; // px/秒^2（下降中、上昇より速く落ちる）
export const JUMP_VELOCITY = 1300; // px/秒（上向き初速）
const HIT_FLASH_DURATION = 0.15; // 秒
const GUARD_FLASH_DURATION = 0.15; // 秒
export const MAX_HP = 10000;
const STAND_HEIGHT = 220;
const CROUCH_HEIGHT = 150; // しゃがみ時の高さ（見た目・判定用。値は仮）

export class Player {
  constructor({ x, groundY, color, facing }) {
    this.width = 100;
    this.height = STAND_HEIGHT;
    this.x = x;
    this.groundY = groundY;
    this.y = groundY - this.height;
    this.color = color;
    this.facing = facing; // 1: 右向き, -1: 左向き
    this.vx = 0;
    this.vy = 0;
    this.jumpVx = 0; // 踏み切った瞬間に固定される空中の横移動速度
    this.isGrounded = true;
    this.isCrouching = false; // Game側がSキー押下＆接地中に応じて設定する
    this.isGuarding = false; // Game/CpuControllerが後方入力＆接地中に応じて設定する
    this.attack = null; // { type, strength, data, phase, timer, hasHit }
    this.hitFlashTimer = 0;
    this.guardFlashTimer = 0;
    this.hitstunTimer = 0; // ヒット硬直。この間は一切の行動ができない
    this.blockstunTimer = 0; // ガード硬直。この間は一切の行動ができない（ガード自体は継続できる）
    this.maxHp = MAX_HP;
    this.hp = MAX_HP;
  }

  get isStunned() {
    return this.hitstunTimer > 0 || this.blockstunTimer > 0;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  // ヒットを食らった側に適用。自分の攻撃も中断される（カウンターヒットで動きが止まる）
  applyHitstun(duration) {
    this.hitstunTimer = duration;
    this.attack = null;
  }

  // ガードに成功した側に適用
  applyBlockstun(duration) {
    this.blockstunTimer = duration;
  }

  // direction: -1(左) / 0(入力なし) / 1(右) … 踏み切った瞬間の入力方向
  jump(direction) {
    if (!this.isGrounded || this.attack || this.isStunned) return;
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
    if (this.attack || this.isStunned) return; // 攻撃中・硬直中は新しい攻撃を受け付けない
    this.attack = { type, strength, data, phase: "startup", timer: 0, hasHit: false, projectileSpawned: false };
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
  // 飛び道具技（isProjectile）は本体に打撃判定を持たない（判定はProjectile側で行う）
  getHitbox() {
    if (!this.attack || this.attack.phase !== "active" || this.attack.data.isProjectile) return null;
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

  triggerGuardFlash() {
    this.guardFlashTimer = GUARD_FLASH_DURATION;
  }

  // しゃがみ状態に応じて高さを変える。足元(y+height)の位置は変えず、
  // 空中では常に立ち高さに戻す（空中でしゃがめないようにするため）
  updateCrouch() {
    const targetHeight = this.isCrouching && this.isGrounded ? CROUCH_HEIGHT : STAND_HEIGHT;
    if (this.height === targetHeight) return;
    const feetY = this.y + this.height;
    this.height = targetHeight;
    this.y = feetY - this.height;
  }

  update(dt, canvasWidth) {
    this.updateCrouch();

    const isAttacking = !!this.attack;

    if (!isAttacking && !this.isStunned) {
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
    if (this.guardFlashTimer > 0) {
      this.guardFlashTimer = Math.max(0, this.guardFlashTimer - dt);
    }
    if (this.hitstunTimer > 0) {
      this.hitstunTimer = Math.max(0, this.hitstunTimer - dt);
    }
    if (this.blockstunTimer > 0) {
      this.blockstunTimer = Math.max(0, this.blockstunTimer - dt);
    }
  }

  draw(ctx) {
    if (this.hitFlashTimer > 0) ctx.fillStyle = "#ffffff";
    else if (this.guardFlashTimer > 0) ctx.fillStyle = "#66ccff";
    else if (this.hitstunTimer > 0) ctx.fillStyle = "#994444"; // ヒット硬直中（反撃のチャンス）
    else if (this.isGuarding) ctx.fillStyle = "#3a3a5c"; // ガード構え中は少し暗い色に
    else ctx.fillStyle = this.color;
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
