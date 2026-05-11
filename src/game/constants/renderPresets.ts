/** Внутреннее разрешение Phaser (16:9). Масштаб до окна — Scale.FIT. */
export const PLAY_RENDER_PRESETS = {
  "1280x720": { width: 1280, height: 720, label: "1280 × 720" },
  "1600x900": { width: 1600, height: 900, label: "1600 × 900" },
  "1920x1080": { width: 1920, height: 1080, label: "1920 × 1080" },
} as const;

export type PlayRenderPresetId = keyof typeof PLAY_RENDER_PRESETS;

export const DEFAULT_PLAY_RENDER_PRESET: PlayRenderPresetId = "1920x1080";

export function isPlayRenderPresetId(v: unknown): v is PlayRenderPresetId {
  return typeof v === "string" && v in PLAY_RENDER_PRESETS;
}

export function playRenderDimensions(
  id: PlayRenderPresetId
): { width: number; height: number } {
  const p = PLAY_RENDER_PRESETS[id];
  return { width: p.width, height: p.height };
}
