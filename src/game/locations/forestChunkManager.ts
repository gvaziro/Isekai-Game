import type * as Phaser from "phaser";
import { addGroundDisplay, addPathDirtLayer } from "@/src/game/locations/groundDisplay";
import {
  chunkKey,
  FOREST_CHUNK_H,
  FOREST_CHUNK_W,
  generateForestChunkPayload,
  isForestChunkAllowed,
  type ForestForagePickup,
  worldToForestChunk,
} from "@/src/game/locations/forestChunkGen";
import type { LayoutImageProp } from "@/src/game/locations/types";

const CHUNK_LOAD_CHEB = 2;
const WORLD_PAD = 240;

export type ForestChunkManagerHooks = {
  scene: Phaser.Scene;
  getWorldSeed: () => number;
  /** Спрайт пропа + коллайдеры чанка (всё уничтожается при выгрузке чанка). */
  placeChunkLayoutProp: (chunkKey: string, p: LayoutImageProp) => Phaser.GameObjects.GameObject[];
  pushWorldObject: (obj: Phaser.GameObjects.GameObject) => void;
  /** Грибы у деревьев — как дроп на земле (живут в `MainScene.pickups`). */
  spawnChunkForestForage?: (chunkKey: string, items: readonly ForestForagePickup[]) => void;
};

/**
 * Подгрузка/выгрузка чанков бесконечного леса и их объектов Phaser.
 */
export class ForestChunkManager {
  private readonly loaded = new Map<string, Phaser.GameObjects.GameObject[]>();

  constructor(private readonly hooks: ForestChunkManagerHooks) {}

  destroy(): void {
    for (const [, objs] of this.loaded) {
      for (const o of objs) {
        o.destroy();
      }
    }
    this.loaded.clear();
  }

  /** Ключи загруженных чанков (`cx,cy`), как в `chunkKey`. */
  getLoadedChunkKeys(): string[] {
    return [...this.loaded.keys()];
  }

  /** Границы мира по загруженным чанкам (для камеры и физики). */
  computeWorldBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    let minX = 0;
    let minY = 0;
    let maxX = FOREST_CHUNK_W;
    let maxY = FOREST_CHUNK_H;
    for (const k of this.loaded.keys()) {
      const [cxStr, cyStr] = k.split(",");
      const cx = Number(cxStr);
      const cy = Number(cyStr);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      const ox = cx * FOREST_CHUNK_W;
      const oy = cy * FOREST_CHUNK_H;
      minX = Math.min(minX, ox);
      minY = Math.min(minY, oy);
      maxX = Math.max(maxX, ox + FOREST_CHUNK_W);
      maxY = Math.max(maxY, oy + FOREST_CHUNK_H);
    }
    return {
      minX: minX - WORLD_PAD,
      minY: 0,
      maxX: maxX + WORLD_PAD,
      maxY: maxY + WORLD_PAD,
    };
  }

  sync(playerX: number, playerY: number): void {
    const worldSeed = this.hooks.getWorldSeed();
    if (worldSeed === 0) return;

    const { cx: pcx, cy: pcy } = worldToForestChunk(playerX, playerY);
    const need = new Set<string>();
    for (let dcx = -CHUNK_LOAD_CHEB; dcx <= CHUNK_LOAD_CHEB; dcx++) {
      for (let dcy = -CHUNK_LOAD_CHEB; dcy <= CHUNK_LOAD_CHEB; dcy++) {
        if (Math.max(Math.abs(dcx), Math.abs(dcy)) > CHUNK_LOAD_CHEB) continue;
        const ncx = pcx + dcx;
        const ncy = pcy + dcy;
        if (!isForestChunkAllowed(ncx, ncy)) continue;
        need.add(chunkKey(ncx, ncy));
      }
    }

    for (const k of need) {
      if (!this.loaded.has(k)) {
        this.loadChunk(k, worldSeed);
      }
    }
    for (const k of [...this.loaded.keys()]) {
      if (!need.has(k)) {
        this.unloadChunk(k);
      }
    }
  }

  private unloadChunk(key: string): void {
    const objs = this.loaded.get(key);
    if (!objs) return;
    for (const o of objs) {
      o.destroy();
    }
    this.loaded.delete(key);
  }

  private loadChunk(key: string, worldSeed: number): void {
    const [cxStr, cyStr] = key.split(",");
    const cx = Number(cxStr);
    const cy = Number(cyStr);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;

    const payload = generateForestChunkPayload(cx, cy, worldSeed);
    const objs: Phaser.GameObjects.GameObject[] = [];
    const scene = this.hooks.scene;
    const ox = cx * FOREST_CHUNK_W;
    const oy = cy * FOREST_CHUNK_H;

    const bg = scene.add
      .rectangle(ox, oy, FOREST_CHUNK_W, FOREST_CHUNK_H, 0x2a4a22, 1)
      .setOrigin(0, 0)
      .setDepth(-1);
    objs.push(bg);
    this.hooks.pushWorldObject(bg);

    try {
      const ground = addGroundDisplay(
        scene,
        "forest_ground",
        FOREST_CHUNK_W,
        FOREST_CHUNK_H,
        0
      );
      ground.setPosition(ox, oy);
      ground.setDepth(0);
      objs.push(ground);
      this.hooks.pushWorldObject(ground);
    } catch {
      // текстура может отсутствовать в превью
    }

    for (const o of addPathDirtLayer(scene, payload.pathSegments, 0.15)) {
      objs.push(o);
      this.hooks.pushWorldObject(o);
    }

    for (const d of payload.grassDecor) {
      if (!scene.textures.exists("grass_decor")) continue;
      const spr = scene.add
        .image(d.x, d.y, "grass_decor", d.variant)
        .setOrigin(0.5, 1);
      spr.setDepth(d.y - 0.15 + (d.depthBias ?? 0));
      objs.push(spr);
      this.hooks.pushWorldObject(spr);
    }

    for (const p of payload.imageProps) {
      for (const o of this.hooks.placeChunkLayoutProp(key, p)) {
        objs.push(o);
      }
    }

    this.hooks.spawnChunkForestForage?.(key, payload.forestForage);

    this.loaded.set(key, objs);
  }
}
