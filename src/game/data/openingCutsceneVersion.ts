import { OPENING_CUTSCENE_SCRIPT_VERSION } from "@/src/game/data/openingCutscene";

/**
 * Версия сценария, которую игрок уже «закрыл», если в сейве был только boolean
 * `openingCutsceneSeen` (до поля `openingCutsceneScriptVersion`).
 */
export const OPENING_CUTSCENE_LEGACY_BOOLEAN_MEANS_VERSION = 1;

/** Свести legacy boolean и число из сейва к актуальному `openingCutsceneScriptVersion`. */
export function resolvePersistedOpeningScriptVersion(
  p: Partial<{
    openingCutsceneSeen?: unknown;
    openingCutsceneScriptVersion?: unknown;
  }>
): number {
  let v = 0;
  const raw = p.openingCutsceneScriptVersion;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    v = Math.max(0, Math.floor(raw));
  }
  if (p.openingCutsceneSeen === true) {
    v = Math.max(v, OPENING_CUTSCENE_LEGACY_BOOLEAN_MEANS_VERSION);
  }
  return Math.min(v, OPENING_CUTSCENE_SCRIPT_VERSION);
}
