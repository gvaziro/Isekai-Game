import type * as Phaser from "phaser";

/**
 * Подложка локации: тайлинг маленькой текстуры или масштаб одной большой под `world`.
 */
export function addGroundDisplay(
  scene: Phaser.Scene,
  key: string,
  worldWidth: number,
  worldHeight: number,
  depth: number
): Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite {
  if (!scene.textures.exists(key)) {
    throw new Error(`[addGroundDisplay] texture not loaded: ${key}`);
  }
  const frame = scene.textures.getFrame(key);
  const tw = frame.width;
  const th = frame.height;

  if (tw < worldWidth || th < worldHeight) {
    const ts = scene.add.tileSprite(0, 0, worldWidth, worldHeight, key);
    ts.setOrigin(0, 0);
    ts.setDepth(depth);
    return ts;
  }

  const img = scene.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth);
  if (tw !== worldWidth || th !== worldHeight) {
    img.setDisplaySize(worldWidth, worldHeight);
  }
  return img;
}

/** Дорога поверх земли: тайл `dirt` на каждый сегмент (если текстура есть). */
export function addPathDirtLayer(
  scene: Phaser.Scene,
  segments: ReadonlyArray<{ x: number; y: number; w: number; h: number }>,
  depth: number,
  textureKey = "dirt"
): Phaser.GameObjects.GameObject[] {
  if (!scene.textures.exists(textureKey)) return [];
  const out: Phaser.GameObjects.GameObject[] = [];
  for (const seg of segments) {
    const ts = scene.add.tileSprite(seg.x, seg.y, seg.w, seg.h, textureKey);
    ts.setOrigin(0, 0);
    ts.setDepth(depth);
    out.push(ts);
  }
  return out;
}
