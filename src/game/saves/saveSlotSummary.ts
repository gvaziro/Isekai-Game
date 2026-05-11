import type { LocationId } from "@/src/game/locations/types";

const LOCATION_LABEL: Record<LocationId, string> = {
  town: "Деревня",
  forest: "Лес",
  dungeon: "Катакомбы",
  beyond: "Дорога",
};

function locationLabel(id: string): string {
  return LOCATION_LABEL[id as LocationId] ?? id;
}

export type SaveSlotSummaryDetails = {
  worldDay: number | null;
  locationLabel: string;
  level: number | null;
  gold: number | null;
};

/** Разбор zustand-persist JSON для UI слотов (чипы, подписи). */
export function getSaveSlotSummaryDetails(
  gamePersistJson: string
): SaveSlotSummaryDetails | null {
  try {
    const root = JSON.parse(gamePersistJson) as unknown;
    if (!root || typeof root !== "object") return null;
    const rec = root as Record<string, unknown>;
    const st = rec.state;
    if (!st || typeof st !== "object") return null;
    const s = st as Record<string, unknown>;
    const locRaw = s.currentLocationId;
    const loc =
      typeof locRaw === "string" ? locationLabel(locRaw) : "—";
    const wd = s.worldDay;
    const worldDay = typeof wd === "number" ? wd : null;
    const ch = s.character;
    if (!ch || typeof ch !== "object") {
      return { worldDay, locationLabel: loc, level: null, gold: null };
    }
    const c = ch as Record<string, unknown>;
    const level = typeof c.level === "number" ? c.level : null;
    const gold = typeof c.gold === "number" ? Math.floor(c.gold) : null;
    return { worldDay, locationLabel: loc, level, gold };
  } catch {
    return null;
  }
}

function fmtNum(n: number | null, empty: string): string {
  if (n === null || Number.isNaN(n)) return empty;
  return String(n);
}

/** Краткая подпись для строки списка слотов (парсит zustand-persist JSON игры). */
export function formatSaveSlotSummary(gamePersistJson: string): string {
  const d = getSaveSlotSummaryDetails(gamePersistJson);
  if (!d) return "";
  const day = fmtNum(d.worldDay, "?");
  const lvl = fmtNum(d.level, "?");
  const g = fmtNum(d.gold, "?");
  return `День ${day} · ${d.locationLabel} · ур. ${lvl} · ${g} зол`;
}

export function formatSaveSlotTime(updatedAt: number): string {
  if (!Number.isFinite(updatedAt)) return "";
  try {
    return new Date(updatedAt).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}
