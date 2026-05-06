import * as Phaser from "phaser";
import type { EnemyGruntScaledStats } from "@/src/game/data/balance";
import { syncPixelCrawlerNpcFeetHitbox } from "@/src/game/entities/Player";

const STEER_EPS = 1e-4;
const DIRECTIONAL_MOB_FOOT_W = 12;
const DIRECTIONAL_MOB_FOOT_H = 10;
const DIRECTIONAL_MOB_BASELINE_Y = 40;
const STUCK_CHECK_INTERVAL_MS = 220;
const STUCK_GRACE_MS = 300;
const AVOIDANCE_MS = 820;
const AVOIDANCE_COOLDOWN_MS = 1040;
const AVOIDANCE_PERP_WEIGHT = 1.15;

type WallFlags = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
};

type MobFacing = "up" | "down" | "side";

function mergeTouchingAndBlocked(
  body: Phaser.Physics.Arcade.Body
): WallFlags {
  const t = body.touching;
  const b = body.blocked;
  return {
    left: t.left || b.left,
    right: t.right || b.right,
    up: t.up || b.up,
    down: t.down || b.down,
  };
}

/** Убирает составляющую скорости в сторону стены, с которой уже контакт. */
function wallSlideVelocity(
  vx: number,
  vy: number,
  wall: WallFlags
): { vx: number; vy: number } {
  let x = vx;
  let y = vy;
  if (wall.left && x < 0) x = 0;
  if (wall.right && x > 0) x = 0;
  if (wall.up && y < 0) y = 0;
  if (wall.down && y > 0) y = 0;
  return { vx: x, vy: y };
}

function hashAvoidanceSide(id: string): 1 | -1 {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  }
  return (h & 1) === 0 ? 1 : -1;
}

export type EnemyMobConfig = {
  instanceId: string;
  /** Ключ в manifest.mobs; для задержки респавна. */
  mobVisualId: string;
  zoneId: string;
  lootTableId: string;
  spawnX: number;
  spawnY: number;
  hp: number;
  /** Броня для формулы урона игрока по этому экземпляру. */
  armor: number;
  /** Уровень (награда XP, подпись над полоской HP). */
  level: number;
  speed: number;
  attackRange: number;
  attackDamage: number;
  attackCooldownMs: number;
  aggroRadius: number;
  loseAggroRadius: number;
  leashRadius: number;
  idleAnim: string;
  runAnim: string;
  textureKey: string;
  /** Направленный моб (idleAnimSide/runAnimSide + attackAnim* заданы). */
  idleAnimUp?: string;
  idleAnimDown?: string;
  idleAnimSide?: string;
  runAnimUp?: string;
  runAnimDown?: string;
  runAnimSide?: string;
  attackAnimUp?: string;
  attackAnimDown?: string;
  attackAnimSide?: string;
  attackStrikeDelayMs?: number;
};

/**
 * Простой враг: агро по дистанции к игроку, гистерезис и лиз к спавну;
 * вне боя возвращается на спавн.
 */
export class EnemyMob extends Phaser.Physics.Arcade.Sprite {
  readonly instanceId: string;
  readonly mobVisualId: string;
  readonly zoneId: string;
  readonly lootTableId: string;
  readonly spawnX: number;
  readonly spawnY: number;
  hp: number;
  maxHp: number;
  armor: number;
  level: number;

  private readonly hpBarW = 34;
  private readonly hpBarH = 6;
  private readonly hpBarPad = 1;
  private hpBarBg: Phaser.GameObjects.Rectangle;
  private hpBarFill: Phaser.GameObjects.Rectangle;
  private levelLabel: Phaser.GameObjects.Text;
  speed: number;
  attackRange: number;
  attackDamage: number;
  attackCooldownMs: number;
  readonly aggroRadius: number;
  readonly loseAggroRadius: number;
  readonly leashRadius: number;
  readonly idleAnim: string;
  readonly runAnim: string;

  private readonly isDirectional: boolean;
  private readonly avoidanceSide: 1 | -1;
  private facing: MobFacing = "down";
  private readonly idleAnimUp?: string;
  private readonly idleAnimDown?: string;
  private readonly idleAnimSide?: string;
  private readonly runAnimUp?: string;
  private readonly runAnimDown?: string;
  private readonly runAnimSide?: string;
  private readonly attackAnimUp?: string;
  private readonly attackAnimDown?: string;
  private readonly attackAnimSide?: string;
  private readonly attackStrikeDelayMs: number;

  private attackAnimPlaying = false;
  private facingLockUntil = 0;
  private avoidUntil = 0;
  private avoidCooldownUntil = 0;
  private stuckSince = 0;
  private lastStuckCheckAt = 0;
  private lastStuckX = 0;
  private lastStuckY = 0;
  private lastTargetDist = Infinity;
  private attackCompleteListener?:
    | ((animation: Phaser.Animations.Animation) => void)
    | undefined;
  private strikeTimer: Phaser.Time.TimerEvent | null = null;

  state: "idle" | "chase" | "dead" = "idle";
  attackCooldownUntil = 0;
  /** Игрок вошёл в радиус агро; сбрасывается при отходе или лизе. */
  private aggroActive = false;

  constructor(scene: Phaser.Scene, x: number, y: number, cfg: EnemyMobConfig) {
    super(scene, x, y, cfg.textureKey, 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1);

    this.instanceId = cfg.instanceId;
    this.avoidanceSide = hashAvoidanceSide(cfg.instanceId);
    this.mobVisualId = cfg.mobVisualId;
    this.zoneId = cfg.zoneId;
    this.lootTableId = cfg.lootTableId;
    this.spawnX = cfg.spawnX;
    this.spawnY = cfg.spawnY;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.armor = cfg.armor;
    this.level = cfg.level;
    this.speed = cfg.speed;
    this.attackRange = cfg.attackRange;
    this.attackDamage = cfg.attackDamage;
    this.attackCooldownMs = cfg.attackCooldownMs;
    this.aggroRadius = cfg.aggroRadius;
    this.loseAggroRadius = cfg.loseAggroRadius;
    this.leashRadius = cfg.leashRadius;
    this.idleAnim = cfg.idleAnim;
    this.runAnim = cfg.runAnim;

    this.idleAnimUp = cfg.idleAnimUp;
    this.idleAnimDown = cfg.idleAnimDown;
    this.idleAnimSide = cfg.idleAnimSide;
    this.runAnimUp = cfg.runAnimUp;
    this.runAnimDown = cfg.runAnimDown;
    this.runAnimSide = cfg.runAnimSide;
    this.attackAnimUp = cfg.attackAnimUp;
    this.attackAnimDown = cfg.attackAnimDown;
    this.attackAnimSide = cfg.attackAnimSide;
    this.attackStrikeDelayMs = Math.max(
      0,
      Math.floor(cfg.attackStrikeDelayMs ?? 0)
    );

    this.isDirectional = Boolean(
      cfg.idleAnimSide &&
        cfg.idleAnimDown &&
        cfg.runAnimSide &&
        cfg.runAnimDown &&
        cfg.attackAnimSide &&
        cfg.attackAnimDown &&
        cfg.attackAnimUp &&
        cfg.runAnimUp &&
        cfg.idleAnimUp
    );

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    this.syncMobFeetHitbox();
    const idleKey = this.currentIdleKey();
    if (scene.anims.exists(idleKey)) {
      this.anims.play(idleKey, true);
    }

    const topY = this.y - this.displayHeight - 8;
    this.levelLabel = scene.add
      .text(this.x, topY - 10, `Lv ${cfg.level}`, {
        fontSize: "10px",
        fontFamily: "monospace",
        color: "#fdba74",
      })
      .setOrigin(0.5, 1)
      .setDepth(9990);
    this.hpBarBg = scene.add
      .rectangle(this.x, topY, this.hpBarW, this.hpBarH, 0x1a1a1a, 0.92)
      .setOrigin(0.5, 0.5)
      .setStrokeStyle(1, 0x0f0f0f, 1);
    this.hpBarFill = scene.add
      .rectangle(
        this.x - this.hpBarW / 2 + this.hpBarPad,
        topY,
        this.hpBarW - this.hpBarPad * 2,
        this.hpBarH - this.hpBarPad * 2,
        0x4ade80,
        1
      )
      .setOrigin(0, 0.5);
    this.refreshHpBarVisual();
    this.resetStuckTracking();
  }

  private currentIdleKey(): string {
    if (!this.isDirectional) return this.idleAnim;
    if (this.facing === "up") return this.idleAnimUp ?? this.idleAnim;
    if (this.facing === "down") return this.idleAnimDown ?? this.idleAnim;
    return this.idleAnimSide ?? this.idleAnim;
  }

  private currentRunKey(): string {
    if (!this.isDirectional) return this.runAnim;
    if (this.facing === "up") return this.runAnimUp ?? this.runAnim;
    if (this.facing === "down") return this.runAnimDown ?? this.runAnim;
    return this.runAnimSide ?? this.runAnim;
  }

  private currentAttackKey(): string | undefined {
    if (!this.isDirectional) return undefined;
    if (this.facing === "up") return this.attackAnimUp;
    if (this.facing === "down") return this.attackAnimDown;
    return this.attackAnimSide;
  }

  private syncMobFeetHitbox(): void {
    if (!this.isDirectional) {
      syncPixelCrawlerNpcFeetHitbox(this);
      return;
    }

    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) return;
    const fw = Math.max(1, Math.round(this.frame?.width ?? 64));
    const fh = Math.max(1, Math.round(this.frame?.height ?? 64));
    const baseline = Math.min(fh - 1, DIRECTIONAL_MOB_BASELINE_Y);

    // У слайма в attack-листах есть снаряд/частицы ниже тела. Хитбокс должен
    // держаться на базовой линии тела, иначе physics body скачет за частицами.
    this.setOrigin(0.5, Math.min(1, (baseline + 1) / fh));
    body.setSize(DIRECTIONAL_MOB_FOOT_W, DIRECTIONAL_MOB_FOOT_H);
    body.setOffset(
      (fw - DIRECTIONAL_MOB_FOOT_W) / 2,
      Math.max(0, baseline - DIRECTIONAL_MOB_FOOT_H + 1)
    );
  }

  /** Обновляет facing и flip; для недирективных мобов — только flip по dx. */
  private updateFacingToward(tx: number, ty: number, time = 0): void {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (!this.isDirectional) {
      if (adx > STEER_EPS || ady > STEER_EPS) {
        this.setFlipX(dx < 0);
      }
      return;
    }

    if (time < this.facingLockUntil) return;

    const prevFacing = this.facing;
    if (ady >= adx) {
      this.facing = dy < 0 ? "up" : "down";
      this.setFlipX(false);
    } else {
      this.facing = "side";
      this.setFlipX(dx < 0);
    }
    if (this.facing !== prevFacing) {
      this.facingLockUntil = time + 120;
    }
  }

  private clearAttackListener(): void {
    if (this.attackCompleteListener) {
      this.off(
        Phaser.Animations.Events.ANIMATION_COMPLETE,
        this.attackCompleteListener
      );
      this.attackCompleteListener = undefined;
    }
  }

  private cancelPendingStrike(): void {
    this.strikeTimer?.remove(false);
    this.strikeTimer = null;
  }

  private resetStuckTracking(): void {
    this.avoidUntil = 0;
    this.avoidCooldownUntil = 0;
    this.stuckSince = 0;
    this.lastStuckCheckAt = 0;
    this.lastStuckX = this.x;
    this.lastStuckY = this.y;
    this.lastTargetDist = Infinity;
  }

  private updateStuckAvoidance(
    time: number,
    targetX: number,
    targetY: number,
    targetDist: number
  ): void {
    if (targetDist <= this.attackRange + 8) {
      this.stuckSince = 0;
      return;
    }
    if (time < this.avoidUntil) return;
    if (time - this.lastStuckCheckAt < STUCK_CHECK_INTERVAL_MS) return;

    const moved = Math.hypot(this.x - this.lastStuckX, this.y - this.lastStuckY);
    const progress = this.lastTargetDist - targetDist;
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    const wall = body ? mergeTouchingAndBlocked(body) : undefined;
    const touchingWall = Boolean(
      wall && (wall.left || wall.right || wall.up || wall.down)
    );
    const notAdvancing = moved < 3 || progress < 2;

    if (notAdvancing && touchingWall) {
      this.stuckSince ||= time;
      if (
        time - this.stuckSince >= STUCK_GRACE_MS &&
        time >= this.avoidCooldownUntil
      ) {
        this.avoidUntil = time + AVOIDANCE_MS;
        this.avoidCooldownUntil = time + AVOIDANCE_COOLDOWN_MS;
        this.stuckSince = 0;
      }
    } else {
      this.stuckSince = 0;
    }

    this.lastStuckCheckAt = time;
    this.lastStuckX = this.x;
    this.lastStuckY = this.y;
    this.lastTargetDist = Math.hypot(targetX - this.x, targetY - this.y);
  }

  /** Одноразовая атака-клип + урон в нужный момент клипа. */
  private playStrikeAnimation(onStrikePlayer: (rawAtk: number) => void): void {
    const atkKey = this.currentAttackKey();
    this.clearAttackListener();
    this.cancelPendingStrike();

    if (atkKey && this.scene.anims.exists(atkKey)) {
      this.attackAnimPlaying = true;
      const handler = (animation: Phaser.Animations.Animation) => {
        if (animation.key !== atkKey) return;
        this.clearAttackListener();
        this.attackAnimPlaying = false;
      };
      this.attackCompleteListener = handler;
      this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, handler);
      this.anims.play(atkKey, true);
      const delay = this.attackStrikeDelayMs;
      if (delay > 0) {
        this.strikeTimer = this.scene.time.delayedCall(delay, () => {
          this.strikeTimer = null;
          if (this.state === "dead") return;
          onStrikePlayer(this.attackDamage);
        });
      } else {
        onStrikePlayer(this.attackDamage);
      }
    } else {
      const idleKey = this.currentIdleKey();
      if (this.scene.anims.exists(idleKey)) {
        this.anims.play(idleKey, true);
      }
      onStrikePlayer(this.attackDamage);
    }
  }

  /** Позиция и depth — после `setDepth(y)` у спрайта в сцене. */
  layoutHpBar(): void {
    if (!this.hpBarBg.active) return;
    if (this.state === "dead") return;
    const topY = this.y - this.displayHeight - 8;
    this.hpBarBg.setPosition(this.x, topY);
    this.hpBarBg.setDepth(this.depth + 0.02);
    this.refreshHpBarVisual();
    this.hpBarFill.setPosition(
      this.x - this.hpBarW / 2 + this.hpBarPad,
      topY
    );
    this.hpBarFill.setDepth(this.depth + 0.03);
    if (this.levelLabel?.active) {
      this.levelLabel.setPosition(this.x, topY - 10);
      this.levelLabel.setDepth(this.depth + 0.01);
    }
  }

  private refreshHpBarVisual(): void {
    const ratio = Math.max(0, Math.min(1, this.hp / this.maxHp));
    const innerMax = this.hpBarW - this.hpBarPad * 2;
    const w = innerMax * ratio;
    this.hpBarFill.setSize(w, this.hpBarH - this.hpBarPad * 2);
    let col = 0x4ade80;
    if (ratio < 0.3) col = 0xef4444;
    else if (ratio < 0.55) col = 0xfbbf24;
    this.hpBarFill.setFillStyle(col, 1);
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.state !== "dead") {
      this.syncMobFeetHitbox();
    }
  }

  /** @returns true если здоровье <= 0 после удара */
  applyDamage(amount: number): boolean {
    if (this.state === "dead") return false;
    this.hp -= amount;
    this.refreshHpBarVisual();
    return this.hp <= 0;
  }

  /**
   * Полный респавн на точке: новые статы уровня, сброс визуала и HP-бара.
   * Не создаёт второй экземпляр с тем же `instanceId`.
   */
  reviveAtSpawn(stats: EnemyGruntScaledStats): void {
    if (this.state !== "dead") return;

    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.armor = stats.armor;
    this.level = stats.level;
    this.speed = stats.speed;
    this.attackRange = stats.attackRange;
    this.attackDamage = stats.atk;
    this.attackCooldownMs = stats.attackCooldownMs;

    this.state = "idle";
    this.attackCooldownUntil = 0;
    this.aggroActive = false;
    this.resetStuckTracking();
    this.facing = "down";
    this.setFlipX(false);
    this.clearAttackListener();
    this.cancelPendingStrike();
    this.attackAnimPlaying = false;
    this.setPosition(this.spawnX, this.spawnY);
    this.setVelocity(0, 0);
    this.setAlpha(1);
    this.clearTint();

    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setEnable(true);
    this.syncMobFeetHitbox();

    if (this.levelLabel?.active) {
      this.levelLabel.setText(`Lv ${this.level}`);
      this.levelLabel.setVisible(true);
    }
    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true);
    this.refreshHpBarVisual();

    const idleKey = this.currentIdleKey();
    if (this.scene.anims.exists(idleKey)) {
      this.anims.play(idleKey, true);
    }
    this.layoutHpBar();
  }

  markDead(): void {
    if (this.state === "dead") return;
    this.state = "dead";
    this.clearAttackListener();
    this.cancelPendingStrike();
    this.attackAnimPlaying = false;
    this.setVelocity(0, 0);
    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setEnable(false);
    this.setAlpha(0.38);
    this.setTint(0x555555);
    this.anims.pause();
    this.hpBarBg.setVisible(false);
    this.hpBarFill.setVisible(false);
    if (this.levelLabel?.active) this.levelLabel.setVisible(false);
  }

  override destroy(fromScene?: boolean): void {
    this.clearAttackListener();
    this.cancelPendingStrike();
    if (this.hpBarBg?.active) this.hpBarBg.destroy(fromScene);
    if (this.hpBarFill?.active) this.hpBarFill.destroy(fromScene);
    if (this.levelLabel?.active) this.levelLabel.destroy(fromScene);
    super.destroy(fromScene);
  }

  /**
   * Движение к точке с «скольжением» вдоль коллайдеров (по `touching`/`blocked`
   * с прошлого шага физики) и веером из 8 направлений, если прямой вектор полностью упёрся.
   */
  private applySteerVelocity(targetX: number, targetY: number, time: number): void {
    const speed = this.speed;
    if (speed <= STEER_EPS) {
      this.setVelocity(0, 0);
      return;
    }

    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const goalNx = dx / dist;
    const goalNy = dy / dist;
    let desiredNx = goalNx;
    let desiredNy = goalNy;

    if (time < this.avoidUntil) {
      const side = this.avoidanceSide;
      desiredNx = goalNx + -goalNy * side * AVOIDANCE_PERP_WEIGHT;
      desiredNy = goalNy + goalNx * side * AVOIDANCE_PERP_WEIGHT;
      const desiredLen = Math.hypot(desiredNx, desiredNy) || 1;
      desiredNx /= desiredLen;
      desiredNy /= desiredLen;
    }

    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) {
      this.setVelocity(desiredNx * speed, desiredNy * speed);
      return;
    }

    const wall = mergeTouchingAndBlocked(body);

    const vx0 = desiredNx * speed;
    const vy0 = desiredNy * speed;
    const slid = wallSlideVelocity(vx0, vy0, wall);
    const len = Math.hypot(slid.vx, slid.vy);

    if (len > STEER_EPS) {
      const scale = speed / len;
      this.setVelocity(slid.vx * scale, slid.vy * scale);
      return;
    }

    let bestDot = -Infinity;
    let bestVx = 0;
    let bestVy = 0;

    for (let i = 0; i < 8; i++) {
      const ang = (i * Math.PI) / 4;
      const cx = Math.cos(ang) * speed;
      const cy = Math.sin(ang) * speed;
      const cSlid = wallSlideVelocity(cx, cy, wall);
      const cLen = Math.hypot(cSlid.vx, cSlid.vy);
      if (cLen <= STEER_EPS) continue;
      const nx = cSlid.vx / cLen;
      const ny = cSlid.vy / cLen;
      const dot = nx * desiredNx + ny * desiredNy;
      if (dot > bestDot) {
        bestDot = dot;
        const scale = speed / cLen;
        bestVx = cSlid.vx * scale;
        bestVy = cSlid.vy * scale;
      }
    }

    if (bestDot > -Infinity) {
      this.setVelocity(bestVx, bestVy);
    } else {
      this.setVelocity(0, 0);
    }
  }

  updateAi(
    time: number,
    ctx: {
      playerX: number;
      playerY: number;
      onStrikePlayer: (rawAtk: number) => void;
    }
  ): void {
    if (this.state === "dead") return;

    const { playerX, playerY, onStrikePlayer } = ctx;

    const distPlayer = Math.hypot(playerX - this.x, playerY - this.y);
    const distFromSpawn = Math.hypot(
      this.x - this.spawnX,
      this.y - this.spawnY
    );

    if (distFromSpawn > this.leashRadius) {
      this.aggroActive = false;
    } else if (this.aggroActive && distPlayer > this.loseAggroRadius) {
      this.aggroActive = false;
    } else if (!this.aggroActive && distPlayer <= this.aggroRadius) {
      this.aggroActive = true;
    }

    const inCombat = this.aggroActive;

    if (this.attackAnimPlaying) {
      this.setVelocity(0, 0);
      return;
    }

    if (!inCombat) {
      const dx = this.spawnX - this.x;
      const dy = this.spawnY - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) {
        this.setVelocity(0, 0);
        if (!this.attackAnimPlaying) {
          const idleKey = this.currentIdleKey();
          if (this.scene.anims.exists(idleKey)) {
            this.anims.play(idleKey, true);
          }
        }
        this.state = "idle";
      } else {
        this.updateFacingToward(this.spawnX, this.spawnY, time);
        this.updateStuckAvoidance(time, this.spawnX, this.spawnY, d);
        this.applySteerVelocity(this.spawnX, this.spawnY, time);
        if (!this.attackAnimPlaying) {
          const runKey = this.currentRunKey();
          if (this.scene.anims.exists(runKey)) {
            this.anims.play(runKey, true);
          }
        }
        if (!this.isDirectional) {
          this.setFlipX(dx < 0);
        }
        this.state = "chase";
      }
      return;
    }

    if (distPlayer <= this.attackRange && time >= this.attackCooldownUntil) {
      this.setVelocity(0, 0);
      this.updateFacingToward(playerX, playerY, time);
      this.attackCooldownUntil = time + this.attackCooldownMs;
      this.playStrikeAnimation(onStrikePlayer);
      return;
    }

    if (distPlayer <= this.attackRange) {
      this.setVelocity(0, 0);
      if (!this.attackAnimPlaying) {
        this.updateFacingToward(playerX, playerY, time);
        const idleKey = this.currentIdleKey();
        if (this.scene.anims.exists(idleKey)) {
          this.anims.play(idleKey, true);
        }
      }
      return;
    }

    this.updateFacingToward(playerX, playerY, time);
    this.updateStuckAvoidance(time, playerX, playerY, distPlayer);
    this.applySteerVelocity(playerX, playerY, time);
    if (!this.attackAnimPlaying) {
      const runKey = this.currentRunKey();
      if (this.scene.anims.exists(runKey)) {
        this.anims.play(runKey, true);
      }
    }
    if (!this.isDirectional) {
      this.setFlipX(this.x > playerX);
    }
    this.state = "chase";
  }
}
