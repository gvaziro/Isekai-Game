import { describe, expect, it } from "vitest";
import {
  advanceWorldTime,
  addGameMinutesToClock,
  GAME_MINUTES_PER_DAY,
  getNightVignetteStrength,
  MORNING_GAME_MINUTES,
  REAL_MS_PER_GAME_DAY,
  resolveTimeOfDayPhase,
  wakeUpAtMorning,
  formatClockHoursMinutes,
  resolveSleepSchedule,
  totalCampaignMinutes,
  worldClockFromTotalMinutes,
} from "@/src/game/time/dayNight";

describe("dayNight", () => {
  it("advanceWorldTime wraps midnight and increments day", () => {
    const start = { worldDay: 1, worldTimeMinutes: GAME_MINUTES_PER_DAY - 1 };
    const stepMs = REAL_MS_PER_GAME_DAY / GAME_MINUTES_PER_DAY;
    const next = advanceWorldTime(start, stepMs * 2);
    expect(next.worldDay).toBe(2);
    expect(next.worldTimeMinutes).toBeGreaterThanOrEqual(0);
    expect(next.worldTimeMinutes).toBeLessThan(GAME_MINUTES_PER_DAY);
  });

  it("wakeUpAtMorning before 06:00 keeps same calendar day", () => {
    const out = wakeUpAtMorning({
      worldDay: 3,
      worldTimeMinutes: 120,
    });
    expect(out.worldDay).toBe(3);
    expect(out.worldTimeMinutes).toBe(MORNING_GAME_MINUTES);
  });

  it("wakeUpAtMorning after 06:00 advances calendar day", () => {
    const out = wakeUpAtMorning({
      worldDay: 2,
      worldTimeMinutes: 12 * 60,
    });
    expect(out.worldDay).toBe(3);
    expect(out.worldTimeMinutes).toBe(MORNING_GAME_MINUTES);
  });

  it("resolveTimeOfDayPhase covers full day", () => {
    expect(resolveTimeOfDayPhase(0)).toBe("night");
    expect(resolveTimeOfDayPhase(290)).toBe("night");
    expect(resolveTimeOfDayPhase(360)).toBe("dawn");
    expect(resolveTimeOfDayPhase(500)).toBe("day");
    expect(resolveTimeOfDayPhase(1150)).toBe("day");
    expect(resolveTimeOfDayPhase(1200)).toBe("dusk");
    expect(resolveTimeOfDayPhase(1400)).toBe("night");
  });

  it("formatClockHoursMinutes pads and wraps", () => {
    expect(formatClockHoursMinutes(65.9)).toBe("01:05");
    expect(formatClockHoursMinutes(GAME_MINUTES_PER_DAY + 30)).toBe("00:30");
  });

  it("totalCampaignMinutes and worldClockFromTotalMinutes round-trip", () => {
    const c = { worldDay: 2, worldTimeMinutes: 360 };
    expect(totalCampaignMinutes(c)).toBe(1440 + 360);
    expect(worldClockFromTotalMinutes(1800)).toEqual({
      worldDay: 2,
      worldTimeMinutes: 360,
    });
  });

  it("addGameMinutesToClock crosses midnight", () => {
    const cur = { worldDay: 1, worldTimeMinutes: 22 * 60 };
    const w = addGameMinutesToClock(cur, 8 * 60);
    expect(w.worldDay).toBe(2);
    expect(w.worldTimeMinutes).toBe(6 * 60);
  });

  it("addGameMinutesToClock same calendar day", () => {
    const cur = { worldDay: 1, worldTimeMinutes: 10 * 60 };
    const w = addGameMinutesToClock(cur, 2 * 60);
    expect(w.worldDay).toBe(1);
    expect(w.worldTimeMinutes).toBe(12 * 60);
  });

  it("resolveSleepSchedule overnight 22h to 06h next calendar day", () => {
    const current = { worldDay: 1, worldTimeMinutes: 10 * 60 };
    const r = resolveSleepSchedule(current, 22 * 60, 6 * 60);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bed.worldDay).toBe(1);
    expect(r.bed.worldTimeMinutes).toBe(22 * 60);
    expect(r.wake.worldDay).toBe(2);
    expect(r.wake.worldTimeMinutes).toBe(6 * 60);
    expect(r.sleepGameMinutes).toBe(8 * 60);
  });

  it("resolveSleepSchedule same-day nap", () => {
    const current = { worldDay: 1, worldTimeMinutes: 13 * 60 };
    const r = resolveSleepSchedule(current, 15 * 60, 17 * 60);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.bed.worldDay).toBe(1);
    expect(r.bed.worldTimeMinutes).toBe(15 * 60);
    expect(r.wake.worldDay).toBe(1);
    expect(r.wake.worldTimeMinutes).toBe(17 * 60);
    expect(r.sleepGameMinutes).toBe(120);
  });

  it("resolveSleepSchedule minimum 15 game minutes", () => {
    const current = { worldDay: 1, worldTimeMinutes: 10 * 60 };
    const r = resolveSleepSchedule(current, 11 * 60, 11 * 60 + 15);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sleepGameMinutes).toBe(15);
  });

  it("getNightVignetteStrength днём в городе ноль", () => {
    expect(getNightVignetteStrength(12 * 60, "town")).toBe(0);
  });

  it("getNightVignetteStrength ночью сильнее, в данже слабее", () => {
    const town = getNightVignetteStrength(23 * 60, "town");
    const dungeon = getNightVignetteStrength(23 * 60, "dungeon");
    expect(town).toBeGreaterThan(0.5);
    expect(dungeon).toBeGreaterThan(0);
    expect(dungeon).toBeLessThan(town);
  });
});
