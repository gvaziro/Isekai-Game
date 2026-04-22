import * as Phaser from "phaser";

const FRAME_PC = 64;
const frameOpaqueBottomCache = new Map<string, number>();

function frameOpaqueBottom(sprite: Phaser.Physics.Arcade.Sprite): number {
  const fr = sprite.frame;
  if (!fr) return FRAME_PC - 17;
  const texKey = sprite.texture.key;
  const frameName = String(fr.name ?? "__base__");
  const cacheKey = `${texKey}::${frameName}::${Math.round(fr.width)}x${Math.round(fr.height)}`;
  const cached = frameOpaqueBottomCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const src = sprite.texture.getSourceImage();
    if (!(src instanceof HTMLImageElement) && !(src instanceof HTMLCanvasElement)) {
      const fallback = Math.max(0, Math.round(fr.height) - 17);
      frameOpaqueBottomCache.set(cacheKey, fallback);
      return fallback;
    }

    const fw = Math.max(1, Math.round(fr.width));
    const fh = Math.max(1, Math.round(fr.height));
    const sx = Math.round((fr as unknown as { cutX?: number }).cutX ?? 0);
    const sy = Math.round((fr as unknown as { cutY?: number }).cutY ?? 0);
    const sw = Math.max(
      1,
      Math.round((fr as unknown as { cutWidth?: number }).cutWidth ?? fw)
    );
    const sh = Math.max(
      1,
      Math.round((fr as unknown as { cutHeight?: number }).cutHeight ?? fh)
    );

    const canvas = document.createElement("canvas");
    canvas.width = fw;
    canvas.height = fh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      const fallback = Math.max(0, Math.round(fr.height) - 17);
      frameOpaqueBottomCache.set(cacheKey, fallback);
      return fallback;
    }

    ctx.clearRect(0, 0, fw, fh);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, fw, fh);
    const data = ctx.getImageData(0, 0, fw, fh).data;

    let bottom = -1;
    for (let y = fh - 1; y >= 0 && bottom < 0; y--) {
      for (let x = 0; x < fw; x++) {
        const a = data[(y * fw + x) * 4 + 3];
        if (a > 0) {
          bottom = y;
          break;
        }
      }
    }

    const resolved = bottom >= 0 ? bottom : Math.max(0, fh - 17);
    frameOpaqueBottomCache.set(cacheKey, resolved);
    return resolved;
  } catch {
    return Math.max(0, Math.round(fr.height) - 17);
  }
}

function syncFeetHitboxToVisibleBottom(
  sprite: Phaser.Physics.Arcade.Sprite,
  footW: number,
  footH: number
): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body;
  const fw = Math.max(1, Math.round(sprite.frame?.width ?? FRAME_PC));
  const fh = Math.max(1, Math.round(sprite.frame?.height ?? FRAME_PC));
  const bottom = frameOpaqueBottom(sprite);
  // Привязываем world-y спрайта к видимым ногам, а не к низу пустого 64x64 кадра.
  sprite.setOrigin(0.5, Math.min(1, (bottom + 1) / fh));
  body.setSize(footW, footH);
  body.setOffset((fw - footW) / 2, Math.max(0, bottom - footH + 1));
}

/** Хитбокс у ног для Pixel Crawler героя Body_A (кадр 64×64). */
export function applyPixelCrawlerFeetHitbox(
  sprite: Phaser.Physics.Arcade.Sprite
): void {
  const w = 14;
  const h = 10;
  syncFeetHitboxToVisibleBottom(sprite, w, h);
}

/**
 * NPC Pixel Crawler: idle 32×32, run 64×64 — подгоняем хитбокс у ног под текущий кадр.
 * Вызывать после смены анимации / в update.
 */
export function syncPixelCrawlerNpcFeetHitbox(
  sprite: Phaser.Physics.Arcade.Sprite,
  footW = 12,
  footH = 10
): void {
  syncFeetHitboxToVisibleBottom(sprite, footW, footH);
}
