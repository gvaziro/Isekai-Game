import * as Phaser from "phaser";
import type { NpcRoute } from "@/src/game/types";
import { syncPixelCrawlerNpcFeetHitbox } from "@/src/game/entities/Player";

export type PatrolNpcConfig = {
  id: string;
  idleTextureKey: string;
  idleAnim: string;
  runAnim: string;
  route: NpcRoute;
  displayName?: string;
};

export class PatrolNpc extends Phaser.Physics.Arcade.Sprite {
  readonly npcId: string;
  readonly displayName?: string;
  private readonly route: NpcRoute;
  private readonly idleAnim: string;
  private readonly runAnim: string;
  private wpIndex = 0;
  private mode: "walk" | "idle" | "talk" = "walk";
  private idleUntil = 0;

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
    this.runAnim = config.runAnim;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    syncPixelCrawlerNpcFeetHitbox(this);
    if (scene.anims.exists(this.idleAnim)) {
      this.anims.play(this.idleAnim, true);
    }
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    syncPixelCrawlerNpcFeetHitbox(this);
  }

  beginTalk(): void {
    this.mode = "talk";
    this.setVelocity(0, 0);
    if (this.anims.exists(this.idleAnim)) {
      this.anims.play(this.idleAnim, true);
    }
  }

  endTalk(): void {
    this.mode = "walk";
  }

  updatePatrol(time: number): void {
    if (this.mode === "talk") return;

    if (!this.route.waypoints?.length) {
      this.setVelocity(0, 0);
      if (this.anims.exists(this.idleAnim)) {
        this.anims.play(this.idleAnim, true);
      }
      return;
    }

    if (this.mode === "idle") {
      if (time >= this.idleUntil) {
        this.wpIndex =
          (this.wpIndex + 1) %
          Math.max(1, this.route.waypoints.length);
        this.mode = "walk";
      } else if (this.anims.exists(this.idleAnim)) {
        this.anims.play(this.idleAnim, true);
      }
      return;
    }

    const target =
      this.route.waypoints[this.wpIndex] ?? this.route.spawn;
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const len = Math.hypot(dx, dy);
    const speed = this.route.speed;

    if (len < 8) {
      this.setVelocity(0, 0);
      const [a, b] = this.route.idleMs;
      const idle = a + Math.random() * Math.max(1, b - a);
      this.idleUntil = time + idle;
      this.mode = "idle";
      return;
    }

    const vx = (dx / len) * speed;
    const vy = (dy / len) * speed;
    this.setVelocity(vx, vy);

    if (Math.abs(vx) > 0.2) {
      this.setFlipX(vx < 0);
    }
    if (this.anims.exists(this.runAnim)) {
      this.anims.play(this.runAnim, true);
    }
  }
}
