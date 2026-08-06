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
export const MAX_SUPER_GAUGE = 100;
const STAND_HEIGHT = 220;
const CROUCH_HEIGHT = 150; // しゃがみ時の高さ（見た目・判定用。値は仮）
const MAX_SPRITE_ASPECT = 0.9; // 立ち絵の「横幅 / 高さ」の上限（仮値）。格闘ゲームキャラは縦長が基本という前提
const WALK_FRAME_DISTANCE = 30; // px。この距離進むごとに次の歩行コマに切り替える（仮値）
const CROUCH_TRANSITION_DURATION = 0.15; // 秒。立ち⇔しゃがみの遷移コマを最後まで再生するのにかかる時間（仮値）

export class Player {
  constructor({ x, groundY, color, facing, sprite = null, crouchSprite = null, walkSprites = [], crouchTransitionSprites = [], guardSprite = null, attackSprites = {} }) {
    this.width = 100;
    this.height = STAND_HEIGHT;
    this.x = x;
    this.groundY = groundY;
    this.y = groundY - this.height;
    this.color = color;
    this.facing = facing; // 1: 右向き, -1: 左向き
    this.sprite = sprite; // 立ち絵画像（右向き基準）。無ければ図形描画にフォールバックする
    this.crouchSprite = crouchSprite; // しゃがみ絵（右向き基準）。無ければ立ち絵を使う
    this.walkSprites = walkSprites; // 歩行コマ画像の配列（右向き基準）。無ければ立ち絵のまま歩く
    this.crouchTransitionSprites = crouchTransitionSprites; // 立ち⇔しゃがみの遷移コマ配列。無ければ遷移なしで切り替わる
    this.crouchTransitionProgress = 0; // 0=立ち, 1=しゃがみ切り
    this.guardSprite = guardSprite; // 立ちガード絵（右向き基準）。無ければ通常のポーズに暗い色が乗るだけになる
    this.attackSprites = attackSprites; // { "punch_heavy": { startup, active }, ... }。無ければ立ち絵のまま攻撃する
    this.isWalking = false;
    this.walkCycleDistance = 0; // 歩行コマ切り替え用に、歩いた距離を積算する
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
    this.maxSuperGauge = MAX_SUPER_GAUGE;
    this.superGauge = 0; // ダメージのやり取りで溜まり、満タン時のみSAが出せる
  }

  get isStunned() {
    return this.hitstunTimer > 0 || this.blockstunTimer > 0;
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
  }

  gainSuperGauge(amount) {
    this.superGauge = Math.min(this.maxSuperGauge, this.superGauge + amount);
  }

  hasFullSuperGauge() {
    return this.superGauge >= this.maxSuperGauge;
  }

  consumeSuperGauge() {
    this.superGauge = 0;
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

  // 立ち⇔しゃがみの見た目の遷移（当たり判定の高さ自体はupdateCrouch()で即座に切り替わる）。
  // 0(立ち)〜1(しゃがみ切り)の間を一定速度で行き来し、遷移コマ絵の選択に使う
  updateCrouchTransition(dt) {
    const target = this.isCrouching && this.isGrounded ? 1 : 0;
    const step = dt / CROUCH_TRANSITION_DURATION;
    if (this.crouchTransitionProgress < target) {
      this.crouchTransitionProgress = Math.min(target, this.crouchTransitionProgress + step);
    } else if (this.crouchTransitionProgress > target) {
      this.crouchTransitionProgress = Math.max(target, this.crouchTransitionProgress - step);
    }
  }

  update(dt, canvasWidth) {
    this.updateCrouch();
    this.updateCrouchTransition(dt);

    const isAttacking = !!this.attack;

    if (!isAttacking && !this.isStunned) {
      const moveVx = this.isGrounded ? this.vx : this.jumpVx;
      this.x += moveVx * dt;
      this.x = Math.max(0, Math.min(canvasWidth - this.width, this.x));
    }

    // 歩行アニメーション用: 地上を実際に移動しているときだけ距離を積算する
    this.isWalking = !isAttacking && !this.isStunned && this.isGrounded && this.vx !== 0;
    if (this.isWalking) {
      this.walkCycleDistance += Math.abs(this.vx) * dt;
    } else {
      this.walkCycleDistance = 0;
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

  // 状態に応じたオーバーレイ色（画像にも図形にも共通で使う）
  getStateTint() {
    if (this.hitFlashTimer > 0) return { color: "#ffffff", alpha: 0.85 };
    if (this.guardFlashTimer > 0) return { color: "#66ccff", alpha: 0.6 };
    if (this.hitstunTimer > 0) return { color: "#994444", alpha: 0.45 }; // ヒット硬直中（反撃のチャンス）
    // ガード構え中は少し暗く。ただし専用のガード絵を表示中はそれ自体で分かるため重ねない
    if (this.isGuarding && !(this.guardSprite && !this.isCrouching)) return { color: "#000000", alpha: 0.3 };
    return null;
  }

  // 攻撃ポーズ絵 > 立ちガード絵(しゃがみ中は除く) > 立ち⇔しゃがみ遷移コマ/しゃがみ絵 > 歩行コマ > 立ち絵 の優先順位で選ぶ
  // （それぞれ無ければ次点にフォールバック）。しゃがみガードには専用絵が無いため、
  // しゃがみ中はガード絵より従来通りしゃがみ絵を優先する
  getCurrentSprite() {
    const attackSprite = this.getAttackSprite();
    if (attackSprite) return attackSprite;

    if (this.isGuarding && !this.isCrouching && this.guardSprite) {
      return this.guardSprite;
    }

    if (this.crouchTransitionSprites.length > 0) {
      // 遷移コマがある場合は、進捗(0〜1)に応じて遷移コマを切り替える。
      // 専用のしゃがみ絵は使わず、遷移コマの最後のコマをそのまましゃがみ姿勢として扱う
      if (this.crouchTransitionProgress > 0) {
        const frameCount = this.crouchTransitionSprites.length;
        const index = Math.min(frameCount - 1, Math.floor(this.crouchTransitionProgress * frameCount));
        return this.crouchTransitionSprites[index];
      }
    } else if (this.isCrouching && this.crouchSprite) {
      // 遷移コマが無ければ、これまで通り即座にしゃがみ絵へ切り替える
      return this.crouchSprite;
    }

    if (this.isWalking && this.walkSprites.length > 0) {
      const frameCount = this.walkSprites.length;
      let index = Math.floor(this.walkCycleDistance / WALK_FRAME_DISTANCE) % frameCount;
      // 歩行コマは前進の歩き（1→2→3...）を撮ったもの。後退中は同じコマを逆順に再生することで、
      // 新しい画像を用意せずに自然な後退の足運びに見せる
      const movingDirection = Math.sign(this.vx);
      const isMovingBackward = movingDirection !== 0 && movingDirection !== this.facing;
      if (isMovingBackward) index = frameCount - 1 - index;
      return this.walkSprites[index];
    }
    return this.sprite;
  }

  // 攻撃中、その技専用のポーズ絵があれば返す。フェーズ内に複数コマある場合は、
  // そのフェーズの経過時間の割合に応じて何コマ目を表示するか決める（例: 波動拳の溜め動作）。
  // recovery用の絵は用意しない前提で、activeの最終コマをそのまま流用する（無ければstartupの最終コマ）
  getAttackSprite() {
    if (!this.attack) return null;
    const a = this.attack;
    const poseSet = this.attackSprites[`${a.type}_${a.strength}`];
    if (!poseSet) return null;

    const startupFrames = poseSet.startup || [];
    const activeFrames = poseSet.active || [];

    if (a.phase === "startup" && startupFrames.length > 0) {
      const progress = Math.min(0.999, a.timer / a.data.startup);
      return startupFrames[Math.floor(progress * startupFrames.length)];
    }

    if (activeFrames.length > 0) return activeFrames[activeFrames.length - 1];
    if (startupFrames.length > 0) return startupFrames[startupFrames.length - 1];
    return null;
  }

  // 攻撃モーション用の見た目だけの前後オフセット（当たり判定には一切影響しない）。
  // 技のリーチ(range)に応じて突き出し量を決め、startupで踏み込み→activeで最大→recoveryで戻る
  getAttackVisualOffset() {
    if (!this.attack) return 0;
    const a = this.attack;
    const peak = a.data.range * 0.25;
    if (peak === 0) return 0; // 波動拳など、その場で出す技は動かさない

    let progress;
    if (a.phase === "startup") progress = (a.timer / a.data.startup) * 0.5;
    else if (a.phase === "active") progress = 1;
    else progress = 1 - a.timer / a.data.recovery; // recovery

    progress = Math.max(0, Math.min(1, progress));
    return this.facing * peak * progress;
  }

  draw(ctx) {
    const offsetX = this.getAttackVisualOffset();
    const sprite = this.getCurrentSprite();
    if (sprite) this.drawSprite(ctx, sprite, offsetX);
    else this.drawRect(ctx, offsetX);

    const hitbox = this.getHitbox();
    if (hitbox) {
      ctx.fillStyle = "rgba(255, 230, 0, 0.6)";
      ctx.fillRect(hitbox.x + offsetX, hitbox.y, hitbox.width, hitbox.height);
    }
  }

  drawRect(ctx, offsetX) {
    if (this.hitFlashTimer > 0) ctx.fillStyle = "#ffffff";
    else if (this.guardFlashTimer > 0) ctx.fillStyle = "#66ccff";
    else if (this.hitstunTimer > 0) ctx.fillStyle = "#994444"; // ヒット硬直中（反撃のチャンス）
    else if (this.isGuarding) ctx.fillStyle = "#3a3a5c"; // ガード構え中は少し暗い色に
    else ctx.fillStyle = this.color;
    const x = this.x + offsetX;
    ctx.fillRect(x, this.y, this.width, this.height);

    // 向きを示すインジケーター（前面に濃い帯を表示）
    const stripeWidth = 8;
    const stripeX = this.facing === 1 ? x + this.width - stripeWidth : x;
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(stripeX, this.y, stripeWidth, this.height);
  }

  // 画像を足元基準・アスペクト比維持で描画する（ハートボックスとは別サイズになりうる）。
  // 表示サイズは常に立ち高さ(STAND_HEIGHT)基準の固定値にし、しゃがみ中でもハートボックスが
  // 縮んだ分だけ画像まで縮小されないようにする（足元の位置だけは実際のハートボックスに合わせる）。
  // 横長すぎる画像（スカーフ等の装飾で横に広がっている場合など）は、他方のキャラと
  // 見た目のサイズが揃うよう、高さに対する横幅の比率に上限をかける
  drawSprite(ctx, img, offsetX) {
    const displayHeight = STAND_HEIGHT;
    const rawAspect = img.naturalWidth / img.naturalHeight;
    const aspect = Math.min(rawAspect, MAX_SPRITE_ASPECT);
    const displayWidth = displayHeight * aspect;
    const centerX = this.x + offsetX + this.width / 2;
    const feetY = this.y + this.height;

    ctx.save();
    ctx.translate(centerX, feetY);
    if (this.facing === -1) ctx.scale(-1, 1); // 画像は右向き基準。左向きなら反転する
    ctx.drawImage(img, -displayWidth / 2, -displayHeight, displayWidth, displayHeight);

    const tint = this.getStateTint();
    if (tint) {
      ctx.globalCompositeOperation = "source-atop"; // 画像の不透明部分にのみ色を重ねる
      ctx.globalAlpha = tint.alpha;
      ctx.fillStyle = tint.color;
      ctx.fillRect(-displayWidth / 2, -displayHeight, displayWidth, displayHeight);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }
}
