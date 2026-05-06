/**
 * Игровые сутки: 1440 игровых минут за один цикл, скорость — 1 игровой день
 * за 24 минуты реального активного геймплея (см. REAL_MS_PER_GAME_DAY).
 */

import type { LocationId } from "@/src/game/locations/types";

export const GAME_MINUTES_PER_DAY = 24 * 60;

/** 24 минуты реального времени = один игровой день */
export const REAL_MS_PER_GAME_DAY = 24 * 60 * 1000;

/** 06:00 — время после сна */
export const MORNING_GAME_MINUTES = 6 * 60;

/** Границы фаз суток (игровые минуты от полуночи) */
const DAWN_START = 5 * 60;
const DAWN_END = 8 * 60;
const DAY_END = 20 * 60;
const DUSK_END = 23 * 60;

export type TimeOfDayPhase = "dawn" | "day" | "dusk" | "night";

export type WorldClock = {
  worldDay: number;
  /** [0, 1440) — дробные значения допустимы */
  worldTimeMinutes: number;
};

export function gameMinutesFromRealMs(deltaMs: number): number {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return 0;
  return (deltaMs * GAME_MINUTES_PER_DAY) / REAL_MS_PER_GAME_DAY;
}

export function advanceWorldTime(
  clock: WorldClock,
  deltaMs: number
): WorldClock {
  if (deltaMs <= 0) return clock;
  let { worldDay, worldTimeMinutes } = clock;
  let m =
    worldTimeMinutes + (deltaMs * GAME_MINUTES_PER_DAY) / REAL_MS_PER_GAME_DAY;
  while (m >= GAME_MINUTES_PER_DAY) {
    m -= GAME_MINUTES_PER_DAY;
    worldDay += 1;
  }
  return { worldDay, worldTimeMinutes: m };
}

/**
 * После сна — 06:00. Если уже после 06:00 того же «дня», переносим на следующий календарный день.
 */
export function wakeUpAtMorning(clock: WorldClock): WorldClock {
  let { worldDay, worldTimeMinutes } = clock;
  if (worldTimeMinutes >= MORNING_GAME_MINUTES) {
    worldDay += 1;
  }
  return { worldDay, worldTimeMinutes: MORNING_GAME_MINUTES };
}

/** Границы фаз: рассвет 5–8, день 8–20, сумерки 20–23, ночь 23–5 */
export function resolveTimeOfDayPhase(minute: number): TimeOfDayPhase {
  const m = minute % GAME_MINUTES_PER_DAY;
  if (m >= DAWN_START && m < DAWN_END) return "dawn";
  if (m >= DAWN_END && m < DAY_END) return "day";
  if (m >= DAY_END && m < DUSK_END) return "dusk";
  return "night";
}

export function phaseLabelRu(phase: TimeOfDayPhase): string {
  switch (phase) {
    case "dawn":
      return "Рассвет";
    case "day":
      return "День";
    case "dusk":
      return "Сумерки";
    case "night":
      return "Ночь";
    default:
      return "";
  }
}

export function isNightPhase(phase: TimeOfDayPhase): boolean {
  return phase === "night";
}

export function isDaylightPhase(phase: TimeOfDayPhase): boolean {
  return phase === "day" || phase === "dawn";
}

/** Прогресс внутри фазы [0, 1] (для будущих интерполяций / FX). */
export function phaseProgress(minute: number, phase: TimeOfDayPhase): number {
  const m = minute % GAME_MINUTES_PER_DAY;
  switch (phase) {
    case "dawn":
      return (m - DAWN_START) / (DAWN_END - DAWN_START);
    case "day":
      return (m - DAWN_END) / (DAY_END - DAWN_END);
    case "dusk":
      return (m - DAY_END) / (DUSK_END - DAY_END);
    case "night": {
      const nightSpan = GAME_MINUTES_PER_DAY - DUSK_END + DAWN_START;
      if (m >= DUSK_END) return (m - DUSK_END) / nightSpan;
      return (GAME_MINUTES_PER_DAY - DUSK_END + m) / nightSpan;
    }
    default:
      return 0;
  }
}

type OverlayKeyframe = { m: number; a: number };

/** Ключевые точки прозрачности оверлея (тёмный слой) по минутам суток */
const OUTDOOR_OVERLAY_ALPHA: OverlayKeyframe[] = [
  { m: 0, a: 0.48 },
  { m: DAWN_START, a: 0.42 },
  { m: DAWN_END, a: 0 },
  { m: DAY_END, a: 0 },
  { m: DUSK_END, a: 0.34 },
  { m: 1440, a: 0.48 },
];

function overlayAlphaFromKeyframes(
  minute: number,
  keyframes: OverlayKeyframe[]
): number {
  const m = ((minute % GAME_MINUTES_PER_DAY) + GAME_MINUTES_PER_DAY) % GAME_MINUTES_PER_DAY;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!;
    const b = keyframes[i + 1]!;
    if (m >= a.m && m < b.m) {
      const t = b.m === a.m ? 0 : (m - a.m) / (b.m - a.m);
      return a.a + t * (b.a - a.a);
    }
  }
  return keyframes[0]!.a;
}

export type DayNightOverlayStyle = {
  /** RGB заливки полуэкранного оверлея */
  color: number;
  /** Прозрачность 0…1 */
  alpha: number;
};

/**
 * Стиль оверлея для города / леса (на основе минуты суток).
 * Цвет слегка синеет ночью.
 */
export function getOutdoorOverlayStyle(minute: number): DayNightOverlayStyle {
  const alpha = overlayAlphaFromKeyframes(minute, OUTDOOR_OVERLAY_ALPHA);
  const phase = resolveTimeOfDayPhase(minute);
  const blueShift = phase === "night" || phase === "dusk" ? 0x0a1628 : 0x0f172a;
  return { color: blueShift, alpha };
}

/** Подземелье: слабая постоянная «ночь» + лёгкая модуляция от суток снаружи */
export function getDungeonOverlayStyle(minute: number): DayNightOverlayStyle {
  const outdoor = getOutdoorOverlayStyle(minute);
  const base = 0.12;
  const mod = outdoor.alpha * 0.22;
  return {
    color: 0x020617,
    alpha: Math.min(0.32, base + mod),
  };
}

/** Лес чуть темнее открытой местности */
export function getForestOverlayStyle(minute: number): DayNightOverlayStyle {
  const o = getOutdoorOverlayStyle(minute);
  return { color: o.color, alpha: Math.min(0.62, o.alpha * 1.1) };
}

/**
 * Сила тёмной виньетки по краям экрана [0, 1]: сумерки и ночь «сужают» поле зрения.
 * В подземелье слабее — там и так темно.
 */
export function getNightVignetteStrength(
  minute: number,
  locId: LocationId
): number {
  const phase = resolveTimeOfDayPhase(minute);
  let w = 0;
  switch (phase) {
    case "day":
      w = 0;
      break;
    case "dawn":
      w = 0.96 * (1 - phaseProgress(minute, "dawn"));
      break;
    case "dusk":
      w = 0.94 * phaseProgress(minute, "dusk");
      break;
    case "night":
      w = 1;
      break;
    default:
      w = 0;
  }
  if (locId === "dungeon") return Math.min(1, w * 0.58);
  if (locId === "forest") return Math.min(1, w * 1.1);
  return Math.min(1, w);
}

export function formatClockHoursMinutes(minute: number): string {
  const m = Math.floor(minute % GAME_MINUTES_PER_DAY);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function formatWorldHudLine(clock: WorldClock): string {
  const phase = resolveTimeOfDayPhase(clock.worldTimeMinutes);
  const t = formatClockHoursMinutes(clock.worldTimeMinutes);
  return `День ${clock.worldDay} · ${t} · ${phaseLabelRu(phase)}`;
}

/** Абсолютные игровые минуты с начала кампании (день 1 00:00 = 0). */
export function totalCampaignMinutes(clock: WorldClock): number {
  return (
    (clock.worldDay - 1) * GAME_MINUTES_PER_DAY + clock.worldTimeMinutes
  );
}

export function worldClockFromTotalMinutes(total: number): WorldClock {
  const t = Math.max(0, total);
  const day = Math.floor(t / GAME_MINUTES_PER_DAY) + 1;
  const m = t - (day - 1) * GAME_MINUTES_PER_DAY;
  return {
    worldDay: day,
    worldTimeMinutes: Math.min(
      GAME_MINUTES_PER_DAY - Number.EPSILON,
      Math.max(0, m)
    ),
  };
}

/** Сдвиг игровых часов на `deltaGameMinutes` от момента `clock` (можно дробные минуты). */
export function addGameMinutesToClock(
  clock: WorldClock,
  deltaGameMinutes: number
): WorldClock {
  if (!Number.isFinite(deltaGameMinutes) || deltaGameMinutes <= 0) {
    return { ...clock };
  }
  return worldClockFromTotalMinutes(
    totalCampaignMinutes(clock) + deltaGameMinutes
  );
}

/** Минута суток для UI/плана сна, шаг 15 мин (0 … 23:45). */
export function normalizeSleepMinuteOfDay(raw: number): number {
  const rounded = Math.round(raw / 15) * 15;
  const m =
    ((rounded % GAME_MINUTES_PER_DAY) + GAME_MINUTES_PER_DAY) %
    GAME_MINUTES_PER_DAY;
  return m;
}

/**
 * Ближайший момент **строго позже** текущего времени, когда на циферблате
 * `bedMinuteOfDay` (целая минута суток).
 */
export function nextOccurrenceOfMinuteOfDay(
  current: WorldClock,
  bedMinuteOfDay: number
): WorldClock {
  const B = normalizeSleepMinuteOfDay(bedMinuteOfDay);
  const t0 = totalCampaignMinutes(current);
  const k = Math.floor(t0 / GAME_MINUTES_PER_DAY);
  let cand = k * GAME_MINUTES_PER_DAY + B;
  if (cand <= t0) {
    cand += GAME_MINUTES_PER_DAY;
  }
  return worldClockFromTotalMinutes(cand);
}

/** Первый момент пробуждения строго после `bed` с минутой суток `wakeMinuteOfDay`. */
export function wakeClockAfterBed(
  bed: WorldClock,
  wakeMinuteOfDay: number
): WorldClock {
  const W = normalizeSleepMinuteOfDay(wakeMinuteOfDay);
  const tBed = totalCampaignMinutes(bed);
  const kBed = Math.floor(tBed / GAME_MINUTES_PER_DAY);
  let candWake = kBed * GAME_MINUTES_PER_DAY + W;
  if (candWake <= tBed) {
    candWake += GAME_MINUTES_PER_DAY;
  }
  return worldClockFromTotalMinutes(candWake);
}

/** Минимальная длительность сна в игровых минутах (валидация UI). */
export const MIN_SLEEP_GAME_MINUTES = 15;

export type SleepScheduleResult =
  | {
      ok: true;
      bed: WorldClock;
      wake: WorldClock;
      sleepGameMinutes: number;
    }
  | { ok: false; reason: "sleep_too_short" };

/**
 * План сна: отбой и подъём как «часы на циферблате» (шаг 15 мин).
 * Отбой — ближайшее будущее вхождение `bedMinuteOfDay`, подъём — строго после отбоя.
 */
export function resolveSleepSchedule(
  current: WorldClock,
  bedMinuteOfDay: number,
  wakeMinuteOfDay: number
): SleepScheduleResult {
  const bed = nextOccurrenceOfMinuteOfDay(current, bedMinuteOfDay);
  const wake = wakeClockAfterBed(bed, wakeMinuteOfDay);
  const sleepGameMinutes =
    totalCampaignMinutes(wake) - totalCampaignMinutes(bed);
  if (sleepGameMinutes < MIN_SLEEP_GAME_MINUTES) {
    return { ok: false, reason: "sleep_too_short" };
  }
  return { ok: true, bed, wake, sleepGameMinutes };
}
