import * as Phaser from "phaser";
import type { EnemyGruntScaledStats } from "@/src/game/data/balance";
import { syncPixelCrawlerNpcFeetHitbox } from "@/src/game/entities/Player";

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

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    syncPixelCrawlerNpcFeetHitbox(this);
    if (scene.anims.exists(this.idleAnim)) {
      this.anims.play(this.idleAnim, true);
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
      syncPixelCrawlerNpcFeetHitbox(this);
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
    this.setPosition(this.spawnX, this.spawnY);
    this.setVelocity(0, 0);
    this.setAlpha(1);
    this.clearTint();

    const body = this.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setEnable(true);
    syncPixelCrawlerNpcFeetHitbox(this);

    if (this.levelLabel?.active) {
      this.levelLabel.setText(`Lv ${this.level}`);
      this.levelLabel.setVisible(true);
    }
    this.hpBarBg.setVisible(true);
    this.hpBarFill.setVisible(true);
    this.refreshHpBarVisual();

    if (this.scene.anims.exists(this.idleAnim)) {
      this.anims.play(this.idleAnim, true);
    }
    this.layoutHpBar();
  }

  markDead(): void {
    if (this.state === "dead") return;
    this.state = "dead";
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
    if (this.hpBarBg?.active) this.hpBarBg.destroy(fromScene);
    if (this.hpBarFill?.active) this.hpBarFill.destroy(fromScene);
    if (this.levelLabel?.active) this.levelLabel.destroy(fromScene);
    super.destroy(fromScene);
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

    if (!inCombat) {
      const dx = this.spawnX - this.x;
      const dy = this.spawnY - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 10) {
        this.setVelocity(0, 0);
        if (this.scene.anims.exists(this.idleAnim)) {
          this.anims.play(this.idleAnim, true);
        }
        this.state = "idle";
      } else {
        const len = d || 1;
        this.setVelocity((dx / len) * this.speed, (dy / len) * this.speed);
        if (this.scene.anims.exists(this.runAnim)) {
          this.anims.play(this.runAnim, true);
        }
        this.setFlipX(dx < 0);
        this.state = "chase";
      }
      return;
    }

    if (distPlayer <= this.attackRange && time >= this.attackCooldownUntil) {
      this.setVelocity(0, 0);
      this.attackCooldownUntil = time + this.attackCooldownMs;
      if (this.scene.anims.exists(this.idleAnim)) {
        this.anims.play(this.idleAnim, true);
      }
      onStrikePlayer(this.attackDamage);
      return;
    }

    if (distPlayer <= this.attackRange) {
      this.setVelocity(0, 0);
      if (this.scene.anims.exists(this.idleAnim)) {
        this.anims.play(this.idleAnim, true);
      }
      return;
    }

    const len =
      Math.hypot(playerX - this.x, playerY - this.y) ||
      1;
    this.setVelocity(
      ((playerX - this.x) / len) * this.speed,
      ((playerY - this.y) / len) * this.speed
    );
    if (this.scene.anims.exists(this.runAnim)) {
      this.anims.play(this.runAnim, true);
    }
    this.setFlipX(this.x > playerX);
    this.state = "chase";
  }
}
