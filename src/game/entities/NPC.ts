import * as Phaser from "phaser";
import type { NpcRoute } from "@/src/game/types";
import { syncPixelCrawlerNpcFeetHitbox } from "@/src/game/entities/Player";

export type PatrolNpcConfig = {
  id: string;
  idleTextureKey: string;
  idleAnim: string;
  /** Анимация ходьбы по умолчанию (юг). */
  runAnim: string;
  /** Анимация ходьбы на север (опционально). */
  walkNAnim?: string;
  /** Анимация ходьбы на восток/запад (опционально; запад — та же + flipX). */
  walkEAnim?: string;
  /** Idle на север (опционально). */
  idleNAnim?: string;
  /** Idle на восток (запад — east + flipX). */
  idleEAnim?: string;
  route: NpcRoute;
  displayName?: string;
};

const ARRIVAL_RADIUS = 20;
const SEPARATION_RADIUS = 28;
const SEP_STRENGTH = 0.5;
const VELOCITY_LERP = 0.18;
/** Тиков с блокировкой до первого nudge. */
const STUCK_NUDGE_TICKS = 45;
/** Тиков с блокировкой до пропуска waypoint. */
const STUCK_SKIP_TICKS = 90;

export class PatrolNpc extends Phaser.Physics.Arcade.Sprite {
  readonly npcId: string;
  readonly displayName?: string;
  private readonly route: NpcRoute;
  private readonly idleAnim: string;
  private readonly idleNAnim: string | undefined;
  private readonly idleEAnim: string | undefined;
  private readonly runAnim: string;
  private readonly walkNAnim: string | undefined;
  private readonly walkEAnim: string | undefined;
  /** Последняя ось ходьбы для выбора idle-клипа (s / n / e). */
  private idleFacing: "s" | "n" | "e" = "s";
  /** Запоминаем flip при ходьбе на восток/запад для того же idle. */
  private lastFlipX = false;
  private wpIndex = 0;
  private mode: "walk" | "idle" | "talk" | "intro_hold" = "walk";
  private idleUntil = 0;

  /** Пока true — не показывать [E] и не открывать диалог (интро-ход Маркуса). */
  interactionDisabled = false;

  /** Счётчик тиков в состоянии "заблокирован коллайдером". */
  private stuckTicks = 0;
  /** Знак перпендикулярного nudge (инвертируется при пропуске waypoint). */
  private nudgeSign = 1;

  /** Текущая сглаженная скорость по X. */
  private smoothVx = 0;
  /** Текущая сглаженная скорость по Y. */
  private smoothVy = 0;

  constructor(scene: Phaser.Scene, config: PatrolNpcConfig) {
    super(
      scene,
      config.route.spawn.x,
      config.route.spawn.y,
      config.idleTextureKey,
      0
    );
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);
    this.npcId = config.id;
    this.displayName = config.displayName;
    this.route = config.route;
    this.idleAnim = config.idleAnim;
    this.idleNAnim = config.idleNAnim;
    this.idleEAnim = config.idleEAnim;
    this.runAnim = config.runAnim;
    this.walkNAnim = config.walkNAnim;
    this.walkEAnim = config.walkEAnim;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    syncPixelCrawlerNpcFeetHitbox(this);
    this.setScale(1);
    this.playDirectionalIdle();
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    syncPixelCrawlerNpcFeetHitbox(this);
  }

  beginTalk(): void {
    this.mode = "talk";
    this.smoothVx = 0;
    this.smoothVy = 0;
    this.setVelocity(0, 0);
    this.playDirectionalIdle();
  }

  /** Ждать конец пролога (оверлей); патруль не крутится. */
  beginIntroHold(): void {
    this.mode = "intro_hold";
    this.smoothVx = 0;
    this.smoothVy = 0;
    this.setVelocity(0, 0);
    this.playDirectionalIdle();
  }

  releaseIntroHold(): void {
    if (this.mode === "intro_hold") {
      this.mode = "walk";
    }
  }

  get introHoldActive(): boolean {
    return this.mode === "intro_hold";
  }

  setInteractionDisabled(value: boolean): void {
    this.interactionDisabled = value;
  }

  endTalk(): void {
    this.mode = "walk";
  }

  updatePatrol(time: number, neighbors?: PatrolNpc[]): void {
    if (this.mode === "talk" || this.mode === "intro_hold") return;

    if (!this.route.waypoints?.length) {
      this.smoothVx = 0;
      this.smoothVy = 0;
      this.setVelocity(0, 0);
      this.playIdleIfNeeded();
      return;
    }

    if (this.mode === "idle") {
      if (time >= this.idleUntil) {
        this.wpIndex =
          (this.wpIndex + 1) %
          Math.max(1, this.route.waypoints.length);
        this.mode = "walk";
      } else {
        this.playIdleIfNeeded();
      }
      return;
    }

    // ── walk ─────────────────────────────────────────────────────────────

    const target =
      this.route.waypoints[this.wpIndex] ?? this.route.spawn;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.hypot(dx, dy);
    const speed = this.route.speed;

    if (len < ARRIVAL_RADIUS) {
      this.smoothVx = 0;
      this.smoothVy = 0;
      this.setVelocity(0, 0);
      this.stuckTicks = 0;
      const [a, b] = this.route.idleMs;
      const idle = a + Math.random() * Math.max(1, b - a);
      this.idleUntil = time + idle;
      this.mode = "idle";
      return;
    }

    // Нормированное направление к цели
    const nx = dx / len;
    const ny = dy / len;

    // Базовый вектор скорости к цели
    let tvx = nx * speed;
    let tvy = ny * speed;

    // Separation: отталкивание от соседних NPC
    if (neighbors) {
      let sepX = 0;
      let sepY = 0;
      for (const other of neighbors) {
        if (other === this) continue;
        const odx = this.x - other.x;
        const ody = this.y - other.y;
        const d = Math.hypot(odx, ody);
        if (d > 0 && d < SEPARATION_RADIUS) {
          const w = 1 - d / SEPARATION_RADIUS;
          sepX += (odx / d) * w;
          sepY += (ody / d) * w;
        }
      }
      tvx += sepX * speed * SEP_STRENGTH;
      tvy += sepY * speed * SEP_STRENGTH;
    }

    // Плавное сближение скорости с целевым значением (lerp)
    this.smoothVx += (tvx - this.smoothVx) * VELOCITY_LERP;
    this.smoothVy += (tvy - this.smoothVy) * VELOCITY_LERP;

    const body = this.body as Phaser.Physics.Arcade.Body;
    const isBlocked =
      body.blocked.left ||
      body.blocked.right ||
      body.blocked.up ||
      body.blocked.down;

    if (isBlocked) {
      this.stuckTicks++;

      if (this.stuckTicks >= STUCK_SKIP_TICKS) {
        // Пропустить waypoint — слишком долго застряли
        this.stuckTicks = 0;
        this.nudgeSign *= -1;
        this.smoothVx = 0;
        this.smoothVy = 0;
        this.setVelocity(0, 0);
        this.wpIndex =
          (this.wpIndex + 1) %
          Math.max(1, this.route.waypoints.length);
        this.mode = "idle";
        this.idleUntil = time + 300;
        return;
      }

      if (this.stuckTicks >= STUCK_NUDGE_TICKS) {
        // Боковой nudge перпендикулярно направлению движения
        const perpX = -ny * this.nudgeSign;
        const perpY = nx * this.nudgeSign;
        this.smoothVx += perpX * speed * 0.7;
        this.smoothVy += perpY * speed * 0.7;
      }
    } else {
      this.stuckTicks = 0;
    }

    this.setVelocity(this.smoothVx, this.smoothVy);

    const walkAnim = this.resolveWalkAnim(this.smoothVx, this.smoothVy);
    const ax = Math.abs(this.smoothVx);
    const ay = Math.abs(this.smoothVy);
    if (ax >= ay) {
      this.idleFacing = "e";
      this.lastFlipX = this.smoothVx < 0;
      this.setFlipX(this.lastFlipX);
    } else {
      this.idleFacing = this.smoothVy < 0 ? "n" : "s";
      this.setFlipX(false);
    }
    if (this.scene.anims.exists(walkAnim)) {
      if (this.anims.currentAnim?.key !== walkAnim) {
        this.anims.play(walkAnim, true);
      }
    }
  }

  /**
   * Выбирает анимацию ходьбы по вектору скорости.
   * При движении преимущественно по горизонтали — east (запад = east + flipX).
   * При движении преимущественно по вертикали — south или north.
   */
  private resolveWalkAnim(vx: number, vy: number): string {
    const ax = Math.abs(vx);
    const ay = Math.abs(vy);
    if (ax >= ay) {
      return this.walkEAnim ?? this.runAnim;
    }
    if (vy < 0) {
      return this.walkNAnim ?? this.runAnim;
    }
    return this.runAnim;
  }

  /** Запускает idle-анимацию только если она ещё не играет. */
  private playIdleIfNeeded(): void {
    const anim = this.resolveIdleAnim();
    if (!this.scene.anims.exists(anim)) return;
    if (anim === this.idleEAnim && this.idleEAnim) {
      this.setFlipX(this.lastFlipX);
    } else {
      this.setFlipX(false);
    }
    if (this.anims.currentAnim?.key !== anim) {
      this.anims.play(anim, true);
    }
  }

  private resolveIdleAnim(): string {
    if (
      this.idleFacing === "n" &&
      this.idleNAnim &&
      this.scene.anims.exists(this.idleNAnim)
    ) {
      return this.idleNAnim;
    }
    if (
      this.idleFacing === "e" &&
      this.idleEAnim &&
      this.scene.anims.exists(this.idleEAnim)
    ) {
      return this.idleEAnim;
    }
    return this.idleAnim;
  }

  private playDirectionalIdle(): void {
    const anim = this.resolveIdleAnim();
    if (!this.scene.anims.exists(anim)) return;
    if (anim === this.idleEAnim && this.idleEAnim) {
      this.setFlipX(this.lastFlipX);
    } else {
      this.setFlipX(false);
    }
    this.anims.play(anim, true);
  }
}
