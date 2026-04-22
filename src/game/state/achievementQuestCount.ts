/**
 * Источник числа завершённых квестов для снимка достижений без циклического импорта
 * gameStore ↔ questStore. Устанавливается из GameRoot.
 */
let source: (() => number) | null = null;

export function setAchievementQuestCompletedCountSource(fn: () => number): void {
  source = fn;
}

export function getAchievementQuestCompletedCount(): number {
  if (!source) return 0;
  try {
    const n = source();
    return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    return 0;
  }
}
