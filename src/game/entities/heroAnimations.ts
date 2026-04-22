import * as Phaser from "phaser";
import type { PixelCrawlerHeroManifest } from "@/src/game/types";

export type HeroFacing = "side" | "up" | "down";

export type HeroAttackStyle = "slice" | "pierce" | "crush";

export type HeroInteractKind = "collect" | "fishing" | "watering";

type OneShotKind = "hit" | "death" | "attack" | "interact";

/**
 * Приоритеты: смерть > удар > атака/взаимодействие (one-shot) > ношение > ходьба.
 * Защита от повторного входа в Hit, пока не завершён клип.
 */
export class HeroAnimController {
  private readonly sprite: Phaser.Physics.Arcade.Sprite;
  private readonly hero: PixelCrawlerHeroManifest;
  private facing: HeroFacing = "down";
  private flipX = false;
  private carrying = false;
  private attackStyle: HeroAttackStyle = "slice";
  private activeOneShot: OneShotKind | null = null;
  private hitLock = false;
  private deathStarted = false;
  private completeListener?: (anim: Phaser.Animations.Animation) => void;
  /** Снять слушатели из scheduleMeleeImpactOnce (перед новым ударом / forceIdle). */
  private meleeImpactCleanup?: () => void;

  constructor(sprite: Phaser.Physics.Arcade.Sprite, hero: PixelCrawlerHeroManifest) {
    this.sprite = sprite;
    this.hero = hero;
  }

  getFacing(): HeroFacing {
    return this.facing;
  }

  setCarrying(value: boolean): void {
    this.carrying = value;
  }

  setAttackStyle(style: HeroAttackStyle): void {
    this.attackStyle = style;
  }

  isDeathSequence(): boolean {
    return this.deathStarted;
  }

  isOneShotBlocking(): boolean {
    return this.activeOneShot !== null;
  }

  resetAfterRespawn(): void {
    this.detachCompleteListener();
    this.activeOneShot = null;
    this.hitLock = false;
    this.deathStarted = false;
    this.sprite.anims.timeScale = 1;
  }

  private detachCompleteListener(): void {
    if (this.completeListener) {
      this.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE, this.completeListener);
      this.completeListener = undefined;
    }
  }

  /** Снять текущий one-shot (кроме смерти), чтобы прервать атаку/сбор и проиграть Hit. */
  private cancelRunningOneShot(): void {
    if (this.activeOneShot === "death") return;
    this.detachCompleteListener();
    this.activeOneShot = null;
  }

  private playIfExists(key: string, ignoreIfPlaying = false): boolean {
    if (!this.sprite.scene?.anims.exists(key)) return false;
    if (ignoreIfPlaying && this.sprite.anims.isPlaying && this.sprite.anims.currentAnim?.key === key) {
      return true;
    }
    this.sprite.anims.play(key, true);
    return true;
  }

  private pickHitKey(): string {
    if (this.facing === "side") return this.hero.hitSide;
    if (this.facing === "up") return this.hero.hitUp;
    return this.hero.hitDown;
  }

  private pickDeathKey(): string {
    if (this.facing === "side") return this.hero.deathSide;
    if (this.facing === "up") return this.hero.deathUp;
    return this.hero.deathDown;
  }

  private pickAttackKey(): string {
    const h = this.hero;
    if (this.attackStyle === "pierce") {
      if (this.facing === "side") return h.pierceSide;
      if (this.facing === "up") return h.pierceUp;
      return h.pierceDown;
    }
    if (this.attackStyle === "crush") {
      if (this.facing === "side") return h.crushSide;
      if (this.facing === "up") return h.crushUp;
      return h.crushDown;
    }
    if (this.facing === "side") return h.sliceSide;
    if (this.facing === "up") return h.sliceUp;
    return h.sliceDown;
  }

  private pickInteractKey(kind: HeroInteractKind): string {
    const h = this.hero;
    if (kind === "fishing") {
      if (this.facing === "side") return h.fishingSide;
      if (this.facing === "up") return h.fishingUp;
      return h.fishingDown;
    }
    if (kind === "watering") {
      if (this.facing === "side") return h.wateringSide;
      if (this.facing === "up") return h.wateringUp;
      return h.wateringDown;
    }
    if (this.facing === "side") return h.collectSide;
    if (this.facing === "up") return h.collectUp;
    return h.collectDown;
  }

  private pickIdleKey(): string {
    const h = this.hero;
    if (this.carrying) {
      if (this.facing === "side") return h.carryIdleSide;
      if (this.facing === "up") return h.carryIdleUp;
      return h.carryIdleDown;
    }
    if (this.facing === "side") return h.idleSide;
    if (this.facing === "up") return h.idleUp;
    return h.idleDown;
  }

  private pickWalkKey(vx: number, vy: number): string {
    const h = this.hero;
    const pick = (side: string, up: string, down: string) => {
      const ax = Math.abs(vx);
      const ay = Math.abs(vy);
      if (ax >= ay && ax > 0.02) return side;
      if (vy < -0.02) return up;
      return down;
    };
    if (this.carrying) {
      return pick(h.carryWalkSide, h.carryWalkUp, h.carryWalkDown);
    }
    return pick(h.walkSide, h.walkUp, h.walkDown);
  }

  private pickRunKey(vx: number, vy: number): string {
    const h = this.hero;
    const ax = Math.abs(vx);
    const ay = Math.abs(vy);
    const side = this.carrying ? h.carryRunSide : h.runSide;
    const up = this.carrying ? h.carryRunUp : h.runUp;
    const down = this.carrying ? h.carryRunDown : h.runDown;
    if (ax >= ay && ax > 0.02) return side;
    if (vy < -0.02) return up;
    return down;
  }

  private armOneShot(kind: OneShotKind, animKey: string, onDone: () => void): void {
    this.detachCompleteListener();
    this.activeOneShot = kind;
    this.completeListener = (anim) => {
      if (anim.key !== animKey) return;
      this.detachCompleteListener();
      this.activeOneShot = null;
      if (kind === "hit") this.hitLock = false;
      onDone();
    };
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, this.completeListener);
    this.playIfExists(animKey);
  }

  /** Вызывать при hp > 0 после урона (не во время смерти). */
  tryPlayHit(): void {
    if (this.deathStarted || this.hitLock) return;
    const key = this.pickHitKey();
    if (!this.sprite.scene?.anims.exists(key)) return;
    this.cancelRunningOneShot();
    this.hitLock = true;
    this.armOneShot("hit", key, () => {});
  }

  /**
   * Один раз при переходе hp > 0 → 0. Колбэк после окончания клипа смерти.
   */
  startDeath(onComplete: () => void): void {
    if (this.deathStarted) return;
    this.deathStarted = true;
    const key = this.pickDeathKey();
    if (!this.sprite.scene?.anims.exists(key)) {
      this.deathStarted = false;
      onComplete();
      return;
    }
    this.armOneShot("death", key, () => {
      this.deathStarted = false;
      onComplete();
    });
  }

  /**
   * Ближний удар (скорость клипа как в данных анимации, без timeScale под кулдаун).
   * @returns true, если клип реально запущен — для кулдауна и SFX без лишних срабатываний.
   */
  tryPlayMeleeAttack(): boolean {
    if (this.deathStarted || this.activeOneShot) return false;
    const key = this.pickAttackKey();
    if (!this.sprite.scene?.anims.exists(key)) return false;
    this.armOneShot("attack", key, () => {});
    return true;
  }

  /**
   * Однократный колбэк в момент «контакта» по кадру атаки (предпоследний кадр — чуть раньше конца клипа).
   * Вызывать сразу после успешного tryPlayMeleeAttack().
   */
  scheduleMeleeImpactOnce(onImpact: () => void): void {
    this.clearMeleeImpactSchedule();
    const animKey = this.pickAttackKey();
    let fired = false;
    const done = () => {
      if (fired) return;
      fired = true;
      this.clearMeleeImpactSchedule();
      onImpact();
    };
    const onAnimUpdate = (
      animation: Phaser.Animations.Animation,
      frame: Phaser.Animations.AnimationFrame
    ) => {
      if (animation.key !== animKey || animation.frames.length === 0) return;
      const n = animation.frames.length;
      const idx = n >= 2 ? n - 2 : n - 1;
      const impactFrame = animation.frames[idx]!;
      const isImpact =
        frame === impactFrame ||
        (frame.textureFrame === impactFrame.textureFrame &&
          frame.textureKey === impactFrame.textureKey);
      if (isImpact) done();
    };
    const onAnimComplete = (animation: Phaser.Animations.Animation) => {
      if (animation.key !== animKey) return;
      done();
    };
    this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, onAnimUpdate);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onAnimComplete);
    this.meleeImpactCleanup = () => {
      this.sprite.off(Phaser.Animations.Events.ANIMATION_UPDATE, onAnimUpdate);
      this.sprite.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onAnimComplete);
      this.meleeImpactCleanup = undefined;
    };
  }

  private clearMeleeImpactSchedule(): void {
    this.meleeImpactCleanup?.();
  }

  tryPlayInteract(kind: HeroInteractKind): void {
    if (this.deathStarted || this.activeOneShot) return;
    const key = this.pickInteractKey(kind);
    if (!this.sprite.scene?.anims.exists(key)) return;
    this.armOneShot("interact", key, () => {});
  }

  updateFacingFromVelocity(vx: number, vy: number): void {
    const ax = Math.abs(vx);
    const ay = Math.abs(vy);
    if (ax >= ay && ax > 0.02) {
      this.facing = "side";
      this.flipX = vx < 0;
    } else if (vy < -0.02) {
      this.facing = "up";
      this.flipX = false;
    } else if (vy > 0.02) {
      this.facing = "down";
      this.flipX = false;
    }
  }

  /**
   * Направление ближнего удара: к курсору в мире. Если вектор почти нулевой — как при движении (fallbackVx/Vy).
   */
  setMeleeFacingFromAim(
    dx: number,
    dy: number,
    fallbackVx: number,
    fallbackVy: number
  ): void {
    const len = Math.hypot(dx, dy);
    if (len < 10) {
      this.updateFacingFromVelocity(fallbackVx, fallbackVy);
      this.applyFlipToSprite();
      return;
    }
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax >= ay) {
      this.facing = "side";
      this.flipX = dx < 0;
    } else if (dy < 0) {
      this.facing = "up";
      this.flipX = false;
    } else {
      this.facing = "down";
      this.flipX = false;
    }
    this.applyFlipToSprite();
  }

  applyFlipToSprite(): void {
    this.sprite.setFlipX(this.flipX);
  }

  /**
   * Локомоция и простой idle (без one-shot). Не вызывать, пока активен блокирующий клип.
   */
  updateLocomotion(opts: {
    moving: boolean;
    vx: number;
    vy: number;
    sprintingMove: boolean;
  }): void {
    if (this.deathStarted || this.activeOneShot) return;

    const { moving, vx, vy, sprintingMove } = opts;
    if (moving) {
      this.updateFacingFromVelocity(vx, vy);
      this.applyFlipToSprite();
      const key = sprintingMove ? this.pickRunKey(vx, vy) : this.pickWalkKey(vx, vy);
      this.sprite.anims.timeScale = 1;
      this.playIfExists(key, true);
    } else {
      this.sprite.anims.timeScale = 1;
      this.applyFlipToSprite();
      this.playIfExists(this.pickIdleKey(), true);
    }
  }

  forceIdle(): void {
    if (this.deathStarted) return;
    if (this.activeOneShot === "death") return;
    this.clearMeleeImpactSchedule();
    this.cancelRunningOneShot();
    this.hitLock = false;
    this.sprite.anims.timeScale = 1;
    this.applyFlipToSprite();
    this.playIfExists(this.pickIdleKey(), true);
  }

  destroy(): void {
    this.detachCompleteListener();
    this.clearMeleeImpactSchedule();
  }
}
