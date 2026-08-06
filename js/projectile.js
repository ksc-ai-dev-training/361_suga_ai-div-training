const SPRITE_DISPLAY_HEIGHT = 100; // px（仮値）。当たり判定(height)とは独立した見た目上の表示高さ
const SPRITE_FRAME_DURATION = 0.08; // 秒（仮値）。この間隔でコマを切り替え、発光が揺らめいて見えるようにする

export class Projectile {
  constructor({ x, y, direction, owner, config, sprites = null }) {
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
    this.sprites = sprites && sprites.length > 0 ? sprites : null; // 弾本体の見た目コマ（右向き基準）。無ければ図形描画にフォールバック
    this.animTimer = 0;
    this.dead = false;
  }

  update(dt, canvasWidth) {
    this.x += this.direction * this.speed * dt;
    if (this.x + this.width < 0 || this.x > canvasWidth) this.dead = true;
    this.animTimer += dt;
  }

  getHitbox() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  draw(ctx) {
    if (this.sprites) this.drawSprite(ctx);
    else this.drawShape(ctx);
  }

  drawShape(ctx) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.ellipse(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, this.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 見た目のサイズは当たり判定(width/height)とは独立した固定の表示高さ(SPRITE_DISPLAY_HEIGHT)で描画する。
  // 中心を当たり判定の中心に合わせ、進行方向が逆(direction===-1)のときは水平反転する
  // （画像は右向き＝direction=1基準で用意する想定）
  drawSprite(ctx) {
    const frameIndex = Math.floor(this.animTimer / SPRITE_FRAME_DURATION) % this.sprites.length;
    const img = this.sprites[frameIndex];
    const displayHeight = SPRITE_DISPLAY_HEIGHT;
    const displayWidth = displayHeight * (img.naturalWidth / img.naturalHeight);
    const centerX = this.x + this.width / 2;
    const centerY = this.y + this.height / 2;

    ctx.save();
    ctx.translate(centerX, centerY);
    if (this.direction === -1) ctx.scale(-1, 1);
    ctx.drawImage(img, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
    ctx.restore();
  }
}
