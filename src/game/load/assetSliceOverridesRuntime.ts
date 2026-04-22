import * as Phaser from "phaser";
import {
  getAssetSourceSlice,
  isSliceEditableKey,
} from "@/src/game/data/assetSourceSlices";
import type { PropCollider } from "@/src/game/locations/types";

export type SlicePx = { left: number; top: number; width: number; height: number };

/** Событие после успешного POST `/api/dev/asset-slices` — игра/редактор подхватывают JSON без перезагрузки вкладки. */
export const ASSET_SLICE_OVERRIDES_UPDATED_EVENT =
  "nagibatop:asset-slice-overrides-saved";

export const ASSET_SLICE_OVERRIDES_BROADCAST_CHANNEL =
  "nagibatop-asset-slice-overrides";

/** После применения вырезов из JSON — пересобрать коллизии пропов / оверлеи редактора. */
export const ASSET_SLICE_OVERRIDES_TEXTURES_APPLIED =
  "nagibatop-slice-overrides-textures-applied";

function parseSlicePx(v: unknown): SlicePx | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.left === "number" &&
    Number.isFinite(o.left) &&
    o.left >= 0 &&
    typeof o.top === "number" &&
    Number.isFinite(o.top) &&
    o.top >= 0 &&
    typeof o.width === "number" &&
    Number.isFinite(o.width) &&
    o.width >= 1 &&
    typeof o.height === "number" &&
    Number.isFinite(o.height) &&
    o.height >= 1
  ) {
    return {
      left: Math.floor(o.left),
      top: Math.floor(o.top),
      width: Math.floor(o.width),
      height: Math.floor(o.height),
    };
  }
  return null;
}

function clampSlicePx(r: SlicePx, iw: number, ih: number): SlicePx {
  let { left, top, width, height } = r;
  width = Math.max(1, Math.min(width, iw));
  height = Math.max(1, Math.min(height, ih));
  left = Math.max(0, Math.min(left, iw - width));
  top = Math.max(0, Math.min(top, ih - height));
  return { left, top, width, height };
}

function sourceNaturalSize(
  src: HTMLImageElement | HTMLCanvasElement | Phaser.GameObjects.RenderTexture
): { iw: number; ih: number } {
  if (src instanceof HTMLImageElement) {
    return { iw: src.naturalWidth || src.width, ih: src.naturalHeight || src.height };
  }
  if (src instanceof HTMLCanvasElement) {
    return { iw: src.width, ih: src.height };
  }
  const rt = src as Phaser.GameObjects.RenderTexture;
  return { iw: rt.width, ih: rt.height };
}

/** Разбор тела `asset-slice-overrides.json` (или ответа fetch) в карту вырезов. */
export function parseSliceOverridesFromJson(raw: unknown): Record<string, SlicePx> {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, SlicePx> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k === "updatedAt" || k.startsWith("$")) continue;
    if (!isSliceEditableKey(k)) continue;
    const s = parseSlicePx(v);
    if (s) out[k] = s;
  }
  return out;
}

/**
 * Читает `sliceOverrides` из кэша Phaser (JSON должен быть загружен в preload).
 */
export function readSliceOverridesMap(scene: Phaser.Scene): Record<string, SlicePx> {
  const raw = scene.cache.json.get("sliceOverrides");
  return parseSliceOverridesFromJson(raw);
}

type OpaqueFrameCollider = { w: number; h: number; oy: number };

const opaqueFrameColliderCache = new Map<string, OpaqueFrameCollider>();

function opaqueFrameColliderCacheKey(
  textureKey: string,
  frameName: number | string | undefined,
  fr: Phaser.Textures.Frame
): string {
  const fx = Math.round(((fr as unknown as { cutX?: number }).cutX ?? 0) * 1000) / 1000;
  const fy = Math.round(((fr as unknown as { cutY?: number }).cutY ?? 0) * 1000) / 1000;
  return `${textureKey}::${String(frameName ?? "__base__")}::${Math.round(
    fr.width
  )}x${Math.round(fr.height)}::${fx}:${fy}`;
}

function clearOpaqueFrameColliderCache(textureKey?: string): void {
  if (!textureKey) {
    opaqueFrameColliderCache.clear();
    return;
  }
  for (const key of Array.from(opaqueFrameColliderCache.keys())) {
    if (key.startsWith(`${textureKey}::`)) {
      opaqueFrameColliderCache.delete(key);
    }
  }
}

/**
 * Находит ограничивающий прямоугольник непрозрачных пикселей внутри кадра и
 * возвращает коллайдер в координатах пропа `(x, y)` с origin `(0.5, 1)`.
 *
 * Это устраняет "невидимый блок" сверху/снизу, когда внутри выбранного кадра
 * есть прозрачные поля: коллизия строится по видимой форме, а не по размеру
 * всей ячейки/выреза.
 */
function opaqueFrameCollider(
  scene: Phaser.Scene,
  textureKey: string,
  frame: number | undefined
): OpaqueFrameCollider | null {
  if (!scene.textures.exists(textureKey)) return null;
  try {
    const texture = scene.textures.get(textureKey);
    const frameName = frame !== undefined && Number.isFinite(frame) ? frame : undefined;
    const fr =
      frameName !== undefined ? texture.get(frameName) : texture.get();
    const cacheKey = opaqueFrameColliderCacheKey(textureKey, frameName, fr);
    const cached = opaqueFrameColliderCache.get(cacheKey);
    if (cached) return cached;

    const fw = Math.max(1, Math.round(fr.width));
    const fh = Math.max(1, Math.round(fr.height));
    const sx = Math.round((fr as unknown as { cutX?: number }).cutX ?? 0);
    const sy = Math.round((fr as unknown as { cutY?: number }).cutY ?? 0);
    const sw = Math.max(1, Math.round((fr as unknown as { cutWidth?: number }).cutWidth ?? fw));
    const sh = Math.max(
      1,
      Math.round((fr as unknown as { cutHeight?: number }).cutHeight ?? fh)
    );

    const src = texture.getSourceImage();
    if (!(src instanceof HTMLImageElement) && !(src instanceof HTMLCanvasElement)) {
      const fallback = { w: fw, h: fh, oy: fh / 2 };
      opaqueFrameColliderCache.set(cacheKey, fallback);
      return fallback;
    }

    const canvas = document.createElement("canvas");
    canvas.width = fw;
    canvas.height = fh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      const fallback = { w: fw, h: fh, oy: fh / 2 };
      opaqueFrameColliderCache.set(cacheKey, fallback);
      return fallback;
    }

    ctx.clearRect(0, 0, fw, fh);
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, fw, fh);

    const data = ctx.getImageData(0, 0, fw, fh).data;
    let minX = fw;
    let minY = fh;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < fh; y++) {
      for (let x = 0; x < fw; x++) {
        const alpha = data[(y * fw + x) * 4 + 3];
        if (alpha <= 0) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    const collider =
      maxX >= minX && maxY >= minY
        ? {
            w: maxX - minX + 1,
            h: maxY - minY + 1,
            oy: fh - minY - (maxY - minY + 1) / 2,
          }
        : { w: fw, h: fh, oy: fh / 2 };
    opaqueFrameColliderCache.set(cacheKey, collider);
    return collider;
  } catch {
    return null;
  }
}

/** Реальный размер кадра текстуры в сцене (с учётом подменённого canvas-выреза). */
function frameSize(
  scene: Phaser.Scene,
  textureKey: string,
  frame: number | undefined
): { w: number; h: number } | null {
  if (!scene.textures.exists(textureKey)) return null;
  try {
    const fr =
      frame !== undefined && Number.isFinite(frame)
        ? scene.textures.getFrame(textureKey, frame)
        : scene.textures.getFrame(textureKey);
    return {
      w: Math.max(1, Math.round(fr.width)),
      h: Math.max(1, Math.round(fr.height)),
    };
  } catch {
    return null;
  }
}

/**
 * Возвращает финальные параметры статического коллайдера пропа в мире.
 *
 * Семантика: проп рисуется с origin `(0.5, 1)` в точке `(x, y)` («ноги»),
 * коллайдер ставится центром в `(x, y - oy)` с размером `(w, h)`.
 *
 * Два режима:
 * 1. `fit: "frame"` — игнорируем авторские w/h/oy и строим коллайдер по
 *    непрозрачным пикселям текущего кадра текстуры. Если альфа-границы
 *    определить не удалось — откатываемся к полному прямоугольнику кадра.
 *    Нужно для стен/сундуков/скамеек и любых предметов, вырезанных вручную:
 *    прозрачные поля вокруг рисунка не должны превращаться в "невидимый блок".
 * 2. Обычный — используются авторские `w/h/oy`. При наличии dev-выреза
 *    дополнительно прижимаем `w/h` к размеру кадра и масштабируем `oy`.
 */
export function getEffectivePropCollider(
  scene: Phaser.Scene,
  textureKey: string,
  frame: number | undefined,
  authored: PropCollider | undefined
): PropCollider | undefined {
  if (!authored) return undefined;

  if (authored.fit === "frame") {
    const opaque = opaqueFrameCollider(scene, textureKey, frame);
    if (!opaque) return authored;
    return { ...opaque, fit: "frame" };
  }

  const ov = readSliceOverridesMap(scene);
  const slice = ov[textureKey];
  const fs = frameSize(scene, textureKey, frame);

  // Без оверрайда и без живого кадра — отдаём как есть.
  if (!slice && !fs) return authored;

  const tw = fs?.w ?? Math.max(1, Math.round(slice!.width));
  const th = fs?.h ?? Math.max(1, Math.round(slice!.height));
  const sourceDef = slice ? getAssetSourceSlice(textureKey) : undefined;
  // Коллайдеры для props вроде сундука/скамейки/верстака были авторски подобраны
  // под исходные вырезы из gen-assets (например 48x32 / 64x32 / 32x32). Когда
  // пользователь вручную уменьшает dev-слайс на тайлсете, нужно не "обрезать"
  // прямоугольник до текущего кадра, а ПРОПОРЦИОНАЛЬНО масштабировать его от
  // исходного размера source-slice. Иначе база предмета становится слишком высокой
  // и появляется эффект "можно зайти в текстуру снизу, но над ней висит блок".
  const baseW = Math.max(1, sourceDef?.slice.width ?? tw);
  const baseH = Math.max(1, sourceDef?.slice.height ?? th);
  const scaleX = tw / baseW;
  const scaleY = th / baseH;

  const w = Math.min(Math.max(1, authored.w * scaleX), tw);
  const h = Math.min(Math.max(1, authored.h * scaleY), th);
  const rawOy =
    authored.oy !== undefined ? authored.oy * scaleY : h / 2;
  // Коллайдер должен жить ВНУТРИ спрайта: верх не выше верха кадра, низ не ниже «ног».
  // y-диапазон коллайдера: [y - oy - h/2; y - oy + h/2]; спрайт занимает [y - th; y].
  // Значит oy ∈ [h/2; th - h/2]. Если кадр меньше высоты коллайдера — прижимаем к h/2.
  const minOy = h / 2;
  const maxOy = Math.max(minOy, th - h / 2);
  const oy = Math.min(Math.max(rawOy, minOy), maxOy);

  return { w, h, oy };
}

/**
 * Ставит в очередь загрузку родительских листов для ключей с оверрайдом.
 * Возвращает множество ключей манифеста, для которых не нужно грузить обычный decor/*.png.
 */
export function queueSliceOverrideParentTextures(
  scene: Phaser.Scene,
  overrides: Record<string, SlicePx>
): Set<string> {
  const keys = new Set<string>();
  for (const k of Object.keys(overrides)) {
    const def = getAssetSourceSlice(k);
    if (!def) continue;
    scene.load.image(`__ov_src_${k}`, def.parentUrl);
    keys.add(k);
  }
  return keys;
}

/**
 * После Loader.COMPLETE: вырезает область из родителя и регистрирует текстуру под ключом манифеста.
 */
export function applySliceOverrideTextures(
  scene: Phaser.Scene,
  overrides: Record<string, SlicePx>,
  overrideKeys: Set<string>
): void {
  for (const key of overrideKeys) {
    const slice = overrides[key];
    if (!slice) continue;
    const pk = `__ov_src_${key}`;
    if (!scene.textures.exists(pk)) continue;
    const tex = scene.textures.get(pk);
    const src = tex.getSourceImage();
    const { iw, ih } = sourceNaturalSize(src);
    const clamped = clampSlicePx(slice, iw, ih);
    const canvas = document.createElement("canvas");
    canvas.width = clamped.width;
    canvas.height = clamped.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.drawImage(
      src as CanvasImageSource,
      clamped.left,
      clamped.top,
      clamped.width,
      clamped.height,
      0,
      0,
      clamped.width,
      clamped.height
    );
    clearOpaqueFrameColliderCache(key);
    if (scene.textures.exists(key)) {
      scene.textures.remove(key);
    }
    scene.textures.addCanvas(key, canvas);
    // Родитель `pk` не удаляем — hot-reload после «Сохранить в проект» без повторной загрузки листа.
  }
}

function waitLoaderIdle(scene: Phaser.Scene): Promise<void> {
  if (!scene.load.isLoading()) return Promise.resolve();
  return new Promise((resolve) => {
    scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
  });
}

/**
 * Подтягивает свежий `/asset-slice-overrides.json` и перерисовывает canvas-текстуры (та же вкладка или другая через broadcast).
 */
export async function refreshAssetSliceOverrides(scene: Phaser.Scene): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/asset-slice-overrides.json?ts=${Date.now()}`, {
      cache: "no-store",
    });
  } catch {
    return;
  }
  if (!res.ok) return;
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return;
  }
  const overrides = parseSliceOverridesFromJson(raw);
  const keys = new Set(Object.keys(overrides));
  if (keys.size === 0) return;

  scene.cache.json.add("sliceOverrides", raw);

  const pendingLoads: string[] = [];
  for (const k of keys) {
    const pk = `__ov_src_${k}`;
    if (!scene.textures.exists(pk)) pendingLoads.push(k);
  }

  await waitLoaderIdle(scene);

  let queued = 0;
  for (const k of pendingLoads) {
    const def = getAssetSourceSlice(k);
    if (!def) continue;
    const pk = `__ov_src_${k}`;
    if (scene.textures.exists(pk)) continue;
    scene.load.image(pk, def.parentUrl);
    queued += 1;
  }

  if (queued > 0) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        scene.load.off(Phaser.Loader.Events.COMPLETE, finish);
        scene.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, finish);
        resolve();
      };
      scene.load.once(Phaser.Loader.Events.COMPLETE, finish);
      scene.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, finish);
      scene.load.start();
    });
  }

  applySliceOverrideTextures(scene, overrides, keys);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(ASSET_SLICE_OVERRIDES_TEXTURES_APPLIED));
  }
}

export function notifyAssetSliceOverridesSaved(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ASSET_SLICE_OVERRIDES_UPDATED_EVENT));
  try {
    const bc = new BroadcastChannel(ASSET_SLICE_OVERRIDES_BROADCAST_CHANNEL);
    bc.postMessage({ type: "updated", ts: Date.now() });
    bc.close();
  } catch {
    /* ignore */
  }
}

export function subscribeAssetSliceOverridesSaved(
  getGame: () => import("phaser").Game | null
): () => void {
  if (typeof window === "undefined") return () => {};

  const onSignal = () => {
    const game = getGame();
    if (!game) return;
    const active = game.scene.getScenes(true)[0] as Phaser.Scene | undefined;
    if (!active) return;
    void refreshAssetSliceOverrides(active).catch((e) => {
      console.warn("[sliceOverrides] hot refresh", e);
    });
  };

  window.addEventListener(ASSET_SLICE_OVERRIDES_UPDATED_EVENT, onSignal);
  let bc: BroadcastChannel | undefined;
  try {
    bc = new BroadcastChannel(ASSET_SLICE_OVERRIDES_BROADCAST_CHANNEL);
    bc.onmessage = (ev: MessageEvent<{ type?: string }>) => {
      if (ev?.data?.type === "updated") onSignal();
    };
  } catch {
    /* ignore */
  }

  return () => {
    window.removeEventListener(ASSET_SLICE_OVERRIDES_UPDATED_EVENT, onSignal);
    bc?.close();
  };
}
