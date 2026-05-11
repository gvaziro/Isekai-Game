/** Накопительная статистика (отдельно от текущих hp/xp/gold). */

export type LifetimeStats = {
  enemiesKilled: number;
  /** По визуалу моба (ключ из спавна / mobVisualId). */
  enemiesKilledByMobVisualId: Record<string, number>;
  /** Successful crafts by recipe id. */
  craftedRecipesById: Record<string, number>;
  /** Сумма фактически начисленного опыта (после баффов luck/xp за один вызов grantXp). */
  totalXpGained: number;
  /** Всё положительное пополнение кошелька (лут, продажа). */
  totalGoldEarned: number;
  /** Списания (лавка и прочие spendGold). */
  totalGoldSpent: number;
  /** Сколько раз игрок «проиграл» HP и ушёл в респавн. */
  playerDeaths: number;
  /** Уникальные сундуки (первое открытие id). */
  uniqueChestsOpened: number;
  /** Уникальные мир-пикапы. */
  uniqueWorldPickupsTaken: number;
  /** Успешных первичных зачисток этажа боссом (когда registerDungeonBossCleared вернул true). */
  dungeonBossFirstClears: number;
  /** Каждое успешное применение расходника из хотбара. */
  consumablesUsed: number;
  /** Суммарно проданных единиц предметов в лавку. */
  itemsSoldTotalQty: number;
  /** Суммарно купленных единиц в лавке. */
  itemsBoughtTotalQty: number;
  /** Каждый вызов открытия сундука (включая повтор того же id). */
  chestOpenEvents: number;
};

export function initialLifetimeStats(): LifetimeStats {
  return {
    enemiesKilled: 0,
    enemiesKilledByMobVisualId: {},
    craftedRecipesById: {},
    totalXpGained: 0,
    totalGoldEarned: 0,
    totalGoldSpent: 0,
    playerDeaths: 0,
    uniqueChestsOpened: 0,
    uniqueWorldPickupsTaken: 0,
    dungeonBossFirstClears: 0,
    consumablesUsed: 0,
    itemsSoldTotalQty: 0,
    itemsBoughtTotalQty: 0,
    chestOpenEvents: 0,
  };
}

function clampInt(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function sanitizeLifetimeStats(raw: unknown): LifetimeStats {
  const init = initialLifetimeStats();
  if (!raw || typeof raw !== "object") return init;
  const o = raw as Record<string, unknown>;

  const byMob: Record<string, number> = {};
  const rawBy = o.enemiesKilledByMobVisualId;
  if (rawBy && typeof rawBy === "object") {
    for (const [k, v] of Object.entries(rawBy)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        byMob[k] = Math.floor(v);
      }
    }
  }

  const craftedRecipesById: Record<string, number> = {};
  const rawCrafted = o.craftedRecipesById;
  if (rawCrafted && typeof rawCrafted === "object") {
    for (const [k, v] of Object.entries(rawCrafted)) {
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        craftedRecipesById[k] = Math.floor(v);
      }
    }
  }

  return {
    enemiesKilled: clampInt(
      typeof o.enemiesKilled === "number" ? o.enemiesKilled : init.enemiesKilled
    ),
    enemiesKilledByMobVisualId: byMob,
    craftedRecipesById,
    totalXpGained: clampInt(
      typeof o.totalXpGained === "number" ? o.totalXpGained : init.totalXpGained
    ),
    totalGoldEarned: clampInt(
      typeof o.totalGoldEarned === "number"
        ? o.totalGoldEarned
        : init.totalGoldEarned
    ),
    totalGoldSpent: clampInt(
      typeof o.totalGoldSpent === "number" ? o.totalGoldSpent : init.totalGoldSpent
    ),
    playerDeaths: clampInt(
      typeof o.playerDeaths === "number" ? o.playerDeaths : init.playerDeaths
    ),
    uniqueChestsOpened: clampInt(
      typeof o.uniqueChestsOpened === "number"
        ? o.uniqueChestsOpened
        : init.uniqueChestsOpened
    ),
    uniqueWorldPickupsTaken: clampInt(
      typeof o.uniqueWorldPickupsTaken === "number"
        ? o.uniqueWorldPickupsTaken
        : init.uniqueWorldPickupsTaken
    ),
    dungeonBossFirstClears: clampInt(
      typeof o.dungeonBossFirstClears === "number"
        ? o.dungeonBossFirstClears
        : init.dungeonBossFirstClears
    ),
    consumablesUsed: clampInt(
      typeof o.consumablesUsed === "number"
        ? o.consumablesUsed
        : init.consumablesUsed
    ),
    itemsSoldTotalQty: clampInt(
      typeof o.itemsSoldTotalQty === "number"
        ? o.itemsSoldTotalQty
        : init.itemsSoldTotalQty
    ),
    itemsBoughtTotalQty: clampInt(
      typeof o.itemsBoughtTotalQty === "number"
        ? o.itemsBoughtTotalQty
        : init.itemsBoughtTotalQty
    ),
    chestOpenEvents: clampInt(
      typeof o.chestOpenEvents === "number"
        ? o.chestOpenEvents
        : init.chestOpenEvents
    ),
  };
}

export function sanitizeUnlockedAchievements(
  raw: unknown
): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[k] = Math.floor(v);
    }
  }
  return out;
}
