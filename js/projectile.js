export class Projectile {
  constructor({ x, y, direction, owner, config }) {
    this.x = x;
    this.y = y;
    this.width = config.width;
    this.height = config.height;
    this.direction = direction; // 1: 右へ進む, -1: 左へ進む
    this.owner = owner; // 発射したプレイヤー（自分自身には当たらない）
    this.damage = config.damage;
    this.speed = config.speed;
    this.color = config.color || "#33ccff";
    this.hitstun = config.hitstun;
    this.blockstun = config.blockstun;
    this.dead = false;
  }

  update(dt, canvasWidth) {
    this.x += this.direction * this.speed * dt;
    if (this.x + this.width < 0 || this.x > canvasWidth) this.dead = true;
  }

  getHitbox() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  draw(ctx) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}
