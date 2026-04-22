/**
 * Игровые профессии (сбор/ремесло). Не путать с narrative `isekaiOrigin.professionId`.
 */

/** Ключи профессий для стора и вызовов grantProfessionXp. */
export const GATHER_PROFESSION_IDS = [
  "lumbering",
  "mining",
  "crafting",
  "blacksmithing",
  "alchemy",
  "cooking",
] as const;

export type GatherProfessionId = (typeof GATHER_PROFESSION_IDS)[number];

/** Какая профессия считается при крафте на станции (`stations.ts` id). */
const CRAFT_STATION_TO_PROFESSION: Readonly<
  Record<string, GatherProfessionId>
> = {
  wb_house: "crafting",
  wb_workshop: "crafting",
  sawmill_sw: "crafting",
  anvil_ne: "blacksmithing",
  alchemy_town: "alchemy",
  cooking_town: "cooking",
};

export function gatherProfessionIdForCraftStation(
  stationId: string
): GatherProfessionId {
  return CRAFT_STATION_TO_PROFESSION[stationId] ?? "crafting";
}

export type ProfessionProgress = {
  level: number;
  xp: number;
};

/** Подписи для UI (русский). */
export const GATHER_PROFESSION_LABELS: Record<GatherProfessionId, string> = {
  lumbering: "Рубка леса",
  mining: "Горное дело",
  crafting: "Крафт",
  blacksmithing: "Кузнечество",
  alchemy: "Алхимия",
  cooking: "Кулинария",
};

/** XP за полное срубленное дерево (один цикл сбора). Порядок ~ с одним убийством моба. */
export const XP_PROFESSION_LUMBER_PER_TREE = 22;

/** XP за полностью добытую породу камня в лесу. */
export const XP_PROFESSION_MINING_PER_ROCK = 22;

/** Базовый XP за успешный крафт (вызов из будущего крафта). */
export const XP_PROFESSION_CRAFT_PER_ACTION = 18;

/** Верхняя граница числа строк `inputs` в рецепте (защита данных). */
export const CRAFT_RECIPE_INPUT_LINES_CAP = 12;

/** После 20-го уровня крафта: +1 к лимиту строк входа каждые столько уровней. */
export const CRAFT_INPUT_LINES_STEP_LEVELS = 15;

/**
 * Сколько разных компонентов (строк `inputs`) доступно при данном уровне профессии крафта.
 * 1–4: 2; 5–19: 3; 20–34: 4; далее +1 каждые CRAFT_INPUT_LINES_STEP_LEVELS, не выше CAP.
 */
export function maxRecipeInputLinesForCraftingLevel(craftingLevel: number): number {
  const L = Math.max(1, Math.floor(craftingLevel));
  if (L < 5) return 2;
  if (L < 20) return 3;
  const extra = Math.floor((L - 20) / CRAFT_INPUT_LINES_STEP_LEVELS);
  return Math.min(CRAFT_RECIPE_INPUT_LINES_CAP, 4 + extra);
}

/** Минимальный уровень крафта, чтобы рецепт с `inputLineCount` строками входа был доступен. */
export function minCraftingLevelForRecipeInputLines(inputLineCount: number): number {
  const n = Math.max(1, Math.floor(inputLineCount));
  for (let L = 1; L <= 500; L++) {
    if (maxRecipeInputLinesForCraftingLevel(L) >= n) return L;
  }
  return 500;
}

export function recipeInputLinesAllowed(
  craftingLevel: number,
  inputLineCount: number
): boolean {
  const lines = Math.max(0, Math.floor(inputLineCount));
  return lines <= maxRecipeInputLinesForCraftingLevel(craftingLevel);
}

export function initialProfessions(): Record<GatherProfessionId, ProfessionProgress> {
  const base: ProfessionProgress = { level: 1, xp: 0 };
  return {
    lumbering: { ...base },
    mining: { ...base },
    crafting: { ...base },
    blacksmithing: { ...base },
    alchemy: { ...base },
    cooking: { ...base },
  };
}

export function sanitizeProfessions(
  raw: unknown
): Record<GatherProfessionId, ProfessionProgress> {
  const def = initialProfessions();
  if (!raw || typeof raw !== "object") return def;
  const o = raw as Record<string, unknown>;
  const out = { ...def };
  for (const id of GATHER_PROFESSION_IDS) {
    const p = o[id];
    if (!p || typeof p !== "object") continue;
    const level =
      typeof (p as ProfessionProgress).level === "number" &&
      Number.isFinite((p as ProfessionProgress).level)
        ? Math.max(1, Math.floor((p as ProfessionProgress).level))
        : 1;
    const xp =
      typeof (p as ProfessionProgress).xp === "number" &&
      Number.isFinite((p as ProfessionProgress).xp)
        ? Math.max(0, Math.floor((p as ProfessionProgress).xp))
        : 0;
    out[id] = { level, xp };
  }

  const forkLegacyCraftToSpecializations =
    typeof o.crafting === "object" &&
    o.crafting !== null &&
    typeof o.blacksmithing !== "object";
  if (forkLegacyCraftToSpecializations) {
    const fork = { ...out.crafting };
    out.blacksmithing = { ...fork };
    out.alchemy = { ...fork };
    out.cooking = { ...fork };
  }

  return out;
}
