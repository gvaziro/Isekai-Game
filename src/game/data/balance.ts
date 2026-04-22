/**
 * Центральные константы баланса Фазы 3 (статы, опыт, расходники).
 */

import buffsData from "./buffs.json";
import type { CharacterAttributes } from "@/src/game/rpg/characterAttributes";

/** Короткие баффы от расходников (источник — `buffs.json`, правка в /dev/buffs). */
export type BuffDef = {
  label: string;
  /** Множитель восстановления стамины стоя */
  staRegenMult?: number;
  /** Множитель скорости передвижения */
  moveSpdMult?: number;
  /** Множитель расхода стамины при беге (< 1 — меньше тратится) */
  staDrainMult?: number;
  /** Множитель пассивного восстановления HP стоя (не в бою бега) */
  hpRegenMult?: number;
  /** Множитель получаемого опыта (после формулы удачи) */
  xpGainMult?: number;
  /** Множитель к значению LUCK для расчёта бонуса XP от удачи */
  luckMult?: number;
  /** Множитель к ATK при ударе по врагу */
  atkMult?: number;
  /** Множитель к DEF при получении урона от врага */
  defMult?: number;
  /** Множитель к золоту с трупов врагов (не с продажи лавке) */
  goldGainMult?: number;
  /** Множитель к шансу уклонения от удара моба */
  evadeMult?: number;
  /** Множитель к длительности КД ближней атаки (< 1 — быстрее атаки) */
  attackCooldownMult?: number;
};

/** Все числовые множители бафа (для админки и API-санитизации). */
export const BUFF_MULT_FIELD_KEYS = [
  "staRegenMult",
  "moveSpdMult",
  "staDrainMult",
  "hpRegenMult",
  "xpGainMult",
  "luckMult",
  "atkMult",
  "defMult",
  "goldGainMult",
  "evadeMult",
  "attackCooldownMult",
] as const;

export type BuffNumericMultKey = (typeof BUFF_MULT_FIELD_KEYS)[number];

type BuffsFile = {
  updatedAt?: string;
  buffs: Record<string, BuffDef>;
};

const buffsFile = buffsData as BuffsFile;

/** Короткие баффы от расходников (оставшееся время тикается в сторе). */
export const BUFFS: Record<string, BuffDef> = buffsFile.buffs;

export type BuffId = string;

/** Опыт 1→2 (порог при level=1). */
export const XP_TO_NEXT_BASE = 100;
/** Мягкий экспоненциальный рост порога за уровень (1.06–1.12). */
export const XP_TO_NEXT_GROWTH = 1.09;
/** Верхняя граница одного тика «нужно XP» (анти-взрыв на высоких L). */
export const XP_TO_NEXT_CAP = 8000;

/** Опыт для перехода с level -> level+1 */
export function xpToNext(level: number): number {
  const L = Math.max(1, Math.floor(level));
  const raw = XP_TO_NEXT_BASE * Math.pow(XP_TO_NEXT_GROWTH, L - 1);
  return Math.min(XP_TO_NEXT_CAP, Math.max(1, Math.floor(raw)));
}

/** Награды опыта (до появления боя) */
export const XP_WORLD_PICKUP = 4;
export const XP_CHEST_FIRST = 18;
/** Опыт за пустой сундук (нет лута после броска) */
export const XP_CHEST_EMPTY = 10;

/** Величина потери XP при смерти (один расчёт от текущих level и xp). */
export function xpDeathPenaltyLoseAmount(level: number, currentXp: number): number {
  const L = Math.max(1, Math.floor(level));
  const xp = Math.max(0, Math.floor(currentXp));
  return Math.ceil(25 + L * 12 + xp * 0.12);
}

/**
 * Штраф опыта при смерти с возможным падением уровня (как обратная операция к grantXp).
 */
export function applyXpDeathPenalty(
  level: number,
  currentXp: number
): { level: number; xp: number } {
  let L = Math.max(1, Math.floor(level));
  let xp = Math.max(0, Math.floor(currentXp));
  const L0 = L;
  const lose = xpDeathPenaltyLoseAmount(L0, xp);
  xp -= lose;
  while (xp < 0 && L > 1) {
    L -= 1;
    xp += xpToNext(L);
  }
  if (L === 1 && xp < 0) xp = 0;
  return { level: L, xp };
}

/** Множитель добычи опыта от удачи (мягкий, до ~+22% на высоких LUCK). */
export function xpGainFromLuckMultiplier(luck: number): number {
  const bonus = (luck - BASE_LUCK) * 0.003;
  return Math.min(1.22, Math.max(1, 1 + bonus));
}

export const BASE_MAX_HP = 52;
export const BASE_MAX_STA = 48;
export const HP_PER_LEVEL = 6;
export const STA_PER_LEVEL = 4;
export const BASE_ATK = 6;
export const BASE_DEF = 3;
export const BASE_SPD = 100;
export const BASE_LUCK = 10;

// ─── Распределяемые статы (левелап) ───────────────────────────

/** Очков за каждый полученный уровень (распределяются вручную). */
export const STAT_POINTS_PER_LEVEL = 2;

/** Остаточный рост от уровня (часть старой кривой остаётся без очков). */
export const ATK_LEVEL_MULT = 0.2;
export const DEF_LEVEL_MULT = 0.12;
export const SPD_LEVEL_MULT = 0.06;

/** Вклад одного вложенного очка в бою/беге. */
export const ATK_PER_STR = 1;
/** Стойкость (tgh) → DEF. */
export const DEF_PER_TGH = 1;
/** Живучесть (vit) → max HP. */
export const HP_PER_VIT = 6;
/** Выносливость (end) → max STA. */
export const STA_PER_END = 4;
export const SPD_PER_MOB = 1;

/** @deprecated используйте DEF_PER_TGH */
export const DEF_PER_VIT = DEF_PER_TGH;

/** Скорость атаки: mob сильнее, agi слабее. */
export const PLAYER_ATTACK_COOLDOWN_MIN_MS = 200;
export const PLAYER_ATTACK_SPEED_FROM_MOB = 0.012;
export const PLAYER_ATTACK_SPEED_FROM_AGI = 0.004;

/** Уклонение от удара моба (шанс промаха по ловкости). */
export const EVADE_AGI_COEF = 0.0045;
export const EVADE_ENEMY_LEVEL_SCALE = 0.022;
export const EVADE_CHANCE_MAX = 0.4;

/** Старые бонусы только от уровня (до v12), для миграции сейвов. */
function legacyAtkBonusFromLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return Math.floor(L * 0.8);
}
function legacyDefBonusFromLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return Math.floor(L * 0.5);
}
function legacySpdBonusFromLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return Math.floor(L * 0.3);
}

/** Эквивалент старого `level * HP_PER_LEVEL` в очках живучести (миграция сейвов). */
export function migrateCompensationVitFromLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return Math.max(0, Math.floor((L * HP_PER_LEVEL) / HP_PER_VIT));
}

/** Эквивалент старого `level * STA_PER_LEVEL` в очках выносливости (миграция сейвов). */
export function migrateCompensationEndFromLevel(level: number): number {
  const L = Math.max(1, Math.floor(level));
  return Math.max(0, Math.floor((L * STA_PER_LEVEL) / STA_PER_END));
}

function coerceAttrInt(raw: unknown, key: string): number {
  if (!raw || typeof raw !== "object") return 0;
  const v = (raw as Record<string, unknown>)[key];
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

/**
 * Сейв до v15: поле `vit` означало DEF. Переносим в `tgh`, живучесть/выносливость
 * компенсируем от старого роста HP/STA от уровня.
 */
export function migrateCharacterAttrsFromSaveV14(
  level: number,
  rawAttrs: unknown,
  rawAttrsMin: unknown
): { attrs: CharacterAttributes; attrsMin: CharacterAttributes } {
  const compVit = migrateCompensationVitFromLevel(level);
  const compEnd = migrateCompensationEndFromLevel(level);
  const vitDef = coerceAttrInt(rawAttrs, "vit");
  const str = coerceAttrInt(rawAttrs, "str");
  const agi = coerceAttrInt(rawAttrs, "agi");
  const mob = coerceAttrInt(rawAttrs, "mob");
  const minStr = coerceAttrInt(rawAttrsMin, "str");
  const minAgi = coerceAttrInt(rawAttrsMin, "agi");
  const minVitDef = coerceAttrInt(rawAttrsMin, "vit");
  const minMob = coerceAttrInt(rawAttrsMin, "mob");
  return {
    attrs: {
      str,
      agi,
      vit: compVit,
      tgh: vitDef,
      end: compEnd,
      mob,
    },
    attrsMin: {
      str: minStr,
      agi: minAgi,
      vit: compVit,
      tgh: minVitDef,
      end: compEnd,
      mob: minMob,
    },
  };
}

/**
 * Восстанавливает «голый» вклад старой формулы в распределяемые очки,
 * чтобы после миграции atk/def/spd не просели относительно прежних значений.
 */
export function migrateAttrsFromLegacyLevel(
  level: number
): CharacterAttributes {
  const L = Math.max(1, Math.floor(level));
  const str = Math.max(
    0,
    legacyAtkBonusFromLevel(L) - Math.floor(L * ATK_LEVEL_MULT)
  );
  const tgh = Math.max(
    0,
    legacyDefBonusFromLevel(L) - Math.floor(L * DEF_LEVEL_MULT)
  );
  const mob = Math.max(
    0,
    legacySpdBonusFromLevel(L) - Math.floor(L * SPD_LEVEL_MULT)
  );
  const vit = migrateCompensationVitFromLevel(L);
  const end = migrateCompensationEndFromLevel(L);
  return { str, agi: 0, vit, tgh, end, mob };
}

export function getPlayerAttackCooldownMs(
  attrs: CharacterAttributes
): number {
  const mult =
    1 +
    PLAYER_ATTACK_SPEED_FROM_MOB * attrs.mob +
    PLAYER_ATTACK_SPEED_FROM_AGI * attrs.agi;
  const raw = PLAYER_ATTACK_COOLDOWN_MS / Math.max(0.5, mult);
  return Math.max(
    PLAYER_ATTACK_COOLDOWN_MIN_MS,
    Math.min(PLAYER_ATTACK_COOLDOWN_MS, Math.floor(raw))
  );
}

export function getPlayerEvadeChance(
  agi: number,
  enemyLevel: number
): number {
  const L = Math.max(1, Math.floor(enemyLevel));
  const a = Math.max(0, Math.floor(agi));
  const raw = (a * EVADE_AGI_COEF) / (1 + L * EVADE_ENEMY_LEVEL_SCALE);
  return Math.min(EVADE_CHANCE_MAX, Math.max(0, raw));
}

/**
 * @param rng должен возвращать число в [0, 1)
 * @param evadeChanceMult дополнительный множитель к шансу (бафы)
 */
export function rollPlayerEvadesMobHit(
  agi: number,
  enemyLevel: number,
  rng: () => number,
  evadeChanceMult = 1
): boolean {
  const p = Math.min(
    EVADE_CHANCE_MAX,
    Math.max(0, getPlayerEvadeChance(agi, enemyLevel) * evadeChanceMult)
  );
  return rng() < p;
}

/** Бонусы от экипируемых предметов по curated id (только те, что есть в items.curated) */
export const ITEM_EQUIP_BONUSES: Record<
  string,
  {
    atk?: number;
    def?: number;
    hp?: number;
    sta?: number;
    spd?: number;
    luck?: number;
  }
> = {
  blade_rusty: { atk: 4 },
  knife_kitchen: { atk: 2 },
  wand_twig: { atk: 3 },
  spear_short: { atk: 7 },
  bow_small: { atk: 8 },
  dagger: { atk: 5 },
  mace: { atk: 9 },
  staff_oak: { atk: 5 },
  torch: { atk: 2 },
  shield_buckler: { def: 5 },
  shield_round: { def: 8 },
  lantern: { def: 1 },
  arrow_bundle: { atk: 2 },
  helm_leather: { def: 3, hp: 6 },
  cap_wool: { def: 2, hp: 4 },
  shirt_linen: { def: 4, hp: 10 },
  coat_travel: { def: 6, hp: 14 },
  boots_simple: { def: 2, spd: 2 },
  boots_patch: { def: 3, spd: 1 },
};

/** Расходники: эффект при «Использовать» из инвентаря */
export type ConsumableFx = {
  healHp?: number;
  restoreSta?: number;
  /** Баффы начинаются после применения предмета */
  applyBuffs?: Array<{ id: BuffId; durationSec: number }>;
  /** Откат перед повторным использованием того же предмета (мс). */
  cooldownMs?: number;
};

/** Если в данных нет `cooldownMs`, подставляется это значение. */
export const DEFAULT_CONSUMABLE_COOLDOWN_MS = 3500;

/** Эффективный откат расходника после слияния balance + маппинг. */
export function resolveConsumableCooldownMs(
  fx: ConsumableFx | undefined
): number {
  if (
    fx &&
    typeof fx.cooldownMs === "number" &&
    Number.isFinite(fx.cooldownMs) &&
    fx.cooldownMs >= 0
  ) {
    return Math.floor(fx.cooldownMs);
  }
  return DEFAULT_CONSUMABLE_COOLDOWN_MS;
}

export const CONSUMABLE_EFFECTS: Record<string, ConsumableFx> = {
  hp_small: { healHp: 24, cooldownMs: 4200 },
  hp_medium: { healHp: 48, cooldownMs: 5200 },
  stamina_drink: {
    restoreSta: 36,
    applyBuffs: [{ id: "vigor", durationSec: 38 }],
    cooldownMs: 4800,
  },
  bread: {
    healHp: 10,
    restoreSta: 6,
    applyBuffs: [{ id: "hustle", durationSec: 24 }],
    cooldownMs: 2400,
  },
  cheese: {
    healHp: 8,
    restoreSta: 10,
    applyBuffs: [{ id: "hustle", durationSec: 30 }],
    cooldownMs: 2600,
  },
  apple: { healHp: 7, restoreSta: 4, cooldownMs: 2000 },
  mushroom: { healHp: 6, restoreSta: 8, cooldownMs: 2200 },
  fish: { healHp: 14, restoreSta: 6, cooldownMs: 3000 },
  potion_blue: { healHp: 30, restoreSta: 15, cooldownMs: 5600 },
  potion_green: {
    healHp: 18,
    restoreSta: 28,
    applyBuffs: [{ id: "second_wind", durationSec: 28 }],
    cooldownMs: 6000,
  },
};

/** Расход стамины при спринте (Shift + движение), в единицах в секунду */
export const STA_DRAIN_RUN_PER_SEC = 8;

/** Базовая скорость перемещения героя (пикс/с до множителей шага/спринта и экипировки). */
export const PLAYER_ARCADE_MOVE_SPEED = 146;
/** Множитель скорости при обычной ходьбе (без спринта). */
export const PLAYER_WALK_GAIT_MULT = 0.62;
/** Множитель скорости при спринте (Shift + стамина). */
export const PLAYER_SPRINT_GAIT_MULT = 1.1;
/** Восстановление стамины стоя (в секунду) */
export const STA_REGEN_IDLE_PER_SEC = 22;

/** После нуля стамины от спринта: нельзя снова спринтовать, сильный дебафф скорости (мс). */
export const STA_WINDED_DURATION_MS = 5000;
/** Множитель скорости перемещения в состоянии «перегруз» (пока действует STA_WINDED_DURATION_MS). */
export const STA_WINDED_MOVE_SPEED_MULT = 0.34;
/** Пассивное восстановление HP в покое (в секунду, только без движения) */
export const HP_REGEN_IDLE_PER_SEC = 0.55;

/** Длительность «сна» в безопасной зоне (город / лес) до полного восстановления HP/STA. */
export const SLEEP_CHANNEL_MS = 5000;

/** Канал рубки дерева (мс): за это время наносится ровно CHOP_TREE_STRIKE_COUNT ударов. */
export const CHOP_TREE_CHANNEL_MS = 3000;
/** Число полноценных ударов slice за один канал рубки. */
export const CHOP_TREE_STRIKE_COUNT = 4;
/** Интервал между началами ударов (равномерно по каналу). */
export const CHOP_TREE_STRIKE_SPACING_MS =
  CHOP_TREE_CHANNEL_MS / CHOP_TREE_STRIKE_COUNT;

/** Алиасы: добыча камня в лесу — те же тайминги, что у деревьев. */
export const CHOP_ROCK_CHANNEL_MS = CHOP_TREE_CHANNEL_MS;
export const CHOP_ROCK_STRIKE_COUNT = CHOP_TREE_STRIKE_COUNT;
export const CHOP_ROCK_STRIKE_SPACING_MS = CHOP_TREE_STRIKE_SPACING_MS;
/**
 * После рубки на месте показывается спрайт «пня» (chopped), затем дерево
 * полностью убирается из мира.
 */
export const FOREST_TREE_STUMP_VISIBLE_MS = 28_000;
/** id курируемого предмета «Древесина». */
export const WOOD_MATERIAL_CURATED_ID = "item588";
export const WOOD_DROP_MIN = 1;
export const WOOD_DROP_MAX = 4;

/** id курируемого предмета «Камень» (лесные валуны). */
export const STONE_MATERIAL_CURATED_ID = "item586";
export const STONE_DROP_MIN = 1;
export const STONE_DROP_MAX = 4;

/**
 * Дополнительный множитель к базовому XP_TO_NEXT_GROWTH: уровни профессий растут медленнее по ощущениям,
 * чем уровень персонажа с тем же номером.
 */
export const PROFESSION_XP_TO_NEXT_EXTRA_GROWTH = 1.028;

/**
 * Порог XP до следующего уровня профессии (круче кривая, чем у персонажа).
 */
export function professionXpToNext(level: number): number {
  const L = Math.max(1, Math.floor(level));
  const raw =
    XP_TO_NEXT_BASE *
    Math.pow(XP_TO_NEXT_GROWTH * PROFESSION_XP_TO_NEXT_EXTRA_GROWTH, L - 1);
  return Math.min(XP_TO_NEXT_CAP, Math.max(1, Math.floor(raw)));
}

/**
 * На 1-м уровне профессии совпадает с равномерным дропом (1/span для max).
 * К `GATHER_DROP_MAX_CHANCE_LEVEL_RANGE` растёт шанс максимума до верхней границы.
 */
export const GATHER_DROP_MAX_CHANCE_LEVEL_RANGE = 48;

/** Верхний предел P(максимум), выше равномерного 1/span (например 0.25 → ~0.72 для 1..4). */
export const GATHER_DROP_MAX_CHANCE_BONUS = 0.47;

/**
 * Вероятность выпасть ровно maxQty; при отказе — равномерно min..max-1.
 */
export function gatherDropMaxChance(
  professionLevel: number,
  minQty: number,
  maxQty: number
): number {
  const L = Math.max(1, Math.floor(professionLevel));
  const min = Math.min(minQty, maxQty);
  const max = Math.max(minQty, maxQty);
  const span = max - min + 1;
  if (span <= 1) return 1;
  const pUniform = 1 / span;
  const t = Math.min(1, (L - 1) / GATHER_DROP_MAX_CHANCE_LEVEL_RANGE);
  return Math.min(
    0.78,
    pUniform + GATHER_DROP_MAX_CHANCE_BONUS * t
  );
}

/** Дроп древесины/камня с учётом уровня соответствующей профессии; `rng` — [0, 1). */
/**
 * Верхняя граница шанса потерять материалы крафта без результата (ур. крафта 1).
 * К `CRAFT_MATERIAL_LOSS_LEVEL_SOFT_CAP` вероятность плавно стремится к 0.
 */
export const CRAFT_MATERIAL_LOSS_CHANCE_MAX = 0.12;
export const CRAFT_MATERIAL_LOSS_LEVEL_SOFT_CAP = 36;

/** true — попытка провалилась: ингредиенты сгорают, выхода нет (золото рецепта не тратим). */
export function rollCraftMaterialsLost(
  rng: () => number,
  craftingLevel: number
): boolean {
  const L = Math.max(1, Math.floor(craftingLevel));
  const cap = Math.max(2, CRAFT_MATERIAL_LOSS_LEVEL_SOFT_CAP);
  const t = Math.max(0, 1 - (L - 1) / (cap - 1));
  const p = CRAFT_MATERIAL_LOSS_CHANCE_MAX * t;
  return rng() < p;
}

export function rollGatherMaterialDropQty(
  rng: () => number,
  minQty: number,
  maxQty: number,
  professionLevel: number
): number {
  const min = Math.min(minQty, maxQty);
  const max = Math.max(minQty, maxQty);
  if (max <= min) return min;
  const pMax = gatherDropMaxChance(professionLevel, min, max);
  if (rng() < pMax) return max;
  const sub = max - min;
  return min + Math.floor(rng() * sub);
}

/** Случайное количество древесины за дерево; уровень лесоруба до начисления XP за этот руб. */
export function rollWoodDropQty(
  rng: () => number,
  lumberingLevel: number = 1
): number {
  return rollGatherMaterialDropQty(
    rng,
    WOOD_DROP_MIN,
    WOOD_DROP_MAX,
    lumberingLevel
  );
}

/** Случайное количество камня за валун; уровень горняка до начисления XP за эту добычу. */
export function rollStoneDropQty(
  rng: () => number,
  miningLevel: number = 1
): number {
  return rollGatherMaterialDropQty(
    rng,
    STONE_DROP_MIN,
    STONE_DROP_MAX,
    miningLevel
  );
}

// ─── Фаза 4: бой ─────────────────────────────────────────────

/** Кд базовой атаки героя (мс) */
export const PLAYER_ATTACK_COOLDOWN_MS = 340;
/** Смещение центра дуги удара от ног героя */
export const PLAYER_ATTACK_LEAD_PX = 46;
/** Попадание: дистанция центра удара до цели (ноги моба) */
export const PLAYER_ATTACK_HIT_RADIUS = 54;

export const XP_ENEMY_KILL = 26;

/** Макс. уровень моба в данных локации / редакторе. */
export const ENEMY_LEVEL_MAX = 99;

/**
 * «Бандит» — база для уровня 1 (`getEnemyGruntStatsForLevel(1)` совпадает с этими числами).
 * Спрайты — Orc / Skeleton в manifest.mobs.
 */
export const ENEMY_GRUNT_HP = 48;
export const ENEMY_GRUNT_ATK = 9;
export const ENEMY_GRUNT_ARMOR = 2;
export const ENEMY_GRUNT_SPEED = 88;
export const ENEMY_GRUNT_ATTACK_RANGE = 38;
export const ENEMY_GRUNT_ATTACK_COOLDOWN_MS = 980;

/** Агро по дистанции (ноги игрока — ноги моба), пиксели. */
export const MOB_AGGRO_RADIUS = 220;
/** Сброс агро, если игрок дальше (гистерезис, > aggro). */
export const MOB_LOSE_AGGRO_RADIUS = 400;
/** Моб не уходит от точки спавна дальше — сброс агро и возврат. */
export const MOB_LEASH_RADIUS = 520;
/** Верхняя граница для опциональных радиусов в JSON локации. */
export const MOB_AGGRO_RADIUS_SCHEMA_MAX = 900;

export type MobAggroRadii = {
  aggroRadius: number;
  loseAggroRadius: number;
  leashRadius: number;
};

/** Радиусы агро из спавна с дефолтами и минимальными отступами между порогами. */
export function resolveMobAggroRadii(sp: {
  aggroRadius?: number;
  loseAggroRadius?: number;
  leashRadius?: number;
}): MobAggroRadii {
  const aggro = Math.max(
    32,
    Math.min(
      MOB_AGGRO_RADIUS_SCHEMA_MAX,
      Math.floor(sp.aggroRadius ?? MOB_AGGRO_RADIUS)
    )
  );
  const lose = Math.max(
    aggro + 8,
    Math.min(
      MOB_AGGRO_RADIUS_SCHEMA_MAX,
      Math.floor(sp.loseAggroRadius ?? MOB_LOSE_AGGRO_RADIUS)
    )
  );
  const leash = Math.max(
    lose + 8,
    Math.min(
      MOB_AGGRO_RADIUS_SCHEMA_MAX,
      Math.floor(sp.leashRadius ?? MOB_LEASH_RADIUS)
    )
  );
  return { aggroRadius: aggro, loseAggroRadius: lose, leashRadius: leash };
}

export type EnemyGruntScaledStats = {
  level: number;
  hp: number;
  atk: number;
  armor: number;
  speed: number;
  attackRange: number;
  attackCooldownMs: number;
};

/**
 * Статы одного архетипа «grunt» по уровню (для `EnemyMob` и баланса XP).
 * Уровень 1 = константы ENEMY_GRUNT_* выше.
 */
export function getEnemyGruntStatsForLevel(level: number): EnemyGruntScaledStats {
  const L = Math.max(1, Math.min(ENEMY_LEVEL_MAX, Math.floor(level)));
  const t = L - 1;
  const hp = Math.floor(
    ENEMY_GRUNT_HP * (1 + 0.12 * t + 0.008 * t * t)
  );
  const atk = ENEMY_GRUNT_ATK + Math.floor(1.4 * t);
  const armor = ENEMY_GRUNT_ARMOR + Math.floor(0.45 * t);
  const speed = Math.min(130, ENEMY_GRUNT_SPEED + Math.floor(2 * t));
  const attackRange = ENEMY_GRUNT_ATTACK_RANGE + Math.floor(t / 4);
  const attackCooldownMs = Math.max(
    700,
    Math.floor(ENEMY_GRUNT_ATTACK_COOLDOWN_MS * (1 - 0.025 * Math.min(t, 8)))
  );
  return {
    level: L,
    hp,
    atk,
    armor,
    speed,
    attackRange,
    attackCooldownMs,
  };
}

/** Опыт за убийство моба уровня `level` (рост с уровнем, верхняя граница). */
export function xpEnemyKill(level: number): number {
  const L = Math.max(1, Math.min(ENEMY_LEVEL_MAX, Math.floor(level)));
  const mult = 1 + (L - 1) * 0.22;
  return Math.min(200, Math.floor(XP_ENEMY_KILL * mult));
}

/** Для множителя «моб vs игрок»: clamp разницы уровней. */
export const XP_KILL_RELATIVE_DELTA_MAX = 20;
/** База степени за уровень разницы (моб выше игрока → больше XP). */
export const XP_KILL_RELATIVE_PER_LEVEL = 1.1;
/** Пол множителя для слабых мобов / потолок для сильных. */
export const XP_KILL_RELATIVE_MULT_MIN = 0.28;
export const XP_KILL_RELATIVE_MULT_MAX = 2.2;

/**
 * Опыт за убийство с учётом уровня моба и игрока: выше моб — больше, ниже — меньше.
 */
export function xpEnemyKillForPlayer(
  enemyLevel: number,
  playerLevel: number
): number {
  const base = xpEnemyKill(enemyLevel);
  const e = Math.max(1, Math.min(ENEMY_LEVEL_MAX, Math.floor(enemyLevel)));
  const p = Math.max(1, Math.min(ENEMY_LEVEL_MAX, Math.floor(playerLevel)));
  const delta = Math.max(
    -XP_KILL_RELATIVE_DELTA_MAX,
    Math.min(XP_KILL_RELATIVE_DELTA_MAX, e - p)
  );
  const rawMult = Math.pow(XP_KILL_RELATIVE_PER_LEVEL, delta);
  const mult = Math.max(
    XP_KILL_RELATIVE_MULT_MIN,
    Math.min(XP_KILL_RELATIVE_MULT_MAX, rawMult)
  );
  return Math.max(1, Math.floor(base * mult));
}

export function damagePlayerDealsToEnemy(
  playerAtk: number,
  enemyArmor: number
): number {
  return Math.max(1, Math.floor(playerAtk * 1.12 - enemyArmor));
}

export function damageEnemyDealsToPlayer(
  enemyAtk: number,
  playerDef: number
): number {
  return Math.max(1, Math.floor(enemyAtk - playerDef * 0.38));
}
