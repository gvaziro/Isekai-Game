import type { Scene } from "phaser";

/**
 * Регистрирует в сцене текстуру-вырез из листа (как `MainScene.ensureCroppedTexture`).
 * Ключ детерминированный — повторные вызовы не дублируют текстуру.
 */
export function ensureCroppedPropTexture(
  scene: Scene,
  sourceTexture: string,
  crop: { x: number; y: number; w: number; h: number }
): string | null {
  if (!scene.textures.exists(sourceTexture)) return null;
  const key = `${sourceTexture}__crop_${crop.x}_${crop.y}_${crop.w}_${crop.h}`;
  if (scene.textures.exists(key)) return key;

  const tex = scene.textures.get(sourceTexture);
  const src = tex.getSourceImage();
  const canvas = document.createElement("canvas");
  canvas.width = crop.w;
  canvas.height = crop.h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(
    src as CanvasImageSource,
    crop.x,
    crop.y,
    crop.w,
    crop.h,
    0,
    0,
    crop.w,
    crop.h
  );
  scene.textures.addCanvas(key, canvas);
  return key;
}
