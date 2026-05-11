import {
  parseLocationJson,
  serializeLocationToJsonObject,
} from "@/src/game/locations/locationSchema";
import { migrateTownLegacyStationTextures } from "@/src/game/locations/migrateTownLegacyStations";
import type { GameLocation, LocationId } from "@/src/game/locations/types";

/** Должен совпадать с прежним ключом в `MapEditorRoot` / старыми сейвами. */
const MAP_EDITOR_DRAFT_STORAGE_PREFIX = "last-summon-map-editor-draft";

export function mapEditorDraftStorageKey(id: LocationId): string {
  return `${MAP_EDITOR_DRAFT_STORAGE_PREFIX}-${id}`;
}

/**
 * Черновик карты из localStorage (тот же, что пишет редактор).
 * `null` — нет записи или JSON невалиден.
 */
export function loadStoredEditorDraftLocation(id: LocationId): GameLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(mapEditorDraftStorageKey(id));
    if (!raw) return null;
    const loc = parseLocationJson(JSON.parse(raw) as unknown);
    if (id === "town") return migrateTownLegacyStationTextures(loc);
    return loc;
  } catch {
    return null;
  }
}

export function persistStoredEditorDraftLocation(
  id: LocationId,
  loc: GameLocation
): void {
  if (typeof window === "undefined") return;
  try {
    const obj = serializeLocationToJsonObject(loc);
    localStorage.setItem(mapEditorDraftStorageKey(id), JSON.stringify(obj));
  } catch (e) {
    console.warn("[mapEditorDraftStorage] persist draft", e);
  }
}
