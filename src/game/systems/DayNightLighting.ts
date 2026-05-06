import * as Phaser from "phaser";
import type { LocationId } from "@/src/game/locations/types";
import { useUiSettingsStore } from "@/src/game/state/uiSettingsStore";
import {
  getDungeonOverlayStyle,
  getForestOverlayStyle,
  getNightVignetteStrength,
  getOutdoorOverlayStyle,
} from "@/src/game/time/dayNight";

/** Новая версия ключа — пересобрать текстуру после смены градиента. */
const VIGNETTE_TEXTURE_KEY = "nagibatop-night-vignette-v2";
const VIGNETTE_TEX_SIZE = 512;
/** Мягкий круг для ERASE по альфе: центр снимает затемнение, к краю — плавно. */
const TORCH_HOLE_TEXTURE_KEY = "nagibatop-torch-hole-v1";

/** Пока горит факел — оставляем внешнюю зону читаемой, но с ночной атмосферой. */
const TORCH_OUTSIDE_TINT_MUL = 1.08;
const TORCH_OUTSIDE_TINT_ADD = 0.02;
const TORCH_OUTSIDE_VIG_MUL = 0.82;
const TORCH_OUTSIDE_VIG_ADD = 0.02;
/** Ночью без факела видимость должна быть узким пятном, а не затемнённым экраном. */
const PLAYER_VISION_OUTSIDE_MIN_ALPHA = 0.94;
const PLAYER_VISION_DARKNESS_MIN = 0.72;
const PLAYER_VISION_SIZE_MUL = 0.56;
const PLAYER_VISION_HEIGHT_MUL = 0.86;
const PLAYER_VISION_ERASE_ALPHA = 0.68;
const TORCH_VISION_SIZE_MUL = 1.15;
const TORCH_VISION_HEIGHT_MUL = 0.95;

export type PlayerVisionWorldHint = {
  worldX: number;
  worldY: number;
  hasTorch: boolean;
};

function overlayForLocation(
  locId: LocationId,
  worldTimeMinutes: number
): { color: number; alpha: number } {
  switch (locId) {
    case "dungeon":
      return getDungeonOverlayStyle(worldTimeMinutes);
    case "forest":
      return getForestOverlayStyle(worldTimeMinutes);
    default:
      return getOutdoorOverlayStyle(worldTimeMinutes);
  }
}

function ensureVignetteTexture(scene: Phaser.Scene): boolean {
  if (scene.textures.exists(VIGNETTE_TEXTURE_KEY)) return true;
  if (typeof document === "undefined") return false;
  const size = VIGNETTE_TEX_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const cx = size / 2;
  const cy = size / 2;
  const rClear = size * 0.165;
  const rEnd = size * 0.72;
  const g = ctx.createRadialGradient(cx, cy, rClear, cx, cy, rEnd);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.12, "rgba(0,0,0,0)");
  g.addColorStop(0.38, "rgba(0,0,0,0.88)");
  g.addColorStop(0.62, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  scene.textures.addCanvas(VIGNETTE_TEXTURE_KEY, canvas);
  return scene.textures.exists(VIGNETTE_TEXTURE_KEY);
}

/**
 * Масштаб квадратной текстуры виньетки (центр в cx,cy), чтобы она покрывала весь viewport.
 */
function vignetteCoverScale(
  viewW: number,
  viewH: number,
  cx: number,
  cy: number,
  texSize: number
): number {
  const halfSide = Math.max(cx, viewW - cx, cy, viewH - cy);
  return (2 * halfSide) / texSize;
}

function ensureTorchHoleTexture(scene: Phaser.Scene): boolean {
  if (scene.textures.exists(TORCH_HOLE_TEXTURE_KEY)) return true;
  if (typeof document === "undefined") return false;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const cx = size / 2;
  const cy = size / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.42);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,255,255,0.97)");
  g.addColorStop(0.5, "rgba(255,255,255,0.45)");
  g.addColorStop(0.78, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  scene.textures.addCanvas(TORCH_HOLE_TEXTURE_KEY, canvas);
  return scene.textures.exists(TORCH_HOLE_TEXTURE_KEY);
}

/**
 * Мировая точка → координаты в окне камеры (0…cam.width / 0…cam.height), как при отрисовке спрайта с scrollFactor 1.
 * Используем `matrixCombined` из последнего `Camera.preRender` — ту же матрицу, что и рендерер.
 */
function worldPointToCameraScreen(
  cam: Phaser.Cameras.Scene2D.Camera,
  worldX: number,
  worldY: number
): { x: number; y: number } {
  const m = cam.matrixCombined;
  return {
    x: m.getX(worldX, worldY),
    y: m.getY(worldX, worldY),
  };
}

/**
 * Полноэкранное затемнение в координатах камеры (scrollFactor 0): тинт + виньетка
 * собираются в один RenderTexture; факел вырезает мягкий круг (ERASE), под ним — обычные цвета мира.
 */
export class DayNightLighting {
  private darknessRt: Phaser.GameObjects.RenderTexture | null = null;
  /** Не в display list — только для `RenderTexture.erase`. */
  private torchHoleStamp: Phaser.GameObjects.Image | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  ensure(): void {
    const cam = this.scene.cameras.main;
    if (!this.darknessRt || !this.darknessRt.active) {
      this.darknessRt = this.scene.add
        .renderTexture(0, 0, cam.width, cam.height)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(50_000);
    }
    if (!this.torchHoleStamp || !this.torchHoleStamp.active) {
      if (!ensureTorchHoleTexture(this.scene)) return;
      this.torchHoleStamp = new Phaser.GameObjects.Image(
        this.scene,
        0,
        0,
        TORCH_HOLE_TEXTURE_KEY
      );
      this.torchHoleStamp.setOrigin(0.5, 0.5);
    }
    if (!ensureVignetteTexture(this.scene)) return;
  }

  destroy(): void {
    if (this.darknessRt) {
      this.darknessRt.destroy();
      this.darknessRt = null;
    }
    if (this.torchHoleStamp) {
      this.torchHoleStamp.destroy();
      this.torchHoleStamp = null;
    }
  }

  sync(
    locId: LocationId,
    worldTimeMinutes: number,
    vision: PlayerVisionWorldHint | null
  ): void {
    const cam = this.scene.cameras.main;
    const { nightTintMul, nightVignetteMul } = useUiSettingsStore.getState();

    if (!this.darknessRt || !this.darknessRt.active) return;
    if (!this.torchHoleStamp || !this.torchHoleStamp.active) return;

    const w = cam.width;
    const h = cam.height;
    if (this.darknessRt.width !== w || this.darknessRt.height !== h) {
      this.darknessRt.resize(w, h);
    }
    // `scrollFactor(0)` отменяет scroll камеры, но не ее zoom. Компенсируем zoom,
    // чтобы координаты RenderTexture оставались экранными пикселями 1:1.
    const zoomX = cam.zoomX || 1;
    const zoomY = cam.zoomY || 1;
    this.darknessRt
      .setPosition(
        w * cam.originX * (1 - 1 / zoomX),
        h * cam.originY * (1 - 1 / zoomY)
      )
      .setScale(1 / zoomX, 1 / zoomY);

    const { color, alpha } = overlayForLocation(locId, worldTimeMinutes);
    let a = Math.max(0, Math.min(1, alpha * nightTintMul));
    let v = Math.min(
      1,
      getNightVignetteStrength(worldTimeMinutes, locId) * nightVignetteMul
    );

    const visionShow =
      !!vision &&
      Number.isFinite(vision.worldX) &&
      Number.isFinite(vision.worldY);
    const torchShow = visionShow && vision.hasTorch;

    if (torchShow) {
      a = Math.min(1, a * TORCH_OUTSIDE_TINT_MUL + TORCH_OUTSIDE_TINT_ADD);
      v = Math.min(1, v * TORCH_OUTSIDE_VIG_MUL + TORCH_OUTSIDE_VIG_ADD);
    } else if (visionShow && v > 0.02) {
      a = Math.min(
        1,
        Math.max(a, PLAYER_VISION_OUTSIDE_MIN_ALPHA * Math.min(1, v))
      );
    }

    const vignetteOn = v > 0.02;

    const needDarkness = a > 0.001 || vignetteOn;
    if (!needDarkness) {
      this.darknessRt.setVisible(false);
      return;
    }

    this.darknessRt.setVisible(true);

    /** Экранная точка «глаз» игрока: и виньетка, и вырез совпадают — зона видимости не «ездит» относительно модели. */
    let visionSx = w * 0.5;
    let visionSy = h * 0.5;
    if (visionShow && vision) {
      const p = worldPointToCameraScreen(cam, vision.worldX, vision.worldY);
      visionSx = p.x;
      visionSy = p.y;
    }

    this.darknessRt.clear();
    if (a > 0.001) {
      this.darknessRt.fill(color, a, 0, 0, w, h);
    }
    if (vignetteOn) {
      const cx = visionShow ? visionSx : w * 0.5;
      const cy = visionShow ? visionSy : h * 0.5;
      const cov = vignetteCoverScale(w, h, cx, cy, VIGNETTE_TEX_SIZE);
      this.darknessRt.stamp(VIGNETTE_TEXTURE_KEY, undefined, cx, cy, {
        alpha: v,
        originX: 0.5,
        originY: 0.5,
        scaleX: cov,
        scaleY: cov,
      });
    }

    if (visionShow && vignetteOn) {
      const sx = visionSx;
      const sy = visionSy;
      const darkness = Math.max(a, v);
      const base =
        Math.min(w, h) *
        (torchShow ? TORCH_VISION_SIZE_MUL : PLAYER_VISION_SIZE_MUL);
      this.torchHoleStamp.setDisplaySize(
        base,
        base * (torchShow ? TORCH_VISION_HEIGHT_MUL : PLAYER_VISION_HEIGHT_MUL)
      );
      this.torchHoleStamp.setAlpha(
        torchShow ? 1 : PLAYER_VISION_ERASE_ALPHA * Math.min(1, darkness / PLAYER_VISION_DARKNESS_MIN)
      );
      this.darknessRt.erase(this.torchHoleStamp, sx, sy);
    }

    this.darknessRt.render();
  }
}
