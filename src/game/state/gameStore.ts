import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getClientPersistJsonStorage } from "@/src/game/saves/electronProfileStateStorage";
import {
  BUFFS,
  HP_REGEN_IDLE_PER_SEC,
  SLEEP_FULL_RECOVERY_GAME_MINUTES,
  SLEEP_WINDED_CLEAR_GAME_MINUTES,
  TORCH_FULL_GAME_MINUTES,
  XP_CHEST_EMPTY,
  XP_CHEST_FIRST,
  migrateAttrsFromLegacyLevel,
  migrateCharacterAttrsFromSaveV14,
  STA_DRAIN_RUN_PER_SEC,
  STA_REGEN_IDLE_PER_SEC,
  STA_WINDED_DURATION_MS,
  STAT_POINTS_PER_LEVEL,
  applyXpDeathPenalty,
  DEATH_SICKNESS_BUFF_ID,
  DEATH_SICKNESS_DURATION_SEC,
  MAX_PERSISTED_DEATH_CORPSES,
  rollGoldLostOnDeath,
  xpGainFromLuckMultiplier,
  professionXpToNext,
  rollCraftMaterialsLost,
  xpToNext,
  FOREST_TREE_REGROW_MS,
  FOREST_ROCK_REGROW_MS,
} from "@/src/game/data/balance";
import type { ConsumableFx } from "@/src/game/data/balance";
import {
  CHEST_STORAGE_SLOTS,
  DEATH_MODAL_EVENT,
  HOTBAR_SLOT_COUNT,
  MAX_INVENTORY_SLOTS,
  MAX_STACK,
  READABLE_BOOK_OPEN_EVENT,
  SPAWN_WORLD_PICKUP_EVENT,
  deathCorpseChestId,
  isDeathCorpseChestId,
} from "@/src/game/constants/gameplay";
import {
  shiftHotbarIndex,
  wrapHotbarIndex,
} from "@/src/game/hotbarIndex";
import {
  getConsumableCooldownMs,
  getConsumableEffect,
  getCuratedItem,
  getEffectiveInventorySlotCount,
  getItemBasePrice,
  itemSlotSupportsUsableEffect,
} from "@/src/game/data/itemRegistry";
import { getReadableBookForItem } from "@/src/game/data/readableBooks";
import {
  applyShopRestock,
  computeBuyUnitPrice,
  computeSellUnitPrice,
  getShopDefById,
  getShopEntry,
  initialShopRuntime,
  type ShopPersistState,
} from "@/src/game/data/shops";
import { WORLD_PICKUPS } from "@/src/game/data/worldPickups";
import type { EquipSlot } from "@/src/game/data/items.curated";
import {
  isDungeonBossChestId,
  migrateLegacyDungeonBossChestOpened,
} from "@/src/game/data/dungeonBoss";
import { getLocation, isLocationId } from "@/src/game/locations";
import type { LocationId } from "@/src/game/locations/types";
import { registerForestWorldSeedReader } from "@/src/game/locations/forestTemplateSeed";
import type { ActiveBuff } from "@/src/game/rpg/derivedStats";
import {
  buffNumericProduct,
  getDerivedCombatStats,
} from "@/src/game/rpg/derivedStats";
import {
  sanitizeCharacterAttributes,
  ZERO_ATTRIBUTES,
} from "@/src/game/rpg/characterAttributes";
import type { AttrKey, CharacterAttributes } from "@/src/game/rpg/characterAttributes";
import {
  getEnemyRespawnDelayMs,
  migrateDefeatedEnemyIdsToRespawnNotBefore,
} from "@/src/game/data/enemyRespawn";
import {
  computeIsekaiOriginBonus,
  type IsekaiOriginPersisted,
  type OriginStatBonus,
} from "@/src/game/data/isekaiOrigin";
import {
  canEnterDungeonFloor,
  clampDungeonFloor,
  DUNGEON_MAX_FLOOR,
} from "@/src/game/data/dungeonFloorScaling";
import { OPENING_CUTSCENE_SCRIPT_VERSION } from "@/src/game/data/openingCutscene";
import { resolvePersistedOpeningScriptVersion } from "@/src/game/data/openingCutsceneVersion";
import {
  DUNGEON_REVEAL_RADIUS_CELLS,
  revealCellKeysForFloor,
  sanitizeDungeonRevealedCellsPersist,
  worldToDungeonCell,
} from "@/src/game/data/dungeonMap";
import {
  FOREST_REVEAL_RADIUS_CELLS,
  revealForestCellKeysAround,
  sanitizeForestRevealedCellsPersist,
  worldToForestCell,
} from "@/src/game/data/forestMap";
import { sanitizeEquippedVsCatalog } from "@/src/game/state/sanitizeEquippedInventory";
import {
  chestIdHasLootTable,
  rollChestLoot,
  rollDungeonBossChestDrops,
} from "@/src/game/data/loot";
import { getAchievementById } from "@/src/game/data/achievements";
import {
  initialLifetimeStats,
  sanitizeLifetimeStats,
  sanitizeUnlockedAchievements,
  type LifetimeStats,
} from "@/src/game/data/lifetimeStats";
import {
  buildAchievementSnapshot,
  computeNewlyUnlockedAchievementIds,
} from "@/src/game/systems/achievementEngine";
import {
  initialProfessions,
  sanitizeProfessions,
  XP_PROFESSION_CRAFT_PER_ACTION,
  gatherProfessionIdForCraftStation,
  GATHER_PROFESSION_LABELS,
  minCraftingLevelForRecipeInputLines,
  recipeInputLinesAllowed,
  type GatherProfessionId,
  type ProfessionProgress,
} from "@/src/game/data/professions";
import { getRecipeById } from "@/src/game/data/recipes";
import {
  clampTorchRemainingForPersist,
  drainTorchGameMinutes,
  type ActiveTorchState,
} from "@/src/game/data/torchRuntime";
import {
  cloneInventorySlots,
  hasRecipeInputs,
  simulateCraftConsumeInputsOnly,
  simulateCraftOutputs,
} from "@/src/game/systems/craftInventory";
import {
  advanceWorldTime,
  GAME_MINUTES_PER_DAY,
  gameMinutesFromRealMs,
  MORNING_GAME_MINUTES,
  wakeUpAtMorning,
  type WorldClock,
} from "@/src/game/time/dayNight";
import type { HeroAttackStyle, HeroFacing } from "@/src/game/entities/heroAnimations";

/** Версия сейва (увеличивать при изменении persist-полей). 35: полный pose игрока (facing, velocity, …). */
export const SAVE_VERSION = 35;

/** Позиция и кинематика/визуал героя в мире (persist + синхронизация перед сейвом). */
export type PlayerWorldPose = {
  x: number;
  y: number;
  facing: HeroFacing;
  flipX: boolean;
  vx: number;
  vy: number;
  carrying: boolean;
  attackStyle: HeroAttackStyle;
};

export function defaultPlayerPoseAt(x: number, y: number): PlayerWorldPose {
  return {
    x,
    y,
    facing: "down",
    flipX: false,
    vx: 0,
    vy: 0,
    carrying: false,
    attackStyle: "slice",
  };
}

function finitePlayerCoord(n: unknown, fb: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fb;
}

function normalizePlayerWorldPose(
  raw: unknown,
  fallback: PlayerWorldPose
): PlayerWorldPose {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const o = raw as Record<string, unknown>;
  const x = finitePlayerCoord(o.x, fallback.x);
  const y = finitePlayerCoord(o.y, fallback.y);
  const hasFacing =
    o.facing === "side" || o.facing === "up" || o.facing === "down";
  if (!hasFacing) {
    return defaultPlayerPoseAt(x, y);
  }
  const atk = o.attackStyle;
  const attackStyle: HeroAttackStyle =
    atk === "pierce" || atk === "crush" || atk === "slice" ? atk : "slice";
  return {
    x,
    y,
    facing: o.facing as HeroFacing,
    flipX: o.flipX === true,
    vx: finitePlayerCoord(o.vx, 0),
    vy: finitePlayerCoord(o.vy, 0),
    carrying: o.carrying === true,
    attackStyle,
  };
}

/** Макс. записей срубленных деревьев в сейве (защита от раздувания). */
export const MAX_CHOPPED_FOREST_TREE_KEYS = 6000;

/** Макс. записей добытых валунов в лесу. */
export const MAX_MINED_FOREST_ROCK_KEYS = 6000;

/** Макс. записей «пней» (дерево срублено, спрайт ещё виден). */
export const MAX_FOREST_TREE_STUMPS = 6000;

/** Стабильный ключ дерева для леса (сид мира + позиция). */
export function forestTreePersistKey(
  forestWorldSeed: number,
  worldX: number,
  worldY: number
): string {
  return `${forestWorldSeed >>> 0}|${Math.round(worldX)}|${Math.round(worldY)}`;
}

/** Позиция мира из ключа `forestTreePersistKey` (для перезагрузки чанка). */
export function parseForestPersistKey(
  key: string
): { x: number; y: number } | null {
  const m = /^(\d+)\|(-?\d+)\|(-?\d+)$/.exec(key);
  if (!m) return null;
  const x = Number(m[2]);
  const y = Number(m[3]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function sanitizeChoppedForestTreeKeys(
  raw: unknown
): Record<string, true> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, true> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_CHOPPED_FOREST_TREE_KEYS) break;
    if (v !== true) continue;
    if (!/^\d+\|-?\d+\|-?\d+$/.test(k)) continue;
    out[k] = true;
    n++;
  }
  return out;
}

function sanitizeMinedForestRockKeys(raw: unknown): Record<string, true> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, true> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_MINED_FOREST_ROCK_KEYS) break;
    if (v !== true) continue;
    if (!/^\d+\|-?\d+\|-?\d+$/.test(k)) continue;
    out[k] = true;
    n++;
  }
  return out;
}

/** Активные пни: `Date.now()` до какого момента показывать chopped-спрайт. */
function sanitizeForestTreeStumps(
  raw: unknown,
  nowMs: number
): { stumps: Record<string, number>; migratedToRegrowAt: Record<string, number> } {
  const migratedToRegrowAt: Record<string, number> = {};
  if (!raw || typeof raw !== "object") {
    return { stumps: {}, migratedToRegrowAt };
  }
  const out: Record<string, number> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_FOREST_TREE_STUMPS) break;
    if (!/^\d+\|-?\d+\|-?\d+$/.test(k)) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    const until = Math.floor(v);
    if (until <= nowMs) {
      migratedToRegrowAt[k] = nowMs + FOREST_TREE_REGROW_MS;
      continue;
    }
    out[k] = until;
    n++;
  }
  return { stumps: out, migratedToRegrowAt };
}

function sanitizeForestTreeRegrowAtMs(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, number> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_CHOPPED_FOREST_TREE_KEYS) break;
    if (!/^\d+\|-?\d+\|-?\d+$/.test(k)) continue;
    if (typeof v !== "number" || !Number.isFinite(v)) continue;
    out[k] = Math.floor(v);
    n++;
  }
  return out;
}

function sanitizeForestRockRegrowAtMs(raw: unknown): Record<string, number> {
  return sanitizeForestTreeRegrowAtMs(raw);
}

export type { LifetimeStats } from "@/src/game/data/lifetimeStats";

/** Сейвы ниже: `vit` в attrs означал DEF; добавлены tgh/end и новая семантика vit (HP). */
const SAVE_VERSION_FIRST_VIT_TGH_END = 15;

/** Сейвы строго ниже этой версии не содержат распределяемых атрибутов — нужна миграция. */
const SAVE_VERSION_FIRST_WITH_ATTRS = 12;

export type { AttrKey, CharacterAttributes } from "@/src/game/rpg/characterAttributes";
export type {
  GatherProfessionId,
  ProfessionProgress,
} from "@/src/game/data/professions";

const RECLAIM_ATTR_ORDER: AttrKey[] = [
  "str",
  "agi",
  "vit",
  "tgh",
  "end",
  "mob",
];

function reclaimStatPointsAfterLevelLoss(
  attrs: CharacterAttributes,
  attrsMin: CharacterAttributes,
  unspentStatPoints: number,
  levelsLost: number
): { attrs: CharacterAttributes; unspentStatPoints: number } {
  if (levelsLost <= 0) {
    return { attrs, unspentStatPoints };
  }
  let need = levelsLost * STAT_POINTS_PER_LEVEL;
  let unp = unspentStatPoints;
  const fromUnspent = Math.min(unp, need);
  unp -= fromUnspent;
  need -= fromUnspent;
  const next: CharacterAttributes = { ...attrs };
  while (need > 0) {
    let progress = false;
    for (const k of RECLAIM_ATTR_ORDER) {
      if (need > 0 && next[k] > attrsMin[k]) {
        next[k] -= 1;
        need -= 1;
        progress = true;
      }
    }
    if (!progress) break;
  }
  return { attrs: next, unspentStatPoints: unp };
}

function persistedOriginBonus(
  o: IsekaiOriginPersisted | undefined
): OriginStatBonus | undefined {
  if (!o || o.completed !== true) return undefined;
  return o.bonus;
}

function parsePersistedIsekaiOrigin(raw: unknown): IsekaiOriginPersisted {
  if (!raw || typeof raw !== "object") {
    return {
      completed: true,
      professionId: "",
      circumstanceId: "",
      bonus: {},
    };
  }
  const o = raw as Record<string, unknown>;
  if (o.completed === false) {
    return { completed: false };
  }
  if (o.completed === true) {
    const bonus: OriginStatBonus = {};
    const bonusRaw = o.bonus;
    if (bonusRaw && typeof bonusRaw === "object") {
      for (const k of ["atk", "def", "hp", "sta", "spd", "luck"] as const) {
        const v = (bonusRaw as Record<string, unknown>)[k];
        if (typeof v === "number" && Number.isFinite(v)) {
          bonus[k] = Math.floor(v);
        }
      }
    }
    return {
      completed: true,
      professionId:
        typeof o.professionId === "string" ? o.professionId : "",
      circumstanceId:
        typeof o.circumstanceId === "string" ? o.circumstanceId : "",
      bonus,
    };
  }
  return {
    completed: true,
    professionId: "",
    circumstanceId: "",
    bonus: {},
  };
}

export type InventoryStack = { curatedId: string; qty: number };

/** Лут игрока на месте смерти (persist). */
export type DeathCorpseDrop = {
  id: string;
  locationId: LocationId;
  /** Только для dungeon — этаж. В других локациях `null`. */
  dungeonFloor: number | null;
  x: number;
  y: number;
  corpseInventory: (InventoryStack | null)[];
  corpseEquipped: Partial<Record<EquipSlot, string>>;
};

export type CharacterState = {
  level: number;
  xp: number;
  hp: number;
  sta: number;
  /** Золото (не стакается как предмет) */
  gold: number;
  buffs: ActiveBuff[];
  /** Распределённые очки характеристик */
  attrs: CharacterAttributes;
  /** Нижняя граница (миграция со старых сейвов); нельзя опустить ниже при возврате очков */
  attrsMin: CharacterAttributes;
  /** Очки, ожидающие распределения после левелапа */
  unspentStatPoints: number;
};

const EQUIP_SLOTS: EquipSlot[] = [
  "weapon",
  "offhand",
  "helmet",
  "chest",
  "pants",
  "boots",
  "backpack",
  "pickaxe",
  "axe",
  "fishing_rod",
];

/** Рюкзак трупа + зеркала слотов экипировки (порядок как в EQUIP_SLOTS). */
export const DEATH_CORPSE_CHEST_PANEL_SLOTS =
  MAX_INVENTORY_SLOTS + EQUIP_SLOTS.length;

function chestStorageRowLength(chestId: string): number {
  return isDeathCorpseChestId(chestId)
    ? DEATH_CORPSE_CHEST_PANEL_SLOTS
    : CHEST_STORAGE_SLOTS;
}

function emptyChestRowForChestId(chestId: string): (InventoryStack | null)[] {
  return Array.from({ length: chestStorageRowLength(chestId) }, () => null);
}

export function markerCuratedIdForDeathCorpse(drop: DeathCorpseDrop): string {
  for (const s of drop.corpseInventory) {
    if (s?.curatedId) return s.curatedId;
  }
  for (const slot of EQUIP_SLOTS) {
    const id = drop.corpseEquipped[slot];
    if (id) return id;
  }
  return "bread";
}

function emptySlots(): (InventoryStack | null)[] {
  return Array.from({ length: MAX_INVENTORY_SLOTS }, () => null);
}

function fixLegacyCuratedId(curatedId: string): string {
  if (curatedId === "torch") return "wooden_torch";
  if (curatedId === "item719") return "hand_torch";
  if (curatedId === "item720") return "hand_torch_lit";
  return curatedId;
}

function sanitizeActiveTorch(raw: unknown): ActiveTorchState | null {
  return clampTorchRemainingForPersist(
    raw &&
      typeof raw === "object" &&
      typeof (raw as ActiveTorchState).remainingGameMinutes === "number"
      ? {
          remainingGameMinutes: (raw as ActiveTorchState)
            .remainingGameMinutes,
        }
      : null
  );
}

function sanitizeInventorySlotsPersist(
  raw: unknown
): (InventoryStack | null)[] {
  const out = emptySlots();
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i < Math.min(raw.length, MAX_INVENTORY_SLOTS); i++) {
    const s = raw[i];
    if (
      s &&
      typeof s === "object" &&
      typeof (s as InventoryStack).curatedId === "string" &&
      typeof (s as InventoryStack).qty === "number"
    ) {
      const q = Math.floor((s as InventoryStack).qty);
      out[i] = {
        curatedId: fixLegacyCuratedId((s as InventoryStack).curatedId),
        qty: Math.max(1, Math.min(MAX_STACK, q)),
      };
    }
  }
  return out;
}

function emptyChestSlots(): (InventoryStack | null)[] {
  return Array.from({ length: CHEST_STORAGE_SLOTS }, () => null);
}

/** Как tryAddItem, но для произвольной сетки слотов. */
function addItemsToSlotGrid(
  slots: (InventoryStack | null)[],
  curatedId: string,
  qty: number
): { ok: boolean; slots: (InventoryStack | null)[]; remaining: number } {
  const def = getCuratedItem(curatedId);
  if (!def) return { ok: false, slots, remaining: qty };
  if (qty <= 0) return { ok: false, slots, remaining: qty };

  let remaining = qty;
  const out: (InventoryStack | null)[] = [...slots];

  while (remaining > 0) {
    let merged = false;
    for (let i = 0; i < out.length; i++) {
      const s = out[i];
      if (!s || s.curatedId !== curatedId) continue;
      const space = MAX_STACK - s.qty;
      if (space <= 0) continue;
      const add = Math.min(space, remaining);
      out[i] = { curatedId, qty: s.qty + add };
      remaining -= add;
      merged = true;
      break;
    }
    if (remaining <= 0) break;
    if (merged) continue;

    const emptyIdx = out.findIndex((x) => x === null);
    if (emptyIdx === -1) {
      return {
        ok: false,
        slots: out,
        remaining,
      };
    }
    const put = Math.min(remaining, MAX_STACK);
    out[emptyIdx] = { curatedId, qty: put };
    remaining -= put;
  }

  return { ok: true, slots: out, remaining: 0 };
}

function sanitizeChestSlotsPersist(
  raw: unknown
): Record<string, (InventoryStack | null)[]> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, (InventoryStack | null)[]> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isDeathCorpseChestId(k)) continue;
    if (!Array.isArray(v)) continue;
    const row = emptyChestSlots();
    for (let i = 0; i < CHEST_STORAGE_SLOTS; i++) {
      const s = v[i];
      if (
        s &&
        typeof s === "object" &&
        typeof (s as InventoryStack).curatedId === "string" &&
        typeof (s as InventoryStack).qty === "number"
      ) {
        const q = Math.floor((s as InventoryStack).qty);
        row[i] = {
          curatedId: (s as InventoryStack).curatedId,
          qty: Math.max(1, Math.min(MAX_STACK, q)),
        };
      }
    }
    out[k] = row;
  }
  return out;
}

function initialCharacter(origin?: OriginStatBonus): CharacterState {
  const attrs = { ...ZERO_ATTRIBUTES };
  const attrsMin = { ...ZERO_ATTRIBUTES };
  const d = getDerivedCombatStats(1, {}, origin, attrs);
  return {
    level: 1,
    xp: 0,
    hp: d.maxHp,
    sta: d.maxSta,
    gold: 0,
    buffs: [],
    attrs,
    attrsMin,
    unspentStatPoints: 0,
  };
}

function buildAttrFieldsFromPersist(
  raw: Record<string, unknown>,
  level: number,
  needsLegacyStatMigration: boolean,
  prevSaveVersion: number | undefined
): Pick<CharacterState, "attrs" | "attrsMin" | "unspentStatPoints"> {
  const L = Math.max(1, Math.floor(level));

  let attrsInput: unknown = raw.attrs;
  let attrsMinInput: unknown = raw.attrsMin;

  const needsVitTghEndMigration =
    typeof prevSaveVersion === "number" &&
    prevSaveVersion < SAVE_VERSION_FIRST_VIT_TGH_END;

  if (
    needsVitTghEndMigration &&
    attrsInput &&
    typeof attrsInput === "object" &&
    !("tgh" in (attrsInput as object))
  ) {
    const m = migrateCharacterAttrsFromSaveV14(L, attrsInput, attrsMinInput);
    attrsInput = m.attrs;
    attrsMinInput = m.attrsMin;
  }

  const rawHasAttrs =
    attrsInput &&
    typeof attrsInput === "object" &&
    (["str", "agi", "vit", "tgh", "end", "mob"] as const).some((k) => {
      const v = (attrsInput as Record<string, unknown>)[k];
      return typeof v === "number";
    });

  if (needsLegacyStatMigration) {
    if (!rawHasAttrs) {
      const migrated = migrateAttrsFromLegacyLevel(L);
      return {
        attrs: { ...migrated },
        attrsMin: { ...migrated },
        unspentStatPoints: 0,
      };
    }
  }

  if (!rawHasAttrs) {
    return {
      attrs: { ...ZERO_ATTRIBUTES },
      attrsMin: { ...ZERO_ATTRIBUTES },
      unspentStatPoints:
        typeof raw.unspentStatPoints === "number" &&
        Number.isFinite(raw.unspentStatPoints)
          ? Math.max(0, Math.floor(raw.unspentStatPoints))
          : 0,
    };
  }

  const attrs = sanitizeCharacterAttributes(attrsInput);
  let attrsMin = sanitizeCharacterAttributes(attrsMinInput);
  const minSum =
    attrsMin.str +
    attrsMin.agi +
    attrsMin.vit +
    attrsMin.tgh +
    attrsMin.end +
    attrsMin.mob;
  const attrSum =
    attrs.str + attrs.agi + attrs.vit + attrs.tgh + attrs.end + attrs.mob;
  if (minSum === 0 && attrSum > 0) {
    attrsMin = { ...attrs };
  }
  const unp =
    typeof raw.unspentStatPoints === "number" &&
    Number.isFinite(raw.unspentStatPoints)
      ? Math.max(0, Math.floor(raw.unspentStatPoints))
      : 0;
  return { attrs, attrsMin, unspentStatPoints: unp };
}

/** Срез состояния для «Новая игра» (совпадает с persist / начальными значениями стора). */
export function createFreshPersistedGameState(): GameSaveState {
  const spawn = getLocation("town").spawns.default;
  return {
    saveVersion: SAVE_VERSION,
    currentLocationId: "town",
    player: defaultPlayerPoseAt(spawn.x, spawn.y),
    character: initialCharacter(undefined),
    isekaiOrigin: { completed: false },
    staWindedUntilMs: 0,
    inventorySlots: emptySlots(),
    equipped: {},
    pickedWorldItemIds: {},
    pickedForestForageIds: {},
    deathDrops: {},
    openedChestIds: {},
    chestSlots: {},
    chestTableLootClaimed: {},
    enemyRespawnNotBeforeMs: {},
    quests: {},
    shops: {},
    dungeonMaxClearedFloor: 0,
    dungeonCurrentFloor: 1,
    dungeonRevealedCells: {},
    forestWorldSeed: 0,
    forestRevealedCells: {},
    choppedForestTreeKeys: {},
    minedForestRockKeys: {},
    forestTreeRegrowAtMs: {},
    forestRockRegrowAtMs: {},
    forestTreeStumps: {},
    hotbarSelectedIndex: 0,
    consumableCooldownUntil: {},
    lifetimeStats: initialLifetimeStats(),
    unlockedAchievements: {},
    professions: initialProfessions(),
    consumableEffectsRevealed: {},
    worldDay: 1,
    worldTimeMinutes: MORNING_GAME_MINUTES,
    activeTorch: null,
    villageFogLifted: false,
    openingCutsceneScriptVersion: 0,
  };
}

function sanitizePickedIdRecord(raw: unknown): Record<string, boolean> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === "string" && k.trim() && v === true) out[k] = true;
  }
  return out;
}

function sanitizeConsumableEffectsRevealed(
  raw: unknown
): Record<string, true> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, true> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof k === "string" && k.trim() && v === true) out[k] = true;
  }
  return out;
}

function sanitizeBuffs(raw: unknown): ActiveBuff[] {
  const ids = new Set(Object.keys(BUFFS));
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (x): x is ActiveBuff =>
        typeof x === "object" &&
        x !== null &&
        typeof (x as ActiveBuff).id === "string" &&
        typeof (x as ActiveBuff).remainingSec === "number"
    )
    .filter((x) => ids.has(x.id))
    .map((x) => ({
      id: x.id,
      remainingSec: Math.max(0, x.remainingSec),
    }));
}

function mergeBuffs(
  current: ActiveBuff[],
  incoming: NonNullable<ConsumableFx["applyBuffs"]>
): ActiveBuff[] {
  const map = new Map<string, number>();
  for (const b of current) {
    if (b.remainingSec > 0) map.set(b.id, b.remainingSec);
  }
  for (const inc of incoming) {
    const prev = map.get(inc.id) ?? 0;
    map.set(inc.id, Math.max(prev, inc.durationSec));
  }
  return [...map.entries()].map(([id, remainingSec]) => ({
    id,
    remainingSec,
  }));
}

/** Та же логика слияния, что у `tryAddItem`, но над переданной копией `slots`. */
function mergeCuratedQtyIntoSlots(
  slots: (InventoryStack | null)[],
  effectiveSlotCount: number,
  curatedId: string,
  qty: number
): { slots: (InventoryStack | null)[]; remaining: number } {
  const def = getCuratedItem(curatedId);
  if (!def) return { slots, remaining: qty };
  if (qty <= 0) return { slots, remaining: 0 };
  let remaining = qty;
  const out = [...slots];
  const eff = Math.max(0, Math.min(effectiveSlotCount, MAX_INVENTORY_SLOTS));

  while (remaining > 0) {
    let merged = false;
    for (let i = 0; i < eff; i++) {
      const s = out[i];
      if (!s || s.curatedId !== curatedId) continue;
      const space = MAX_STACK - s.qty;
      if (space <= 0) continue;
      const add = Math.min(space, remaining);
      out[i] = { curatedId, qty: s.qty + add };
      remaining -= add;
      merged = true;
      break;
    }
    if (remaining <= 0) break;
    if (merged) continue;

    const emptyIdx = out.slice(0, eff).findIndex((x) => x === null);
    if (emptyIdx === -1) {
      break;
    }
    const put = Math.min(remaining, MAX_STACK);
    out[emptyIdx] = { curatedId, qty: put };
    remaining -= put;
  }
  return { slots: out, remaining };
}

function hasActiveDeathSickness(buffs: ActiveBuff[] | undefined): boolean {
  return (
    buffs?.some(
      (b) => b.id === DEATH_SICKNESS_BUFF_ID && b.remainingSec > 0
    ) ?? false
  );
}

function sanitizeDeathDrops(raw: unknown): Record<string, DeathCorpseDrop> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, DeathCorpseDrop> = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_PERSISTED_DEATH_CORPSES) break;
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : k;
    const locRaw = o.locationId;
    if (typeof locRaw !== "string" || !isLocationId(locRaw)) continue;
    const x = typeof o.x === "number" && Number.isFinite(o.x) ? o.x : NaN;
    const y = typeof o.y === "number" && Number.isFinite(o.y) ? o.y : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

    let dungeonFloor: number | null = null;
    if (locRaw === "dungeon") {
      const df = o.dungeonFloor;
      dungeonFloor =
        typeof df === "number" && Number.isFinite(df)
          ? clampDungeonFloor(df)
          : 1;
    } else if (o.dungeonFloor != null) {
      continue;
    }

    const corpseInventory = sanitizeInventorySlotsPersist(o.corpseInventory);
    let corpseEquipped: Partial<Record<EquipSlot, string>> = {};
    const rawEq = o.corpseEquipped;
    if (rawEq && typeof rawEq === "object") {
      for (const slot of EQUIP_SLOTS) {
        const cid = (rawEq as Record<string, unknown>)[slot];
        if (typeof cid === "string" && cid.trim()) {
          corpseEquipped[slot] = fixLegacyCuratedId(cid.trim());
        }
      }
    }
    corpseEquipped = sanitizeEquippedVsCatalog(corpseEquipped, corpseInventory);

    out[id] = {
      id,
      locationId: locRaw,
      dungeonFloor,
      x,
      y,
      corpseInventory,
      corpseEquipped,
    };
    n++;
  }
  return out;
}

function pruneOldestDeathDropIfFull(
  drops: Record<string, DeathCorpseDrop>
): Record<string, DeathCorpseDrop> {
  const keys = Object.keys(drops);
  if (keys.length < MAX_PERSISTED_DEATH_CORPSES) return drops;
  const sorted = [...keys].sort((a, b) => {
    const ma = /^corp_(\d+)_/.exec(a);
    const mb = /^corp_(\d+)_/.exec(b);
    const ta = ma ? Number(ma[1]) : 0;
    const tb = mb ? Number(mb[1]) : 0;
    return ta - tb;
  });
  const dropKey = sorted[0];
  if (!dropKey) return drops;
  const next = { ...drops };
  delete next[dropKey];
  return next;
}

function vitalityNowMs(): number {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

export type GameSaveState = {
  saveVersion: number;
  /** Текущая локация (Фаза 7): town | forest */
  currentLocationId: LocationId;
  player: PlayerWorldPose;
  character: CharacterState;
  /**
   * Окончание «перегруза» после нуля стамины от спринта (performance.now / Date.now).
   * Не сохраняется в persist.
   */
  staWindedUntilMs: number;
  inventorySlots: (InventoryStack | null)[];
  equipped: Partial<Record<EquipSlot, string>>;
  pickedWorldItemIds: Record<string, boolean>;
  /** Подобранные грибы/подлесок у деревьев (ключ `forest_forage_*` из чанка). */
  pickedForestForageIds: Record<string, boolean>;
  /** Лут на месте смерти (подбирается у маркера «трупа»). */
  deathDrops: Record<string, DeathCorpseDrop>;
  openedChestIds: Record<string, boolean>;
  /** Содержимое сундуков по id (ключ — chest id из loot / dungeon). */
  chestSlots: Record<string, (InventoryStack | null)[]>;
  /** Городской лут из таблицы уже сидирован в chestSlots (или миграция со старого opened). */
  chestTableLootClaimed: Record<string, boolean>;
  /**
   * Абсолютное время (мс, `Date.now()`): до этого момента точку спавна не заселять.
   * Ключ отсутствует — моб жив или таймер не активен.
   */
  enemyRespawnNotBeforeMs: Record<string, number>;
  quests: Record<string, unknown>;
  /** Склады лавок: ключ = shop id */
  shops: Record<string, ShopPersistState>;
  /** Пролог исекая и бонусы к статам (после выбора — completed). */
  isekaiOrigin: IsekaiOriginPersisted;
  /** Максимальный полностью пройденный этаж подземелья (0 = ни одного). */
  dungeonMaxClearedFloor: number;
  /** Активный этаж 1…100 при заходе в dungeon; вне подземелья сбрасывается в 1. */
  dungeonCurrentFloor: number;
  /**
   * Разведка мини-карты подземелья: ключ `{floor}:{gx},{gy}` → открыта.
   * Только для локации dungeon; новый этаж начинается с пустой картой.
   */
  dungeonRevealedCells: Record<string, boolean>;
  /**
   * Сид бесконечного леса (чанки). `0` — до первого захода в лес не задан;
   * задаётся в `ensureForestWorldSeedIfUnset`.
   */
  forestWorldSeed: number;
  /** Разведка леса: ключ `forest:gx,gy` (мировая сетка) → открыта. */
  forestRevealedCells: Record<string, boolean>;
  /**
   * Устарело: навсегда вырублено; при загрузке переносится в `forestTreeRegrowAtMs`.
   */
  choppedForestTreeKeys: Record<string, true>;
  /**
   * Устарело: навсегда добыто; при загрузке переносится в `forestRockRegrowAtMs`.
   */
  minedForestRockKeys: Record<string, true>;
  /**
   * Дерево появится снова после метки времени (пустая клетка до этого момента).
   */
  forestTreeRegrowAtMs: Record<string, number>;
  /**
   * Валун появится снова после метки времени.
   */
  forestRockRegrowAtMs: Record<string, number>;
  /**
   * Пень после рубки: ключ дерева → время `Date.now()`, до которого показывать chopped.
   */
  forestTreeStumps: Record<string, number>;
  /** Выбранный слот хотбара (первые HOTBAR_SLOT_COUNT ячеек рюкзака). */
  hotbarSelectedIndex: number;
  /**
   * Откат расходников по curated id: до какого момента (Date.now) нельзя снова применить.
   * Не сохраняется в persist.
   */
  consumableCooldownUntil: Record<string, number>;
  /** Накопительная статистика за всю игру. */
  lifetimeStats: LifetimeStats;
  /** id достижения → время разблокировки (Date.now). */
  unlockedAchievements: Record<string, number>;
  /** Прогресс профессий сбора/крафта (не нарратив исекая). */
  professions: Record<GatherProfessionId, ProfessionProgress>;
  /**
   * Curated id расходников (и активных предметов с эффектом), для которых игрок уже
   * видел описание эффекта — после первого успешного применения.
   */
  consumableEffectsRevealed: Record<string, true>;
  /** Календарный день мира (1 = первый день после старта / миграции). */
  worldDay: number;
  /**
   * Время суток в игровых минутах от полуночи [0, 1440).
   * Дробная часть допустима (накопление от кадров).
   */
  worldTimeMinutes: number;
  /**
   * Горящий расходный факел: свет, пока `remainingGameMinutes` > 0.
   * Не привязан к выбранному слоту хотбара.
   */
  activeTorch: ActiveTorchState | null;
  /**
   * Магический туман на дороге из деревни; снимается после зачистки последнего этажа катакомб.
   */
  villageFogLifted: boolean;
  /**
   * Последняя ревизия текста стартовой кат-сцены, которую игрок полностью прошёл.
   * `0` — ещё не видел текущую `OPENING_CUTSCENE_SCRIPT_VERSION`.
   */
  openingCutsceneScriptVersion: number;
};

type GameStore = GameSaveState & {
  setPlayerPosition: (x: number, y: number) => void;
  setPlayerWorldPose: (pose: PlayerWorldPose) => void;
  tryAddItem: (
    curatedId: string,
    qty: number
  ) => { ok: boolean; reason?: string };
  removeSlotAt: (index: number, qty?: number) => void;
  swapSlots: (from: number, to: number) => void;
  /** Полностью очистить ячейку (выбросить предмет). */
  dropSlot: (index: number) => void;
  /** Отделить `qty` штук в первый свободный слот. */
  splitStack: (
    index: number,
    qty: number
  ) => { ok: boolean; reason?: string };
  equipFromInventorySlot: (slotIndex: number) => boolean;
  unequip: (equipSlot: EquipSlot) => boolean;
  markWorldPickupTaken: (worldPickupId: string) => void;
  markForestForageTaken: (forageId: string) => void;
  markChestOpened: (chestId: string) => void;
  /** Гарантировать длину ряда: сундук или панель «у тела». */
  ensureChestStorageRow: (chestId: string) => void;
  prepareDeathCorpseChest: (dropId: string) => boolean;
  finalizeDeathCorpseChest: (dropId: string) => void;
  swapChestSlots: (chestId: string, from: number, to: number) => void;
  moveBetweenInvAndChest: (
    chestId: string,
    from: { kind: "inv" | "chest"; index: number },
    to: { kind: "inv" | "chest"; index: number }
  ) => void;
  /** Сид городского лута в сундук; idempotent. Возвращает XP или null если нечего делать. */
  applyTownChestLootSeedIfNeeded: (chestId: string) => number | null;
  /**
   * Однократная выдача дропа сундука босса (инвентарь / дроп у сундука).
   * Если уже выдано — noop.
   */
  applyBossChestLootIfNeeded: (
    chestId: string,
    worldX: number,
    worldY: number
  ) => { applied: boolean; xp: number; toastLines: string[] };
  takeDamage: (amount: number) => void;
  grantXp: (amount: number) => { leveled: boolean; levels: number };
  /**
   * Опыт профессии: те же множители luck / xpGainMult, что у grantXp; без очков характеристик.
   */
  grantProfessionXp: (
    professionId: GatherProfessionId,
    amount: number
  ) => { leveled: boolean; levels: number };
  /** Крафт по рецепту на станции `stationId` (должен совпадать с рецептом). */
  tryCraftRecipe: (
    recipeId: string,
    stationId: string
  ) => {
    ok: boolean;
    reason?: string;
    successMessage?: string;
    materialsLost?: boolean;
  };
  /** Потратить одно свободное очко в выбранный стат */
  allocateStatPoint: (attr: AttrKey) => void;
  /** Вернуть одно очко из стата (не ниже attrsMin) */
  deallocateStatPoint: (attr: AttrKey) => void;
  respawnAfterDeath: () => void;
  tryRecoverDeathCorpse: (dropId: string) => {
    ok: boolean;
    reason?: string;
    cleared?: boolean;
    partial?: boolean;
    openAsChest?: boolean;
  };
  useConsumableAt: (
    slotIndex: number
  ) => { ok: boolean; reason?: string };
  /** После смены экипировки — удержать hp/sta в новых пределах */
  clampCharacterVitals: () => void;
  /** moving — есть ввод движения; sprinting — ускоренный бег (тратит стамину) */
  tickVitality: (
    deltaMs: number,
    moving: boolean,
    sprinting: boolean
  ) => void;
  /**
   * После смерти: `notBefore = now + delay`.
   * Если передан `delayMs` — используется он (например градиент леса).
   */
  scheduleEnemyRespawn: (
    enemyInstanceId: string,
    mobVisualId: string,
    options?: { delayMs?: number }
  ) => void;
  /** После респавна на сцене — убрать таймер (моб снова жив). */
  clearEnemyRespawnAfterSpawn: (enemyInstanceId: string) => void;
  /** Сброс таймеров процедурных лесных мобов (`forest_w_*`) при новом заходе в лес. */
  purgeForestWildEnemyTimers: () => void;
  /** После перехода между локациями — атомарно обновить id и позицию */
  setLocationAndPosition: (
    locationId: LocationId,
    x: number,
    y: number
  ) => void;
  addGold: (amount: number) => void;
  spendGold: (amount: number) => { ok: boolean };
  /** Применить пополнение склада и сохранить (для UI) */
  touchShopRestock: (shopId: string) => void;
  buyFromShop: (
    shopId: string,
    curatedId: string,
    qty: number
  ) => { ok: boolean; reason?: string };
  sellToShop: (
    shopId: string,
    slotIndex: number,
    qty: number
  ) => { ok: boolean; reason?: string };
  /** Стереть сейв игры в storage и в памяти (квесты сбрасывайте отдельно). */
  resetToNewGame: () => void;
  /** Завершить пролог исекая: записать выбор и выставить полные HP/STA под бонусы. */
  completeIsekaiOrigin: (
    professionId: string,
    circumstanceId: string
  ) => void;
  /** Проверить правила и записать этаж перед входом в dungeon. */
  enterDungeonFloor: (floor: number) => { ok: boolean; reason?: string };
  /** Засчитать убийство босса на «следующем» этаже (строго max+1). Возвращает, поднялся ли max. */
  registerDungeonBossCleared: (floor: number) => boolean;
  setHotbarSelectedIndex: (index: number) => void;
  /** deltaSign: +1 вперёд, -1 назад (колесо мыши). */
  nudgeHotbarSelection: (deltaSign: number) => void;
  /** Полные HP/STA по derived, сброс перегруза (после канала «сна» в UI). */
  applySleepRecovery: () => void;
  /** Сон по расписанию: время мира и частичное/полное восстановление виталов. */
  applySleepSchedule: (wake: WorldClock, sleepGameMinutes: number) => void;
  /** Игровое время суток (только активный геймплей — вызывать из MainScene). */
  tickWorldTime: (deltaMs: number) => void;
  /** Установить 06:00; если уже после 06:00 — следующий календарный день. */
  setWorldTimeToMorning: () => void;
  /** Открыть клетки мини-карты вокруг мировой позиции (подземелье). */
  revealDungeonMapAtWorld: (
    floor: number,
    worldX: number,
    worldY: number
  ) => void;
  /** Один раз за сейв выставить сид бесконечного леса, если ещё `0`. */
  ensureForestWorldSeedIfUnset: () => void;
  /** Открыть клетки мини-карты леса вокруг мировой позиции. */
  revealForestMapAtWorld: (worldX: number, worldY: number) => void;
  isForestTreeChopped: (key: string) => boolean;
  markForestTreeChopped: (key: string) => void;
  markForestTreeStump: (key: string, visibleUntilMs: number) => void;
  isForestRockMined: (key: string) => boolean;
  markForestRockMined: (key: string) => void;
  /** Истёкшие пни → задержка до отрастания дерева; вернуть ключи для анимации пня. */
  expireForestStumpsBefore: (nowMs: number) => string[];
  /** Деревья и камни, у которых истёк таймер возврата — ключи сняты со стора; перезагрузить чанки. */
  finalizeForestRegrowthPrune: (nowMs: number) => {
    treeKeys: string[];
    rockKeys: string[];
  };
  /** Учёт убийства врага (все типы, включая босса). */
  recordEnemyKill: (payload: {
    mobVisualId: string;
    instanceId: string;
  }) => void;
  /** Перепроверить достижения (в т.ч. после событий квестов). */
  flushAchievements: () => void;
  /** Отметить текущую ревизию пролога как просмотренную (сохраняется). */
  markOpeningCutsceneScriptCurrent: () => void;
};

function clampCharacterToDerived(
  c: CharacterState,
  equipped: Partial<Record<EquipSlot, string>>,
  origin?: OriginStatBonus
): CharacterState {
  const d = getDerivedCombatStats(c.level, equipped, origin, c.attrs);
  return {
    ...c,
    hp: Math.max(0, Math.min(c.hp, d.maxHp)),
    sta: Math.max(0, Math.min(c.sta, d.maxSta)),
  };
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => {
      const flushAchievementUnlocks = () => {
        if (typeof window === "undefined") return;
        const st = get();
        const snap = buildAchievementSnapshot({
          lifetimeStats: st.lifetimeStats,
          characterLevel: st.character.level,
          dungeonMaxClearedFloor: st.dungeonMaxClearedFloor,
        });
        const newIds = computeNewlyUnlockedAchievementIds(
          st.unlockedAchievements,
          snap
        );
        if (newIds.length === 0) return;
        const now = Date.now();
        set((s) => ({
          unlockedAchievements: {
            ...s.unlockedAchievements,
            ...Object.fromEntries(newIds.map((id) => [id, now] as const)),
          },
        }));
        for (const id of newIds) {
          const def = getAchievementById(id);
          window.dispatchEvent(
            new CustomEvent("last-summon-toast", {
              detail: {
                message: `Достижение: ${def?.title ?? id}`,
              },
            })
          );
        }
      };

      return {
      saveVersion: SAVE_VERSION,
      currentLocationId: "town",
      player: defaultPlayerPoseAt(
        getLocation("town").spawns.default.x,
        getLocation("town").spawns.default.y
      ),
      character: initialCharacter(undefined),
      isekaiOrigin: {
        completed: true,
        professionId: "",
        circumstanceId: "",
        bonus: {},
      },
      inventorySlots: emptySlots(),
      equipped: {},
      pickedWorldItemIds: {},
      pickedForestForageIds: {},
      deathDrops: {},
      openedChestIds: {},
      chestSlots: {},
      chestTableLootClaimed: {},
      enemyRespawnNotBeforeMs: {},
      quests: {},
      shops: {},
      staWindedUntilMs: 0,
      dungeonMaxClearedFloor: 0,
      dungeonCurrentFloor: 1,
      dungeonRevealedCells: {},
      forestWorldSeed: 0,
      forestRevealedCells: {},
      choppedForestTreeKeys: {},
      minedForestRockKeys: {},
      forestTreeRegrowAtMs: {},
      forestRockRegrowAtMs: {},
      forestTreeStumps: {},
      hotbarSelectedIndex: 0,
      consumableCooldownUntil: {},
      lifetimeStats: initialLifetimeStats(),
      unlockedAchievements: {},
      professions: initialProfessions(),
      consumableEffectsRevealed: {},
      worldDay: 1,
      worldTimeMinutes: MORNING_GAME_MINUTES,
      activeTorch: null,
      villageFogLifted: false,
      openingCutsceneScriptVersion: 0,

      setHotbarSelectedIndex: (index) =>
        set({
          hotbarSelectedIndex: wrapHotbarIndex(index, HOTBAR_SLOT_COUNT),
        }),

      nudgeHotbarSelection: (deltaSign) => {
        if (deltaSign === 0) return;
        set((s) => ({
          hotbarSelectedIndex: shiftHotbarIndex(
            s.hotbarSelectedIndex,
            deltaSign > 0 ? 1 : -1,
            HOTBAR_SLOT_COUNT
          ),
        }));
      },

      setPlayerPosition: (x, y) =>
        set((s) => ({
          player: { ...s.player, x, y },
        })),

      setPlayerWorldPose: (pose) => set({ player: pose }),

      revealDungeonMapAtWorld: (floor, worldX, worldY) => {
        if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
        const { gx, gy } = worldToDungeonCell(worldX, worldY);
        const keys = revealCellKeysForFloor(
          floor,
          gx,
          gy,
          DUNGEON_REVEAL_RADIUS_CELLS
        );
        set((s) => {
          let changed = false;
          const next: Record<string, boolean> = { ...s.dungeonRevealedCells };
          for (const k of keys) {
            if (!next[k]) {
              next[k] = true;
              changed = true;
            }
          }
          if (!changed) return s;
          return { dungeonRevealedCells: next };
        });
      },

      ensureForestWorldSeedIfUnset: () =>
        set((s) => {
          if (s.forestWorldSeed !== 0) return s;
          let n = 0;
          if (typeof crypto !== "undefined" && crypto.getRandomValues) {
            const u = new Uint32Array(1);
            crypto.getRandomValues(u);
            n = u[0]! >>> 0;
          } else {
            n = (Math.floor(Math.random() * 0xffffffff) >>> 0) ^ 0x514f5253;
          }
          return { forestWorldSeed: n === 0 ? 0x514f5253 : n };
        }),

      revealForestMapAtWorld: (worldX, worldY) => {
        if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return;
        const { gx, gy } = worldToForestCell(worldX, worldY);
        const keys = revealForestCellKeysAround(
          gx,
          gy,
          FOREST_REVEAL_RADIUS_CELLS
        );
        set((s) => {
          let changed = false;
          const next: Record<string, boolean> = { ...s.forestRevealedCells };
          for (const k of keys) {
            if (!next[k]) {
              next[k] = true;
              changed = true;
            }
          }
          if (!changed) return s;
          return { forestRevealedCells: next };
        });
      },

      isForestTreeChopped: (key) => {
        if (typeof key !== "string" || key.length === 0) return false;
        const s = get();
        if (s.choppedForestTreeKeys[key] === true) return true;
        const until = s.forestTreeRegrowAtMs[key];
        return typeof until === "number" && until > Date.now();
      },

      markForestTreeChopped: (key) => {
        if (typeof key !== "string" || key.length === 0) return;
        set((s) => {
          const nextStumps = { ...s.forestTreeStumps };
          delete nextStumps[key];
          const nextRegrow = { ...s.forestTreeRegrowAtMs };
          if (Object.keys(nextRegrow).length >= MAX_CHOPPED_FOREST_TREE_KEYS) {
            return s;
          }
          nextRegrow[key] = Date.now() + FOREST_TREE_REGROW_MS;
          return {
            forestTreeStumps: nextStumps,
            forestTreeRegrowAtMs: nextRegrow,
          };
        });
      },

      markForestTreeStump: (key, visibleUntilMs) => {
        if (typeof key !== "string" || key.length === 0) return;
        if (
          typeof visibleUntilMs !== "number" ||
          !Number.isFinite(visibleUntilMs)
        ) {
          return;
        }
        set((s) => {
          if (s.choppedForestTreeKeys[key] === true) return s;
          let nextRegrow = s.forestTreeRegrowAtMs;
          if (nextRegrow[key] !== undefined) {
            nextRegrow = { ...nextRegrow };
            delete nextRegrow[key];
          }
          return {
            forestTreeStumps: {
              ...s.forestTreeStumps,
              [key]: Math.floor(visibleUntilMs),
            },
            forestTreeRegrowAtMs: nextRegrow,
          };
        });
      },

      expireForestStumpsBefore: (nowMs) => {
        if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) return [];
        const s = get();
        const keys: string[] = [];
        for (const [k, until] of Object.entries(s.forestTreeStumps)) {
          if (until <= nowMs) keys.push(k);
        }
        if (keys.length === 0) return [];
        set((state) => {
          const nextStumps = { ...state.forestTreeStumps };
          const nextRegrow = { ...state.forestTreeRegrowAtMs };
          for (const k of keys) {
            delete nextStumps[k];
            nextRegrow[k] = nowMs + FOREST_TREE_REGROW_MS;
          }
          return {
            forestTreeStumps: nextStumps,
            forestTreeRegrowAtMs: nextRegrow,
          };
        });
        return keys;
      },

      finalizeForestRegrowthPrune: (nowMs) => {
        if (typeof nowMs !== "number" || !Number.isFinite(nowMs)) {
          return { treeKeys: [], rockKeys: [] };
        }
        const st = get();
        const treeKeys: string[] = [];
        const rockKeys: string[] = [];
        for (const [k, until] of Object.entries(st.forestTreeRegrowAtMs)) {
          if (until <= nowMs) treeKeys.push(k);
        }
        for (const [k, until] of Object.entries(st.forestRockRegrowAtMs)) {
          if (until <= nowMs) rockKeys.push(k);
        }
        if (treeKeys.length === 0 && rockKeys.length === 0) {
          return { treeKeys: [], rockKeys: [] };
        }
        set((s) => {
          const nextT = { ...s.forestTreeRegrowAtMs };
          const nextR = { ...s.forestRockRegrowAtMs };
          for (const k of treeKeys) delete nextT[k];
          for (const k of rockKeys) delete nextR[k];
          return {
            forestTreeRegrowAtMs: nextT,
            forestRockRegrowAtMs: nextR,
          };
        });
        return { treeKeys, rockKeys };
      },

      isForestRockMined: (key) => {
        if (typeof key !== "string" || key.length === 0) return false;
        const s = get();
        if (s.minedForestRockKeys[key] === true) return true;
        const until = s.forestRockRegrowAtMs[key];
        return typeof until === "number" && until > Date.now();
      },

      markForestRockMined: (key) => {
        if (typeof key !== "string" || key.length === 0) return;
        set((s) => {
          if (s.minedForestRockKeys[key] === true) return s;
          const nextR = { ...s.forestRockRegrowAtMs };
          const n = Object.keys(nextR).length;
          if (n >= MAX_MINED_FOREST_ROCK_KEYS) return s;
          nextR[key] = Date.now() + FOREST_ROCK_REGROW_MS;
          return { forestRockRegrowAtMs: nextR };
        });
      },

      addGold: (amount) => {
        if (amount <= 0 || !Number.isFinite(amount)) return;
        const add = Math.floor(amount);
        set((s) => ({
          character: {
            ...s.character,
            gold: Math.max(0, Math.floor(s.character.gold + add)),
          },
          lifetimeStats: {
            ...s.lifetimeStats,
            totalGoldEarned: s.lifetimeStats.totalGoldEarned + add,
          },
        }));
        flushAchievementUnlocks();
      },

      spendGold: (amount) => {
        if (amount <= 0 || !Number.isFinite(amount)) return { ok: true };
        const need = Math.floor(amount);
        const st = get();
        if (st.character.gold < need) return { ok: false };
        set((s) => ({
          character: {
            ...s.character,
            gold: s.character.gold - need,
          },
          lifetimeStats: {
            ...s.lifetimeStats,
            totalGoldSpent: s.lifetimeStats.totalGoldSpent + need,
          },
        }));
        flushAchievementUnlocks();
        return { ok: true };
      },

      touchShopRestock: (shopId) => {
        const def = getShopDefById(shopId);
        if (!def) return;
        set((s) => {
          const prev = s.shops[shopId] ?? initialShopRuntime(def);
          const next = applyShopRestock(def, prev, Date.now());
          return { shops: { ...s.shops, [shopId]: next } };
        });
      },

      buyFromShop: (shopId, curatedId, qty) => {
        const def = getShopDefById(shopId);
        if (!def) return { ok: false, reason: "Нет лавки" };
        const entry = getShopEntry(def, curatedId);
        if (!entry) return { ok: false, reason: "Не продаётся здесь" };
        if (qty < 1 || !Number.isFinite(qty))
          return { ok: false, reason: "Неверное количество" };

        const needLevel = entry.requiredLevel ?? 0;
        if (get().character.level < needLevel) {
          return {
            ok: false,
            reason: `Нужен уровень ${needLevel}`,
          };
        }

        const st = get();
        let runtime = st.shops[shopId] ?? initialShopRuntime(def);
        runtime = applyShopRestock(def, runtime, Date.now());

        const stockAvail = runtime.stock[curatedId] ?? 0;
        if (stockAvail < qty)
          return { ok: false, reason: "Нет на складе" };

        const base = getItemBasePrice(curatedId);
        if (base <= 0)
          return { ok: false, reason: "Предмет без цены" };

        const unit = computeBuyUnitPrice(def, entry, base);
        const total = unit * qty;

        const goldBefore = get().character.gold;
        const spent = get().spendGold(total);
        if (!spent.ok) {
          set({ shops: { ...get().shops, [shopId]: runtime } });
          return { ok: false, reason: "Недостаточно золота" };
        }

        const add = get().tryAddItem(curatedId, qty);
        if (!add.ok) {
          set({
            character: { ...get().character, gold: goldBefore },
            shops: { ...get().shops, [shopId]: runtime },
          });
          return { ok: false, reason: add.reason ?? "Нет места" };
        }

        const newStock = { ...runtime.stock };
        newStock[curatedId] = stockAvail - qty;
        set((s) => ({
          shops: {
            ...s.shops,
            [shopId]: { ...runtime, stock: newStock },
          },
          lifetimeStats: {
            ...s.lifetimeStats,
            itemsBoughtTotalQty: s.lifetimeStats.itemsBoughtTotalQty + qty,
          },
        }));
        flushAchievementUnlocks();
        return { ok: true };
      },

      sellToShop: (shopId, slotIndex, qty) => {
        const def = getShopDefById(shopId);
        if (!def) return { ok: false, reason: "Нет лавки" };
        const st = get();
        const stack = st.inventorySlots[slotIndex];
        if (!stack || stack.qty < 1)
          return { ok: false, reason: "Пустой слот" };
        const take = Math.min(stack.qty, qty);
        if (take < 1) return { ok: false, reason: "Неверное количество" };

        const base = getItemBasePrice(stack.curatedId);
        if (base <= 0)
          return { ok: false, reason: "Нельзя продать" };

        let runtime = st.shops[shopId] ?? initialShopRuntime(def);
        runtime = applyShopRestock(def, runtime, Date.now());

        const entry = getShopEntry(def, stack.curatedId);
        const unitSell = computeSellUnitPrice(def, entry, base);
        if (unitSell <= 0)
          return { ok: false, reason: "Нельзя продать" };

        const totalGold = unitSell * take;

        get().removeSlotAt(slotIndex, take);
        get().addGold(totalGold);

        const catalogEntry = getShopEntry(def, stack.curatedId);
        let nextRuntime = runtime;
        if (catalogEntry) {
          const max = catalogEntry.stock;
          const cur = runtime.stock[stack.curatedId] ?? 0;
          nextRuntime = {
            ...runtime,
            stock: {
              ...runtime.stock,
              [stack.curatedId]: Math.min(max, cur + take),
            },
          };
        }
        set((s) => ({
          shops: { ...s.shops, [shopId]: nextRuntime },
          lifetimeStats: {
            ...s.lifetimeStats,
            itemsSoldTotalQty: s.lifetimeStats.itemsSoldTotalQty + take,
          },
        }));
        flushAchievementUnlocks();
        return { ok: true };
      },

      setLocationAndPosition: (locationId, x, y) =>
        set((s) => ({
          currentLocationId: locationId,
          player: {
            ...s.player,
            x,
            y,
            vx: 0,
            vy: 0,
            facing: "down",
            flipX: false,
          },
          dungeonCurrentFloor:
            locationId === "dungeon" ? s.dungeonCurrentFloor : 1,
        })),

      enterDungeonFloor: (floor) => {
        const f = clampDungeonFloor(floor);
        const st = get();
        if (!canEnterDungeonFloor(f, st.dungeonMaxClearedFloor)) {
          return { ok: false, reason: "Этаж ещё недоступен" };
        }
        set({ dungeonCurrentFloor: f });
        return { ok: true };
      },

      registerDungeonBossCleared: (floor) => {
        const f = clampDungeonFloor(floor);
        const st = get();
        if (f !== st.dungeonMaxClearedFloor + 1) return false;
        if (f < 1 || f > DUNGEON_MAX_FLOOR) return false;
        const liftFog = f === DUNGEON_MAX_FLOOR;
        set((s) => ({
          dungeonMaxClearedFloor: f,
          villageFogLifted: liftFog ? true : s.villageFogLifted,
          lifetimeStats: {
            ...s.lifetimeStats,
            dungeonBossFirstClears: s.lifetimeStats.dungeonBossFirstClears + 1,
          },
        }));
        flushAchievementUnlocks();
        return true;
      },

      clampCharacterVitals: () =>
        set((s) => ({
          character: clampCharacterToDerived(
            s.character,
            s.equipped,
            persistedOriginBonus(s.isekaiOrigin)
          ),
        })),

      tickVitality: (deltaMs, moving, sprinting) =>
        set((s) => {
          const dt = deltaMs / 1000;
          const now = vitalityNowMs();
          let staWindedUntilMs = s.staWindedUntilMs ?? 0;
          if (staWindedUntilMs > 0 && now >= staWindedUntilMs) {
            staWindedUntilMs = 0;
          }
          const isStaWinded = staWindedUntilMs > 0 && now < staWindedUntilMs;

          const buffs = (s.character.buffs ?? [])
            .map((b) => ({
              ...b,
              remainingSec: b.remainingSec - dt,
            }))
            .filter((b) => b.remainingSec > 0);

          const d = getDerivedCombatStats(
            s.character.level,
            s.equipped,
            persistedOriginBonus(s.isekaiOrigin),
            s.character.attrs
          );
          let sta = s.character.sta;
          let hp = s.character.hp;

          const drainStamina = moving && sprinting && !isStaWinded && sta > 0;

          if (drainStamina) {
            const drainMult = buffNumericProduct(buffs, "staDrainMult");
            const prevSta = sta;
            sta = Math.max(
              0,
              sta - STA_DRAIN_RUN_PER_SEC * dt * drainMult
            );
            if (prevSta > 0 && sta <= 0) {
              staWindedUntilMs = now + STA_WINDED_DURATION_MS;
            }
          } else {
            const regenMult = buffNumericProduct(buffs, "staRegenMult");
            sta = Math.min(
              d.maxSta,
              sta + STA_REGEN_IDLE_PER_SEC * dt * regenMult
            );
            if (!moving && hp < d.maxHp && hp > 0) {
              const hpRegenMult = buffNumericProduct(buffs, "hpRegenMult");
              hp = Math.min(
                d.maxHp,
                hp + HP_REGEN_IDLE_PER_SEC * dt * hpRegenMult
              );
            }
          }

          return {
            staWindedUntilMs,
            character: {
              ...s.character,
              hp,
              sta,
              buffs,
            },
          };
        }),

      tickWorldTime: (deltaMs) => {
        if (deltaMs <= 0) return;
        const dm = gameMinutesFromRealMs(deltaMs);
        set((s) => {
          const next = advanceWorldTime(
            {
              worldDay: s.worldDay,
              worldTimeMinutes: s.worldTimeMinutes,
            },
            deltaMs
          );
          const prevTorch = s.activeTorch;
          const nextTorch = drainTorchGameMinutes(prevTorch, dm);
          const clockChanged =
            next.worldDay !== s.worldDay ||
            next.worldTimeMinutes !== s.worldTimeMinutes;
          const torchChanged =
            (prevTorch === null) !== (nextTorch === null) ||
            (prevTorch &&
              nextTorch &&
              Math.abs(
                prevTorch.remainingGameMinutes -
                  nextTorch.remainingGameMinutes
              ) > 1e-6);
          if (!clockChanged && !torchChanged) {
            return {};
          }
          if (prevTorch && !nextTorch && typeof window !== "undefined") {
            queueMicrotask(() => {
              window.dispatchEvent(
                new CustomEvent("last-summon-toast", {
                  detail: { message: "Факел догорел." },
                })
              );
            });
          }
          const patch: Partial<GameSaveState> = {};
          if (clockChanged) {
            patch.worldDay = next.worldDay;
            patch.worldTimeMinutes = next.worldTimeMinutes;
          }
          if (torchChanged) {
            patch.activeTorch = nextTorch;
          }
          return patch;
        });
      },

      setWorldTimeToMorning: () =>
        set((s) => {
          const next = wakeUpAtMorning({
            worldDay: s.worldDay,
            worldTimeMinutes: s.worldTimeMinutes,
          });
          return {
            worldDay: next.worldDay,
            worldTimeMinutes: next.worldTimeMinutes,
          };
        }),

      takeDamage: (amount) => {
        if (amount <= 0) return;
        set((s) => ({
          character: {
            ...s.character,
            hp: Math.max(0, s.character.hp - Math.floor(amount)),
          },
        }));
      },

      grantXp: (amount) => {
        if (amount <= 0) return { leveled: false, levels: 0 };
        const st = get();
        const ob = persistedOriginBonus(st.isekaiOrigin);
        const buffs = st.character.buffs ?? [];
        const dLuck = getDerivedCombatStats(
          st.character.level,
          st.equipped,
          ob,
          st.character.attrs
        );
        const luckBuff = buffNumericProduct(buffs, "luckMult");
        const luckMul = xpGainFromLuckMultiplier(
          Math.max(1, dLuck.luck * luckBuff)
        );
        const xpBuff = buffNumericProduct(buffs, "xpGainMult");
        const xpApplied = Math.floor(amount * luckMul * xpBuff);
        let xp = st.character.xp + xpApplied;
        let level = st.character.level;
        let levels = 0;
        while (xp >= xpToNext(level)) {
          xp -= xpToNext(level);
          level++;
          levels++;
        }
        const d = getDerivedCombatStats(level, st.equipped, ob, st.character.attrs);
        const leveled = levels > 0;
        const extraPoints =
          levels > 0 ? levels * STAT_POINTS_PER_LEVEL : 0;
        set((s) => ({
          character: {
            ...s.character,
            level,
            xp,
            unspentStatPoints: s.character.unspentStatPoints + extraPoints,
            hp: leveled ? d.maxHp : Math.min(s.character.hp, d.maxHp),
            sta: leveled ? d.maxSta : Math.min(s.character.sta, d.maxSta),
          },
          lifetimeStats: {
            ...s.lifetimeStats,
            totalXpGained: s.lifetimeStats.totalXpGained + xpApplied,
          },
        }));
        flushAchievementUnlocks();
        return { leveled, levels };
      },

      grantProfessionXp: (professionId, amount) => {
        if (amount <= 0) return { leveled: false, levels: 0 };
        const st = get();
        const ob = persistedOriginBonus(st.isekaiOrigin);
        const buffs = st.character.buffs ?? [];
        const dLuck = getDerivedCombatStats(
          st.character.level,
          st.equipped,
          ob,
          st.character.attrs
        );
        const luckBuff = buffNumericProduct(buffs, "luckMult");
        const luckMul = xpGainFromLuckMultiplier(
          Math.max(1, dLuck.luck * luckBuff)
        );
        const xpBuff = buffNumericProduct(buffs, "xpGainMult");
        const xpApplied = Math.floor(amount * luckMul * xpBuff);
        if (xpApplied <= 0) return { leveled: false, levels: 0 };

        const cur = st.professions[professionId];
        let xp = cur.xp + xpApplied;
        let level = cur.level;
        let levels = 0;
        while (xp >= professionXpToNext(level)) {
          xp -= professionXpToNext(level);
          level++;
          levels++;
        }
        set((s) => ({
          professions: {
            ...s.professions,
            [professionId]: { level, xp },
          },
        }));
        return { leveled: levels > 0, levels };
      },

      tryCraftRecipe: (recipeId, stationId) => {
        const recipe = getRecipeById(recipeId);
        if (!recipe) return { ok: false, reason: "Рецепт не найден" };
        if (recipe.stationId !== stationId) {
          return { ok: false, reason: "Этот рецепт для другой станции" };
        }
        for (const line of [...recipe.inputs, ...recipe.outputs]) {
          if (!getCuratedItem(line.curatedId)) {
            return { ok: false, reason: "Неизвестный предмет в рецепте" };
          }
        }
        const st = get();
        const craftProfId = gatherProfessionIdForCraftStation(stationId);
        const craftLv = st.professions[craftProfId].level;
        const profLabel = GATHER_PROFESSION_LABELS[craftProfId];
        const inputLineCount = recipe.inputs.length;
        if (!recipeInputLinesAllowed(craftLv, inputLineCount)) {
          const need = minCraftingLevelForRecipeInputLines(inputLineCount);
          return {
            ok: false,
            reason: `Нужен уровень «${profLabel}» ${need} (сейчас ${craftLv})`,
          };
        }
        const goldCost = Math.max(0, Math.floor(recipe.goldCost ?? 0));
        if (goldCost > st.character.gold) {
          return { ok: false, reason: "Недостаточно золота" };
        }
        if (!hasRecipeInputs(st.inventorySlots, recipe)) {
          return { ok: false, reason: "Недостаточно материалов" };
        }
        const slotsAfterSuccess = simulateCraftOutputs(
          cloneInventorySlots(st.inventorySlots),
          recipe
        );
        if (!slotsAfterSuccess) {
          return {
            ok: false,
            reason: "Недостаточно материалов или нет места в рюкзаке",
          };
        }

        const materialsLost = rollCraftMaterialsLost(
          () => Math.random(),
          craftLv
        );
        const nextSlots = materialsLost
          ? simulateCraftConsumeInputsOnly(
              cloneInventorySlots(st.inventorySlots),
              recipe
            )
          : slotsAfterSuccess;
        if (!nextSlots) {
          return { ok: false, reason: "Недостаточно материалов" };
        }

        set({
          inventorySlots: nextSlots,
          character: {
            ...st.character,
            gold: materialsLost
              ? st.character.gold
              : st.character.gold - goldCost,
          },
          lifetimeStats:
            !materialsLost
              ? {
                  ...st.lifetimeStats,
                  totalGoldSpent:
                    st.lifetimeStats.totalGoldSpent +
                    (goldCost > 0 ? goldCost : 0),
                  craftedRecipesById: {
                    ...st.lifetimeStats.craftedRecipesById,
                    [recipeId]:
                      (st.lifetimeStats.craftedRecipesById[recipeId] ?? 0) + 1,
                  },
                }
              : st.lifetimeStats,
        });

        if (materialsLost) {
          flushAchievementUnlocks();
          return {
            ok: false,
            materialsLost: true,
            reason:
              "Попытка провалилась — материалы пропали, результата нет. С ростом уровня в этом ремесле срывов бывает меньше.",
          };
        }

        get().grantProfessionXp(craftProfId, XP_PROFESSION_CRAFT_PER_ACTION);
        flushAchievementUnlocks();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("last-summon:craft-completed", {
              detail: { recipeId, stationId },
            })
          );
        }
        const successMessage = recipe.outputs
          .map((line: { curatedId: string; qty: number }) => {
            const def = getCuratedItem(line.curatedId);
            return `${def?.name ?? line.curatedId} ×${line.qty}`;
          })
          .join(", ");
        return {
          ok: true,
          successMessage:
            successMessage.length > 0
              ? `Создано: ${successMessage}`
              : "Готово.",
        };
      },

      allocateStatPoint: (attr) => {
        set((s) => {
          if (s.character.unspentStatPoints <= 0) return s;
          const attrs = {
            ...s.character.attrs,
            [attr]: s.character.attrs[attr] + 1,
          };
          return {
            character: {
              ...s.character,
              attrs,
              unspentStatPoints: s.character.unspentStatPoints - 1,
            },
          };
        });
      },

      deallocateStatPoint: (attr) => {
        set((s) => {
          const cur = s.character.attrs[attr];
          const min = s.character.attrsMin[attr];
          if (cur <= min) return s;
          const attrs = { ...s.character.attrs, [attr]: cur - 1 };
          return {
            character: {
              ...s.character,
              attrs,
              unspentStatPoints: s.character.unspentStatPoints + 1,
            },
          };
        });
      },

      respawnAfterDeath: () => {
        const st = get();
        const deathX = st.player.x;
        const deathY = st.player.y;
        const deathLoc = st.currentLocationId;
        const deathDungeonFloor =
          deathLoc === "dungeon" ? st.dungeonCurrentFloor : null;

        const diedUnderSickness = hasActiveDeathSickness(st.character.buffs);

        const { level: nextLevel, xp: nextXp } = applyXpDeathPenalty(
          st.character.level,
          st.character.xp
        );
        const levelsLost = st.character.level - nextLevel;
        const reclaimed = reclaimStatPointsAfterLevelLoss(
          st.character.attrs,
          st.character.attrsMin,
          st.character.unspentStatPoints,
          levelsLost
        );

        const goldLost = rollGoldLostOnDeath(st.character.gold);
        const nextGold = Math.max(0, st.character.gold - goldLost);

        let nextInventory = st.inventorySlots;
        let nextEquipped = st.equipped;
        let nextDeathDrops = st.deathDrops;

        if (diedUnderSickness) {
          nextDeathDrops = pruneOldestDeathDropIfFull({ ...nextDeathDrops });
          const corpseId = `corp_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 10)}`;
          nextDeathDrops = {
            ...nextDeathDrops,
            [corpseId]: {
              id: corpseId,
              locationId: deathLoc,
              dungeonFloor: deathDungeonFloor,
              x: deathX,
              y: deathY,
              corpseInventory: cloneInventorySlots(st.inventorySlots),
              corpseEquipped: { ...st.equipped },
            },
          };
          nextInventory = emptySlots();
          nextEquipped = {};
        }

        const d = getDerivedCombatStats(
          nextLevel,
          nextEquipped,
          persistedOriginBonus(st.isekaiOrigin),
          reclaimed.attrs
        );
        const sicknessBuff: ActiveBuff = {
          id: DEATH_SICKNESS_BUFF_ID,
          remainingSec: DEATH_SICKNESS_DURATION_SEC,
        };

        const townLoc = getLocation("town");
        const locId = deathLoc;
        const spawnKey =
          locId === "dungeon"
            ? "from_dungeon"
            : locId === "forest"
              ? "from_forest"
              : "default";
        const spawn =
          townLoc.spawns[spawnKey as keyof typeof townLoc.spawns] ??
          townLoc.spawns.default;
        const relocate = locId === "dungeon" || locId === "forest";

        set((s) => ({
          currentLocationId: "town",
          player: defaultPlayerPoseAt(spawn.x, spawn.y),
          staWindedUntilMs: 0,
          inventorySlots: nextInventory,
          equipped: nextEquipped,
          deathDrops: nextDeathDrops,
          character: {
            ...s.character,
            level: nextLevel,
            xp: nextXp,
            attrs: reclaimed.attrs,
            unspentStatPoints: reclaimed.unspentStatPoints,
            gold: nextGold,
            hp: d.maxHp,
            sta: d.maxSta,
            buffs: [sicknessBuff],
          },
          lifetimeStats: {
            ...s.lifetimeStats,
            playerDeaths: s.lifetimeStats.playerDeaths + 1,
          },
        }));
        flushAchievementUnlocks();
        if (typeof window !== "undefined") {
          if (relocate) {
            window.dispatchEvent(
              new CustomEvent("last-summon-request-goto-location", {
                detail: {
                  locationId: "town",
                  spawnId: spawnKey,
                  reviveIfDead: false,
                  deathWarp: true,
                },
              })
            );
          } else {
            window.dispatchEvent(
              new CustomEvent("last-summon-respawn-player", {
                detail: { x: spawn.x, y: spawn.y },
              })
            );
          }

          const where =
            locId === "dungeon"
              ? "Вас вытащили из подземелья и отнесли в поселение."
              : locId === "forest"
                ? "Вас нашли в лесу и притащили в деревню."
                : "Вас оттащили к дороге в поселение.";
          const xpBit = " Часть опыта растворилась.";
          const goldBit =
            goldLost > 0
              ? ` Потеряно золота: ${goldLost}.`
              : " Золото не потеряно.";
          const sickBit =
            " Действует «болезнь смерти» — не умирайте снова, иначе вещи останутся у тела.";
          const corpseBit = diedUnderSickness
            ? " Ваши вещи лежат там, где вы пали — доберитесь и заберите их."
            : "";
          window.dispatchEvent(
            new CustomEvent(DEATH_MODAL_EVENT, {
              detail: {
                message: `Вы теряете сознание… ${where}${xpBit}${goldBit}${sickBit}${corpseBit}`,
              },
            })
          );
        }
      },

      tryRecoverDeathCorpse: (dropId) => {
        const st = get();
        const drop = st.deathDrops[dropId];
        if (!drop) {
          return { ok: false, reason: "Здесь нечего забирать" };
        }

        let slots = cloneInventorySlots(st.inventorySlots);
        const eff = getEffectiveInventorySlotCount(st.equipped);
        const inv = cloneInventorySlots(drop.corpseInventory);
        const eq: Partial<Record<EquipSlot, string>> = { ...drop.corpseEquipped };
        let touched = false;

        for (let i = 0; i < inv.length; i++) {
          const stack = inv[i];
          if (!stack) continue;
          const r = mergeCuratedQtyIntoSlots(
            slots,
            eff,
            stack.curatedId,
            stack.qty
          );
          slots = r.slots;
          if (r.remaining < stack.qty) {
            touched = true;
            inv[i] =
              r.remaining <= 0
                ? null
                : { curatedId: stack.curatedId, qty: r.remaining };
          }
        }

        for (const slot of EQUIP_SLOTS) {
          const cid = eq[slot];
          if (!cid) continue;
          const r = mergeCuratedQtyIntoSlots(slots, eff, cid, 1);
          slots = r.slots;
          if (r.remaining === 0) {
            touched = true;
            delete eq[slot];
          }
        }

        const emptyInv = inv.every((x) => x === null);
        const emptyEq = EQUIP_SLOTS.every((sl) => !eq[sl]);

        const hasSomething =
          drop.corpseInventory.some((x) => x !== null) ||
          EQUIP_SLOTS.some((sl) => !!drop.corpseEquipped[sl]);

        if (!touched) {
          if (!hasSomething) {
            return { ok: false, reason: "Здесь нечего забирать" };
          }
          return { ok: false, openAsChest: true, reason: "Инвентарь полон" };
        }

        set((s) => {
          const nextDrops =
            emptyInv && emptyEq
              ? Object.fromEntries(
                  Object.entries(s.deathDrops).filter(([k]) => k !== dropId)
                )
              : {
                  ...s.deathDrops,
                  [dropId]: {
                    ...drop,
                    corpseInventory: inv,
                    corpseEquipped: eq,
                  },
                };
          return {
            inventorySlots: slots,
            deathDrops: nextDrops,
          };
        });
        get().clampCharacterVitals();
        return {
          ok: true,
          cleared: emptyInv && emptyEq,
          partial: !(emptyInv && emptyEq),
        };
      },

      prepareDeathCorpseChest: (dropId) => {
        const st = get();
        const drop = st.deathDrops[dropId];
        if (!drop) return false;
        const key = deathCorpseChestId(dropId);
        const row: (InventoryStack | null)[] = Array.from(
          { length: DEATH_CORPSE_CHEST_PANEL_SLOTS },
          () => null
        );
        const inv = cloneInventorySlots(drop.corpseInventory);
        for (let i = 0; i < MAX_INVENTORY_SLOTS; i++) {
          row[i] = inv[i] ?? null;
        }
        for (let i = 0; i < EQUIP_SLOTS.length; i++) {
          const es = EQUIP_SLOTS[i]!;
          const id = drop.corpseEquipped[es];
          row[MAX_INVENTORY_SLOTS + i] = id
            ? { curatedId: id, qty: 1 }
            : null;
        }
        get().ensureChestStorageRow(key);
        set((s) => ({
          chestSlots: { ...s.chestSlots, [key]: row },
        }));
        return true;
      },

      finalizeDeathCorpseChest: (dropId) => {
        const key = deathCorpseChestId(dropId);
        set((s) => {
          const row = s.chestSlots[key];
          const nextChest = { ...s.chestSlots };
          delete nextChest[key];

          const drop = s.deathDrops[dropId];
          if (
            !drop ||
            !row ||
            row.length !== DEATH_CORPSE_CHEST_PANEL_SLOTS
          ) {
            return { chestSlots: nextChest };
          }

          const invSlice = row.slice(0, MAX_INVENTORY_SLOTS);
          let corpseInventory = emptySlots();
          for (let i = 0; i < MAX_INVENTORY_SLOTS; i++) {
            const c = invSlice[i];
            corpseInventory[i] = c ? { curatedId: c.curatedId, qty: c.qty } : null;
          }

          const corpseEquipped: Partial<Record<EquipSlot, string>> = {};
          for (let i = 0; i < EQUIP_SLOTS.length; i++) {
            const es = EQUIP_SLOTS[i]!;
            const stak = row[MAX_INVENTORY_SLOTS + i];
            if (!stak) continue;
            corpseEquipped[es] = stak.curatedId;
            if (stak.qty > 1) {
              const r = addItemsToSlotGrid(
                corpseInventory,
                stak.curatedId,
                stak.qty - 1
              );
              corpseInventory = r.slots;
              if (r.remaining > 0 && typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent(SPAWN_WORLD_PICKUP_EVENT, {
                    detail: {
                      curatedId: stak.curatedId,
                      qty: r.remaining,
                      worldX: drop.x,
                      worldY: drop.y,
                    },
                  })
                );
              }
            }
          }

          const corpseEquippedSan = sanitizeEquippedVsCatalog(
            corpseEquipped,
            corpseInventory
          );
          const emptyInv = corpseInventory.every((x) => x === null);
          const emptyEq = EQUIP_SLOTS.every((sl) => !corpseEquippedSan[sl]);

          const nextDrops =
            emptyInv && emptyEq
              ? Object.fromEntries(
                  Object.entries(s.deathDrops).filter(([k]) => k !== dropId)
                )
              : {
                  ...s.deathDrops,
                  [dropId]: {
                    ...drop,
                    corpseInventory,
                    corpseEquipped: corpseEquippedSan,
                  },
                };

          return { chestSlots: nextChest, deathDrops: nextDrops };
        });
        get().clampCharacterVitals();
      },

      useConsumableAt: (slotIndex) => {
        const state = get();
        const stack = state.inventorySlots[slotIndex];
        if (!stack || stack.qty < 1)
          return { ok: false, reason: "Пустой слот" };
        const def = getCuratedItem(stack.curatedId);
        if (!def || !itemSlotSupportsUsableEffect(def.slot))
          return { ok: false, reason: "Нельзя использовать" };

        if (stack.curatedId === "hand_torch") {
          get().removeSlotAt(slotIndex, 1);
          set((s) => ({
            activeTorch: {
              remainingGameMinutes: TORCH_FULL_GAME_MINUTES,
            },
            consumableEffectsRevealed: {
              ...s.consumableEffectsRevealed,
              hand_torch: true,
            },
            lifetimeStats: {
              ...s.lifetimeStats,
              consumablesUsed: s.lifetimeStats.consumablesUsed + 1,
            },
          }));
          flushAchievementUnlocks();
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("last-summon-toast", {
                detail: { message: "Факел зажжён — горит, пока не выгорит." },
              })
            );
          }
          return { ok: true };
        }

        const readable = getReadableBookForItem(stack.curatedId);
        if (readable && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent(READABLE_BOOK_OPEN_EVENT, {
              detail: { curatedId: stack.curatedId },
            })
          );
          return { ok: true };
        }

        const fx = getConsumableEffect(stack.curatedId);
        if (!fx)
          return { ok: false, reason: "Пока нельзя использовать" };

        const now = Date.now();
        const cdEnd = state.consumableCooldownUntil[stack.curatedId] ?? 0;
        if (now < cdEnd) {
          const sec = Math.max(1, Math.ceil((cdEnd - now) / 1000));
          return { ok: false, reason: `Откат: ${sec} с` };
        }

        get().removeSlotAt(slotIndex, 1);
        const st = get();
        const d = getDerivedCombatStats(
          st.character.level,
          st.equipped,
          persistedOriginBonus(st.isekaiOrigin),
          st.character.attrs
        );
        let hp = st.character.hp;
        let sta = st.character.sta;
        if (fx.healHp) hp = Math.min(d.maxHp, hp + fx.healHp);
        if (fx.restoreSta) sta = Math.min(d.maxSta, sta + fx.restoreSta);
        let buffs = st.character.buffs ?? [];
        if (fx.applyBuffs?.length) {
          buffs = mergeBuffs(buffs, fx.applyBuffs);
        }
        const cdMs = getConsumableCooldownMs(stack.curatedId);
        set((s) => ({
          character: { ...s.character, hp, sta, buffs },
          consumableCooldownUntil: {
            ...s.consumableCooldownUntil,
            [stack.curatedId]: now + cdMs,
          },
          consumableEffectsRevealed: {
            ...s.consumableEffectsRevealed,
            [stack.curatedId]: true,
          },
          lifetimeStats: {
            ...s.lifetimeStats,
            consumablesUsed: s.lifetimeStats.consumablesUsed + 1,
          },
        }));
        flushAchievementUnlocks();
        return { ok: true };
      },

      tryAddItem: (curatedId, qty) => {
        const def = getCuratedItem(curatedId);
        if (!def) return { ok: false, reason: "Неизвестный предмет" };
        if (qty <= 0) return { ok: false, reason: "Неверное количество" };

        let remaining = qty;
        const slots: (InventoryStack | null)[] = [...get().inventorySlots];
        const eff = getEffectiveInventorySlotCount(get().equipped);

        while (remaining > 0) {
          let merged = false;
          for (let i = 0; i < eff; i++) {
            const s = slots[i];
            if (!s || s.curatedId !== curatedId) continue;
            const space = MAX_STACK - s.qty;
            if (space <= 0) continue;
            const add = Math.min(space, remaining);
            slots[i] = { curatedId, qty: s.qty + add };
            remaining -= add;
            merged = true;
            break;
          }
          if (remaining <= 0) break;
          if (merged) continue;

          const emptyIdx = slots.slice(0, eff).findIndex((x) => x === null);
          if (emptyIdx === -1) {
            return {
              ok: false,
              reason:
                remaining === qty ? "Инвентарь полон" : "Мало места в инвентаре",
            };
          }
          const put = Math.min(remaining, MAX_STACK);
          slots[emptyIdx] = { curatedId, qty: put };
          remaining -= put;
        }

        set({ inventorySlots: slots });
        return { ok: true };
      },

      removeSlotAt: (index, qty = Infinity) => {
        set((state) => {
          const slots = [...state.inventorySlots];
          const s = slots[index];
          if (!s) return state;
          const take = Math.min(s.qty, qty);
          const left = s.qty - take;
          slots[index] = left <= 0 ? null : { ...s, qty: left };
          return { inventorySlots: slots };
        });
      },

      swapSlots: (from, to) => {
        set((state) => {
          const eff = getEffectiveInventorySlotCount(state.equipped);
          if (
            from < 0 ||
            to < 0 ||
            from >= eff ||
            to >= eff
          ) {
            return state;
          }
          const slots = [...state.inventorySlots];
          const tmp = slots[from];
          slots[from] = slots[to];
          slots[to] = tmp;
          return { inventorySlots: slots };
        });
      },

      dropSlot: (index) =>
        set((state) => {
          if (index < 0 || index >= state.inventorySlots.length) return state;
          const stack = state.inventorySlots[index];
          if (!stack) return state;
          const { curatedId, qty } = stack;
          const slots = [...state.inventorySlots];
          slots[index] = null;
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(SPAWN_WORLD_PICKUP_EVENT, {
                detail: { curatedId, qty },
              })
            );
          }
          return { inventorySlots: slots };
        }),

      splitStack: (index, qty) => {
        const state = get();
        const stack = state.inventorySlots[index];
        if (!stack || stack.qty < 2) {
          return { ok: false, reason: "Нечего делить" };
        }
        if (!Number.isFinite(qty) || qty < 1 || qty >= stack.qty) {
          return { ok: false, reason: "Некорректное количество" };
        }
        const eff = getEffectiveInventorySlotCount(state.equipped);
        const emptyIdx = state.inventorySlots
          .slice(0, eff)
          .findIndex((s) => s === null);
        if (emptyIdx === -1) {
          return { ok: false, reason: "Нет свободного слота" };
        }
        set((st) => {
          const slots = [...st.inventorySlots];
          const s = slots[index];
          if (!s || s.qty < 2) return st;
          if (!Number.isFinite(qty) || qty < 1 || qty >= s.qty) return st;
          const effNow = getEffectiveInventorySlotCount(st.equipped);
          const nextEmpty = slots.slice(0, effNow).findIndex((x) => x === null);
          if (nextEmpty === -1) return st;
          slots[index] = { ...s, qty: s.qty - qty };
          slots[nextEmpty] = { curatedId: s.curatedId, qty };
          return { inventorySlots: slots };
        });
        return { ok: true };
      },

      equipFromInventorySlot: (slotIndex) => {
        const state = get();
        const stack = state.inventorySlots[slotIndex];
        if (!stack || stack.qty < 1) return false;
        const def = getCuratedItem(stack.curatedId);
        if (!def) return false;
        if (!EQUIP_SLOTS.includes(def.slot as EquipSlot)) return false;
        const equipSlot = def.slot as EquipSlot;

        const tentativeEquipped = {
          ...state.equipped,
          [equipSlot]: stack.curatedId,
        };
        const tentativeSlots = [...state.inventorySlots];
        if (stack.qty <= 1) tentativeSlots[slotIndex] = null;
        else tentativeSlots[slotIndex] = { ...stack, qty: stack.qty - 1 };

        const effAfter = getEffectiveInventorySlotCount(tentativeEquipped);
        for (let i = effAfter; i < tentativeSlots.length; i++) {
          if (tentativeSlots[i]) return false;
        }

        const prevEquipped = state.equipped[equipSlot];

        const slots = [...state.inventorySlots];
        if (stack.qty <= 1) slots[slotIndex] = null;
        else slots[slotIndex] = { ...stack, qty: stack.qty - 1 };

        set({
          inventorySlots: slots,
          equipped: { ...state.equipped, [equipSlot]: stack.curatedId },
        });

        if (prevEquipped) {
          get().tryAddItem(prevEquipped, 1);
        }
        get().clampCharacterVitals();
        return true;
      },

      unequip: (equipSlot) => {
        const state = get();
        const id = state.equipped[equipSlot];
        if (!id) return false;
        const tentativeEq = { ...state.equipped };
        delete tentativeEq[equipSlot];
        const effAfter = getEffectiveInventorySlotCount(tentativeEq);
        const slotsCheck = state.inventorySlots;
        for (let i = effAfter; i < slotsCheck.length; i++) {
          if (slotsCheck[i]) return false;
        }
        const res = get().tryAddItem(id, 1);
        if (!res.ok) return false;
        set((st) => {
          const eq = { ...st.equipped };
          delete eq[equipSlot];
          return { equipped: eq };
        });
        get().clampCharacterVitals();
        return true;
      },

      markWorldPickupTaken: (worldPickupId) => {
        const wp = WORLD_PICKUPS.find((w) => w.id === worldPickupId);
        set((s) => {
          const was = s.pickedWorldItemIds[worldPickupId] === true;
          const pickedWorldItemIds = {
            ...s.pickedWorldItemIds,
            [worldPickupId]: true,
          };
          if (was) return { pickedWorldItemIds };
          return {
            pickedWorldItemIds,
            lifetimeStats: {
              ...s.lifetimeStats,
              uniqueWorldPickupsTaken:
                s.lifetimeStats.uniqueWorldPickupsTaken + 1,
            },
          };
        });
        flushAchievementUnlocks();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("last-summon:item-picked", {
              detail: {
                worldPickupId,
                curatedId: wp?.curatedId,
                qty: wp?.qty,
              },
            })
          );
        }
      },

      markForestForageTaken: (forageId) => {
        const id = forageId.trim();
        if (!id) return;
        set((s) => ({
          pickedForestForageIds: { ...s.pickedForestForageIds, [id]: true },
        }));
      },

      markChestOpened: (chestId) => {
        set((s) => {
          const was = s.openedChestIds[chestId] === true;
          const openedChestIds = { ...s.openedChestIds, [chestId]: true };
          const base = {
            ...s.lifetimeStats,
            chestOpenEvents: s.lifetimeStats.chestOpenEvents + 1,
          };
          if (was) {
            return { openedChestIds, lifetimeStats: base };
          }
          return {
            openedChestIds,
            lifetimeStats: {
              ...base,
              uniqueChestsOpened: s.lifetimeStats.uniqueChestsOpened + 1,
            },
          };
        });
        flushAchievementUnlocks();
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("last-summon:chest-opened", {
              detail: { chestId },
            })
          );
        }
      },

      ensureChestStorageRow: (chestId) => {
        set((s) => {
          const wantLen = chestStorageRowLength(chestId);
          const cur = s.chestSlots[chestId];
          if (cur && cur.length === wantLen) return s;
          const row = emptyChestRowForChestId(chestId);
          if (cur && Array.isArray(cur)) {
            for (let i = 0; i < Math.min(cur.length, wantLen); i++) {
              row[i] = cur[i] ?? null;
            }
          }
          return { chestSlots: { ...s.chestSlots, [chestId]: row } };
        });
      },

      swapChestSlots: (chestId, from, to) => {
        if (from === to) return;
        get().ensureChestStorageRow(chestId);
        set((s) => {
          const row = [
            ...(s.chestSlots[chestId] ?? emptyChestRowForChestId(chestId)),
          ];
          if (
            from < 0 ||
            to < 0 ||
            from >= row.length ||
            to >= row.length
          ) {
            return s;
          }
          const tmp = row[from];
          row[from] = row[to];
          row[to] = tmp;
          return { chestSlots: { ...s.chestSlots, [chestId]: row } };
        });
      },

      moveBetweenInvAndChest: (chestId, from, to) => {
        if (from.kind === to.kind && from.index === to.index) return;
        get().ensureChestStorageRow(chestId);
        set((s) => {
          const inv = [...s.inventorySlots];
          const chestRow = [
            ...(s.chestSlots[chestId] ?? emptyChestRowForChestId(chestId)),
          ];
          const getStack = (k: "inv" | "chest", i: number) =>
            k === "inv" ? inv[i] : chestRow[i];
          const setStack = (
            k: "inv" | "chest",
            i: number,
            stack: InventoryStack | null
          ) => {
            if (k === "inv") inv[i] = stack;
            else chestRow[i] = stack;
          };

          const a = getStack(from.kind, from.index);
          const b = getStack(to.kind, to.index);

          if (!a && !b) return s;
          if (!a) return s;

          if (!b) {
            setStack(to.kind, to.index, a);
            setStack(from.kind, from.index, null);
          } else if (a.curatedId === b.curatedId) {
            const space = MAX_STACK - b.qty;
            if (space <= 0) {
              setStack(from.kind, from.index, b);
              setStack(to.kind, to.index, a);
            } else {
              const moveAmt = Math.min(a.qty, space);
              const newBQ = b.qty + moveAmt;
              const aLeft = a.qty - moveAmt;
              setStack(to.kind, to.index, { curatedId: a.curatedId, qty: newBQ });
              setStack(
                from.kind,
                from.index,
                aLeft <= 0 ? null : { curatedId: a.curatedId, qty: aLeft }
              );
            }
          } else {
            setStack(from.kind, from.index, b);
            setStack(to.kind, to.index, a);
          }

          return {
            inventorySlots: inv,
            chestSlots: { ...s.chestSlots, [chestId]: chestRow },
          };
        });
      },

      applyTownChestLootSeedIfNeeded: (chestId) => {
        const st = get();
        if (st.chestTableLootClaimed[chestId]) return null;
        if (!chestIdHasLootTable(chestId)) return null;

        get().ensureChestStorageRow(chestId);
        const loot = rollChestLoot(chestId);
        if (loot) {
          set((s) => {
            const row = [...(s.chestSlots[chestId] ?? emptyChestSlots())];
            const res = addItemsToSlotGrid(row, loot.curatedId, loot.qty);
            return {
              chestSlots: { ...s.chestSlots, [chestId]: res.slots },
              chestTableLootClaimed: {
                ...s.chestTableLootClaimed,
                [chestId]: true,
              },
            };
          });
          return XP_CHEST_FIRST;
        }
        set((s) => ({
          chestTableLootClaimed: {
            ...s.chestTableLootClaimed,
            [chestId]: true,
          },
        }));
        return XP_CHEST_EMPTY;
      },

      applyBossChestLootIfNeeded: (chestId, worldX, worldY) => {
        if (!isDungeonBossChestId(chestId)) {
          return { applied: false, xp: 0, toastLines: [] };
        }
        if (get().openedChestIds[chestId]) {
          return { applied: false, xp: 0, toastLines: [] };
        }

        get().ensureChestStorageRow(chestId);

        const floorFromChest = (() => {
          if (chestId === "chest_dungeon_boss") return 1;
          const m = /^chest_dungeon_boss_f(\d+)$/.exec(chestId);
          if (!m) return undefined;
          return clampDungeonFloor(Number(m[1]));
        })();

        let drops = rollDungeonBossChestDrops(floorFromChest);
        if (!drops.length) {
          drops = [
            { curatedId: "hp_small", qty: 1 },
            { curatedId: "bread", qty: 1 },
          ].filter((d) => getCuratedItem(d.curatedId));
        }

        const toastLines: string[] = [];
        let anyReward = false;

        let row = [
          ...(get().chestSlots[chestId] ?? emptyChestRowForChestId(chestId)),
        ];
        const spill: { curatedId: string; qty: number }[] = [];

        for (const d of drops) {
          const res = addItemsToSlotGrid(row, d.curatedId, d.qty);
          row = res.slots;
          const placed = d.qty - res.remaining;
          if (placed > 0) {
            anyReward = true;
            toastLines.push(
              `${getCuratedItem(d.curatedId)?.name ?? d.curatedId} ×${placed}`
            );
          }
          if (res.remaining > 0) {
            spill.push({ curatedId: d.curatedId, qty: res.remaining });
          }
        }

        set((s) => ({
          chestSlots: { ...s.chestSlots, [chestId]: row },
        }));

        for (const s of spill) {
          const res = get().tryAddItem(s.curatedId, s.qty);
          if (res.ok) {
            anyReward = true;
            toastLines.push(
              `${getCuratedItem(s.curatedId)?.name ?? s.curatedId} ×${s.qty}`
            );
          } else if (typeof window !== "undefined") {
            anyReward = true;
            window.dispatchEvent(
              new CustomEvent(SPAWN_WORLD_PICKUP_EVENT, {
                detail: {
                  curatedId: s.curatedId,
                  qty: s.qty,
                  worldX,
                  worldY,
                },
              })
            );
            toastLines.push(
              `${getCuratedItem(s.curatedId)?.name ?? s.curatedId} ×${s.qty} (у сундука)`
            );
          }
        }

        get().markChestOpened(chestId);
        const xp = anyReward ? XP_CHEST_FIRST : XP_CHEST_EMPTY;
        return { applied: true, xp, toastLines };
      },

      scheduleEnemyRespawn: (enemyInstanceId, mobVisualId, options) => {
        const notBeforeMs =
          Date.now() +
          (options?.delayMs ?? getEnemyRespawnDelayMs(mobVisualId));
        set((s) => ({
          enemyRespawnNotBeforeMs: {
            ...s.enemyRespawnNotBeforeMs,
            [enemyInstanceId]: notBeforeMs,
          },
        }));
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("last-summon:enemy-defeated", {
              detail: { enemyId: enemyInstanceId, respawnNotBeforeMs: notBeforeMs },
            })
          );
        }
      },

      clearEnemyRespawnAfterSpawn: (enemyInstanceId) =>
        set((s) => {
          const next = { ...s.enemyRespawnNotBeforeMs };
          delete next[enemyInstanceId];
          return { enemyRespawnNotBeforeMs: next };
        }),

      purgeForestWildEnemyTimers: () =>
        set((s) => {
          const next = { ...s.enemyRespawnNotBeforeMs };
          for (const k of Object.keys(next)) {
            if (k.startsWith("forest_w_")) delete next[k];
          }
          return { enemyRespawnNotBeforeMs: next };
        }),

      resetToNewGame: () => {
        useGameStore.persist.clearStorage();
        set(createFreshPersistedGameState());
      },

      completeIsekaiOrigin: (professionId, circumstanceId) => {
        const bonus = computeIsekaiOriginBonus(professionId, circumstanceId);
        set((s) => {
          const isekaiOrigin: IsekaiOriginPersisted = {
            completed: true,
            professionId,
            circumstanceId,
            bonus,
          };
          const d = getDerivedCombatStats(
            s.character.level,
            s.equipped,
            bonus,
            s.character.attrs
          );
          return {
            isekaiOrigin,
            character: {
              ...s.character,
              hp: d.maxHp,
              sta: d.maxSta,
            },
          };
        });
      },

      applySleepRecovery: () => {
        set((s) => {
          const d = getDerivedCombatStats(
            s.character.level,
            s.equipped,
            persistedOriginBonus(s.isekaiOrigin),
            s.character.attrs
          );
          return {
            staWindedUntilMs: 0,
            character: {
              ...s.character,
              hp: d.maxHp,
              sta: d.maxSta,
            },
          };
        });
      },

      applySleepSchedule: (wake, sleepGameMinutes) => {
        if (!Number.isFinite(sleepGameMinutes) || sleepGameMinutes < 0) return;
        set((s) => {
          const d = getDerivedCombatStats(
            s.character.level,
            s.equipped,
            persistedOriginBonus(s.isekaiOrigin),
            s.character.attrs
          );
          const st = Math.min(
            1,
            sleepGameMinutes / SLEEP_FULL_RECOVERY_GAME_MINUTES
          );
          let hp = s.character.hp;
          let sta = s.character.sta;
          if (st >= 1) {
            hp = d.maxHp;
            sta = d.maxSta;
          } else {
            hp = Math.min(d.maxHp, hp + (d.maxHp - hp) * st);
            sta = Math.min(d.maxSta, sta + (d.maxSta - sta) * st);
          }
          let staWindedUntilMs = s.staWindedUntilMs ?? 0;
          if (sleepGameMinutes >= SLEEP_WINDED_CLEAR_GAME_MINUTES) {
            staWindedUntilMs = 0;
          }
          const wd = Math.max(1, Math.floor(wake.worldDay));
          const wm = Math.min(
            GAME_MINUTES_PER_DAY - Number.EPSILON,
            Math.max(0, wake.worldTimeMinutes)
          );
          const prevTorch = s.activeTorch;
          const nextTorch = drainTorchGameMinutes(prevTorch, sleepGameMinutes);
          const torchChanged =
            (prevTorch === null) !== (nextTorch === null) ||
            (prevTorch &&
              nextTorch &&
              Math.abs(
                prevTorch.remainingGameMinutes -
                  nextTorch.remainingGameMinutes
              ) > 1e-6);
          if (prevTorch && !nextTorch && typeof window !== "undefined") {
            queueMicrotask(() => {
              window.dispatchEvent(
                new CustomEvent("last-summon-toast", {
                  detail: { message: "Факел догорел во сне." },
                })
              );
            });
          }
          return {
            worldDay: wd,
            worldTimeMinutes: wm,
            staWindedUntilMs,
            character: {
              ...s.character,
              hp,
              sta,
            },
            ...(torchChanged ? { activeTorch: nextTorch } : {}),
          };
        });
      },

      recordEnemyKill: (payload) => {
        const { mobVisualId } = payload;
        const key = mobVisualId.trim() || "unknown";
        set((s) => {
          const prevMob = s.lifetimeStats.enemiesKilledByMobVisualId[key] ?? 0;
          return {
            lifetimeStats: {
              ...s.lifetimeStats,
              enemiesKilled: s.lifetimeStats.enemiesKilled + 1,
              enemiesKilledByMobVisualId: {
                ...s.lifetimeStats.enemiesKilledByMobVisualId,
                [key]: prevMob + 1,
              },
            },
          };
        });
        flushAchievementUnlocks();
      },

      flushAchievements: () => {
        flushAchievementUnlocks();
      },

      markOpeningCutsceneScriptCurrent: () =>
        set({ openingCutsceneScriptVersion: OPENING_CUTSCENE_SCRIPT_VERSION }),
    };
    },
    {
      name: "last-summon-save-v1",
      storage: getClientPersistJsonStorage(),
      partialize: (s) => ({
        saveVersion: s.saveVersion,
        currentLocationId: s.currentLocationId,
        player: s.player,
        character: s.character,
        inventorySlots: s.inventorySlots,
        equipped: s.equipped,
        pickedWorldItemIds: s.pickedWorldItemIds,
        pickedForestForageIds: s.pickedForestForageIds,
        deathDrops: s.deathDrops,
        openedChestIds: s.openedChestIds,
        chestSlots: Object.fromEntries(
          Object.entries(s.chestSlots).filter(([k]) => !isDeathCorpseChestId(k))
        ),
        chestTableLootClaimed: s.chestTableLootClaimed,
        enemyRespawnNotBeforeMs: s.enemyRespawnNotBeforeMs,
        quests: s.quests,
        shops: s.shops,
        isekaiOrigin: s.isekaiOrigin,
        dungeonMaxClearedFloor: s.dungeonMaxClearedFloor,
        dungeonCurrentFloor: s.dungeonCurrentFloor,
        dungeonRevealedCells: s.dungeonRevealedCells,
        forestWorldSeed: s.forestWorldSeed,
        forestRevealedCells: s.forestRevealedCells,
        choppedForestTreeKeys: s.choppedForestTreeKeys,
        minedForestRockKeys: s.minedForestRockKeys,
        forestTreeRegrowAtMs: s.forestTreeRegrowAtMs,
        forestRockRegrowAtMs: s.forestRockRegrowAtMs,
        forestTreeStumps: s.forestTreeStumps,
        hotbarSelectedIndex: s.hotbarSelectedIndex,
        lifetimeStats: s.lifetimeStats,
        unlockedAchievements: s.unlockedAchievements,
        professions: s.professions,
        consumableEffectsRevealed: s.consumableEffectsRevealed,
        worldDay: s.worldDay,
        worldTimeMinutes: s.worldTimeMinutes,
        activeTorch: s.activeTorch,
        villageFogLifted: s.villageFogLifted,
        openingCutsceneScriptVersion: s.openingCutsceneScriptVersion,
      }),
      merge: (persisted, current) => {
        type P = Partial<GameSaveState>;
        const p = (persisted as P | undefined) ?? {};
        const c = current as GameStore;
        const isekaiOriginOut = parsePersistedIsekaiOrigin(
          (p as Partial<GameSaveState>).isekaiOrigin
        );
        const originB = persistedOriginBonus(isekaiOriginOut);
        const invSlots = sanitizeInventorySlotsPersist(p.inventorySlots);
        const eqRaw = {
          ...(p.equipped ?? {}),
        } as Partial<Record<EquipSlot, string>>;
        for (const k of Object.keys(eqRaw) as EquipSlot[]) {
          const v = eqRaw[k];
          if (v) eqRaw[k] = fixLegacyCuratedId(v);
        }
        const eqSan = sanitizeEquippedVsCatalog(eqRaw, invSlots);
        const rawChar = p.character as CharacterState | undefined;
        const persistedGold =
          rawChar &&
          typeof rawChar.gold === "number" &&
          Number.isFinite(rawChar.gold)
            ? Math.max(0, Math.floor(rawChar.gold))
            : 0;
        const prevSaveVersion = p.saveVersion;
        const needsLegacyStatMigration =
          typeof prevSaveVersion !== "number" ||
          prevSaveVersion < SAVE_VERSION_FIRST_WITH_ATTRS;

        const char =
          p.character &&
          typeof p.character.level === "number" &&
          typeof p.character.hp === "number"
            ? clampCharacterToDerived(
                {
                  level: p.character.level,
                  xp: typeof p.character.xp === "number" ? p.character.xp : 0,
                  hp: p.character.hp,
                  sta:
                    typeof p.character.sta === "number"
                      ? p.character.sta
                      : initialCharacter(undefined).sta,
                  gold: persistedGold,
                  buffs: sanitizeBuffs(
                    (p.character as { buffs?: unknown }).buffs
                  ),
                  ...buildAttrFieldsFromPersist(
                    p.character as Record<string, unknown>,
                    p.character.level,
                    needsLegacyStatMigration,
                    prevSaveVersion
                  ),
                },
                eqSan,
                originB
              )
            : initialCharacter(originB);
        const locIdRaw = (p as Partial<GameSaveState>).currentLocationId;
        const currentLocationId: LocationId =
          locIdRaw === "forest" ||
          locIdRaw === "town" ||
          locIdRaw === "dungeon" ||
          locIdRaw === "beyond"
            ? locIdRaw
            : "town";

        let charOut = char;
        if (needsLegacyStatMigration) {
          const dFull = getDerivedCombatStats(
            charOut.level,
            eqSan,
            originB,
            charOut.attrs
          );
          charOut = {
            ...charOut,
            hp: dFull.maxHp,
            sta: dFull.maxSta,
          };
        }

        const persistedRespawn = (p as Partial<GameSaveState>)
          .enemyRespawnNotBeforeMs;
        const enemyRespawnNotBeforeMs: Record<string, number> = {};
        if (persistedRespawn && typeof persistedRespawn === "object") {
          for (const [k, v] of Object.entries(persistedRespawn)) {
            if (typeof v === "number" && Number.isFinite(v)) {
              enemyRespawnNotBeforeMs[k] = v;
            }
          }
        }
        const legacyDefeated = (p as { defeatedEnemyIds?: unknown })
          .defeatedEnemyIds;
        if (legacyDefeated && typeof legacyDefeated === "object") {
          const migrated = migrateDefeatedEnemyIdsToRespawnNotBefore(
            legacyDefeated as Record<string, boolean>
          );
          for (const [id, t] of Object.entries(migrated)) {
            if (enemyRespawnNotBeforeMs[id] === undefined) {
              enemyRespawnNotBeforeMs[id] = t;
            }
          }
        }

        const shopsOut: Record<string, ShopPersistState> = {};
        const rawShops = (p as Partial<GameSaveState>).shops;
        if (rawShops && typeof rawShops === "object") {
          for (const [sid, runtime] of Object.entries(rawShops)) {
            if (!runtime || typeof runtime !== "object") continue;
            const lastRestockAt =
              typeof runtime.lastRestockAt === "number" &&
              Number.isFinite(runtime.lastRestockAt)
                ? runtime.lastRestockAt
                : Date.now();
            const stock: Record<string, number> = {};
            if (runtime.stock && typeof runtime.stock === "object") {
              for (const [cid, n] of Object.entries(runtime.stock)) {
                if (typeof n === "number" && Number.isFinite(n) && n >= 0) {
                  stock[cid] = Math.floor(n);
                }
              }
            }
            shopsOut[sid] = { stock, lastRestockAt };
          }
        }

        const rawMax = (p as Partial<GameSaveState>).dungeonMaxClearedFloor;
        let dungeonMaxClearedFloor = 0;
        if (typeof rawMax === "number" && Number.isFinite(rawMax)) {
          dungeonMaxClearedFloor = Math.max(
            0,
            Math.min(DUNGEON_MAX_FLOOR, Math.floor(rawMax))
          );
        }
        const rawCur = (p as Partial<GameSaveState>).dungeonCurrentFloor;
        let dungeonCurrentFloor = 1;
        if (typeof rawCur === "number" && Number.isFinite(rawCur)) {
          dungeonCurrentFloor = clampDungeonFloor(rawCur);
        }

        const rawHb = (p as Partial<GameSaveState>).hotbarSelectedIndex;
        const hotbarSelectedIndex =
          typeof rawHb === "number" && Number.isFinite(rawHb)
            ? wrapHotbarIndex(Math.floor(rawHb), HOTBAR_SLOT_COUNT)
            : 0;

        const dungeonRevealedCells = sanitizeDungeonRevealedCellsPersist(
          (p as Partial<GameSaveState>).dungeonRevealedCells
        );

        const rawForestSeed = (p as Partial<GameSaveState>).forestWorldSeed;
        const forestWorldSeed =
          typeof rawForestSeed === "number" &&
          Number.isFinite(rawForestSeed) &&
          rawForestSeed >= 0
            ? (rawForestSeed >>> 0)
            : 0;

        const forestRevealedCells = sanitizeForestRevealedCellsPersist(
          (p as Partial<GameSaveState>).forestRevealedCells
        );

        const chestTableLootClaimed: Record<string, boolean> = {};
        const rawTc = (p as Partial<GameSaveState>).chestTableLootClaimed;
        if (rawTc && typeof rawTc === "object") {
          for (const [k, v] of Object.entries(rawTc)) {
            if (v === true) chestTableLootClaimed[k] = true;
          }
        }
        const openedForLootClaim = migrateLegacyDungeonBossChestOpened(
          (p.openedChestIds ?? {}) as Record<string, boolean>
        );
        for (const [k, v] of Object.entries(openedForLootClaim)) {
          if (v && chestIdHasLootTable(k)) {
            chestTableLootClaimed[k] = true;
          }
        }

        const chestSlots = sanitizeChestSlotsPersist(
          (p as Partial<GameSaveState>).chestSlots
        );

        const lifetimeStats = sanitizeLifetimeStats(
          (p as Partial<GameSaveState>).lifetimeStats
        );
        const unlockedAchievements = sanitizeUnlockedAchievements(
          (p as Partial<GameSaveState>).unlockedAchievements
        );

        const professions = sanitizeProfessions(
          (p as Partial<GameSaveState>).professions
        );

        const choppedForestTreeKeysBase = sanitizeChoppedForestTreeKeys(
          (p as Partial<GameSaveState>).choppedForestTreeKeys
        );
        const nowForStumps = Date.now();
        const stumpSanitized = sanitizeForestTreeStumps(
          (p as Partial<GameSaveState>).forestTreeStumps,
          nowForStumps
        );
        const forestTreeRegrowAtMs = sanitizeForestTreeRegrowAtMs(
          (p as Partial<GameSaveState>).forestTreeRegrowAtMs
        );
        const migrateTreeCut = nowForStumps + FOREST_TREE_REGROW_MS;
        for (const k of Object.keys(choppedForestTreeKeysBase)) {
          const prev = forestTreeRegrowAtMs[k];
          forestTreeRegrowAtMs[k] =
            prev === undefined ? migrateTreeCut : Math.min(prev, migrateTreeCut);
        }
        for (const [k, until] of Object.entries(
          stumpSanitized.migratedToRegrowAt
        )) {
          const prev = forestTreeRegrowAtMs[k];
          forestTreeRegrowAtMs[k] =
            prev === undefined ? until : Math.min(prev, until);
        }
        const choppedForestTreeKeys: Record<string, true> = {};

        const minedForestRockKeysBase = sanitizeMinedForestRockKeys(
          (p as Partial<GameSaveState>).minedForestRockKeys
        );
        const forestRockRegrowAtMs = sanitizeForestRockRegrowAtMs(
          (p as Partial<GameSaveState>).forestRockRegrowAtMs
        );
        const migrateRockCut = nowForStumps + FOREST_ROCK_REGROW_MS;
        for (const k of Object.keys(minedForestRockKeysBase)) {
          const prev = forestRockRegrowAtMs[k];
          forestRockRegrowAtMs[k] =
            prev === undefined ? migrateRockCut : Math.min(prev, migrateRockCut);
        }
        const minedForestRockKeys: Record<string, true> = {};

        const forestTreeStumps = stumpSanitized.stumps;

        const consumableEffectsRevealed = sanitizeConsumableEffectsRevealed(
          (p as Partial<GameSaveState>).consumableEffectsRevealed
        );

        const rawWorldDay = (p as Partial<GameSaveState>).worldDay;
        const rawWorldMin = (p as Partial<GameSaveState>).worldTimeMinutes;
        const worldDay =
          typeof rawWorldDay === "number" &&
          Number.isFinite(rawWorldDay) &&
          rawWorldDay >= 1
            ? Math.min(1_000_000, Math.floor(rawWorldDay))
            : 1;
        const worldTimeMinutes =
          typeof rawWorldMin === "number" &&
          Number.isFinite(rawWorldMin) &&
          rawWorldMin >= 0
            ? ((rawWorldMin % GAME_MINUTES_PER_DAY) + GAME_MINUTES_PER_DAY) %
              GAME_MINUTES_PER_DAY
            : MORNING_GAME_MINUTES;

        const activeTorch = sanitizeActiveTorch(
          (p as Partial<GameSaveState>).activeTorch
        );

        const rawFogLifted = (p as Partial<GameSaveState>).villageFogLifted;
        let villageFogLifted =
          typeof rawFogLifted === "boolean" ? rawFogLifted : false;
        if (
          typeof prevSaveVersion === "number" &&
          prevSaveVersion < 31 &&
          dungeonMaxClearedFloor >= DUNGEON_MAX_FLOOR
        ) {
          villageFogLifted = true;
        }

        const openingCutsceneScriptVersion = resolvePersistedOpeningScriptVersion(
          p as Partial<GameSaveState>
        );

        return {
          ...c,
          saveVersion: SAVE_VERSION,
          currentLocationId,
          player: normalizePlayerWorldPose(p.player, c.player),
          character: charOut,
          inventorySlots: invSlots,
          equipped: eqSan,
          pickedWorldItemIds: p.pickedWorldItemIds ?? {},
          pickedForestForageIds: sanitizePickedIdRecord(
            (p as Partial<GameSaveState>).pickedForestForageIds
          ),
          deathDrops: sanitizeDeathDrops(
            (p as Partial<GameSaveState>).deathDrops
          ),
          openedChestIds: migrateLegacyDungeonBossChestOpened(
            p.openedChestIds ?? {}
          ),
          chestSlots,
          chestTableLootClaimed,
          enemyRespawnNotBeforeMs,
          quests: p.quests ?? {},
          shops: shopsOut,
          isekaiOrigin: isekaiOriginOut,
          dungeonMaxClearedFloor,
          dungeonCurrentFloor,
          dungeonRevealedCells,
          forestWorldSeed,
          forestRevealedCells,
          choppedForestTreeKeys,
          minedForestRockKeys,
          forestTreeRegrowAtMs,
          forestRockRegrowAtMs,
          forestTreeStumps,
          hotbarSelectedIndex,
          lifetimeStats,
          unlockedAchievements,
          professions,
          consumableEffectsRevealed,
          worldDay,
          worldTimeMinutes,
          activeTorch,
          villageFogLifted,
          openingCutsceneScriptVersion,
          staWindedUntilMs: 0,
          consumableCooldownUntil: {},
        };
      },
    }
  )
);

registerForestWorldSeedReader(() => useGameStore.getState().forestWorldSeed);

export function waitForGameStoreHydration(): Promise<void> {
  return new Promise((resolve) => {
    const p = useGameStore.persist;
    if (p.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = p.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
