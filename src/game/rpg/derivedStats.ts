import {
  ATK_LEVEL_MULT,
  ATK_PER_STR,
  BASE_ATK,
  BASE_DEF,
  BASE_LUCK,
  BASE_MAX_HP,
  BASE_MAX_STA,
  BASE_SPD,
  BUFFS,
  DEF_LEVEL_MULT,
  DEF_PER_TGH,
  HP_PER_VIT,
  SPD_LEVEL_MULT,
  SPD_PER_MOB,
  STA_PER_END,
  type BuffNumericMultKey,
} from "@/src/game/data/balance";
import { getEquipBonuses } from "@/src/game/data/itemRegistry";
import type { EquipSlot } from "@/src/game/data/items.curated";
import type { OriginStatBonus } from "@/src/game/data/isekaiOrigin";
import type { CharacterAttributes } from "@/src/game/rpg/characterAttributes";
import { ZERO_ATTRIBUTES } from "@/src/game/rpg/characterAttributes";

export type CombatDerived = {
  maxHp: number;
  maxSta: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
};

function applyFlatGearLikeBonus(
  atk: number,
  def: number,
  hpBonus: number,
  staBonus: number,
  spd: number,
  luck: number,
  b: OriginStatBonus | undefined
): { atk: number; def: number; hpBonus: number; staBonus: number; spd: number; luck: number } {
  if (!b) return { atk, def, hpBonus, staBonus, spd, luck };
  return {
    atk: atk + (b.atk ?? 0),
    def: def + (b.def ?? 0),
    hpBonus: hpBonus + (b.hp ?? 0),
    staBonus: staBonus + (b.sta ?? 0),
    spd: spd + (b.spd ?? 0),
    luck: luck + (b.luck ?? 0),
  };
}

export function getDerivedCombatStats(
  level: number,
  equipped: Partial<Record<EquipSlot, string>>,
  origin?: OriginStatBonus,
  attrs: CharacterAttributes = ZERO_ATTRIBUTES
): CombatDerived {
  const a = attrs;
  const L = Math.max(1, Math.floor(level));
  let atk =
    BASE_ATK +
    Math.floor(L * ATK_LEVEL_MULT) +
    a.str * ATK_PER_STR;
  let def =
    BASE_DEF +
    Math.floor(L * DEF_LEVEL_MULT) +
    a.tgh * DEF_PER_TGH;
  let hpBonus = BASE_MAX_HP + a.vit * HP_PER_VIT;
  let staBonus = BASE_MAX_STA + a.end * STA_PER_END;
  let spd =
    BASE_SPD +
    Math.floor(L * SPD_LEVEL_MULT) +
    a.mob * SPD_PER_MOB;
  let luck = BASE_LUCK + Math.floor(L * 0.4);

  for (const slot of Object.keys(equipped) as EquipSlot[]) {
    const id = equipped[slot];
    if (!id) continue;
    const b = getEquipBonuses(id);
    if (!b) continue;
    if (b.atk) atk += b.atk;
    if (b.def) def += b.def;
    if (b.hp) hpBonus += b.hp;
    if (b.sta) staBonus += b.sta;
    if (b.spd) spd += b.spd;
    if (b.luck) luck += b.luck;
  }

  ({
    atk,
    def,
    hpBonus,
    staBonus,
    spd,
    luck,
  } = applyFlatGearLikeBonus(atk, def, hpBonus, staBonus, spd, luck, origin));

  return {
    maxHp: Math.max(8, Math.floor(hpBonus)),
    maxSta: Math.max(8, Math.floor(staBonus)),
    atk: Math.max(1, Math.floor(atk)),
    def: Math.max(0, Math.floor(def)),
    spd: Math.max(1, Math.floor(spd)),
    luck: Math.max(1, Math.floor(luck)),
  };
}

export type ActiveBuff = { id: string; remainingSec: number };

/** Перемножает положительные множители бафов по полю (пустые поля = 1). */
export function buffNumericProduct(
  buffs: ActiveBuff[] | undefined,
  key: BuffNumericMultKey
): number {
  if (!buffs?.length) return 1;
  let m = 1;
  for (const b of buffs) {
    if (b.remainingSec <= 0) continue;
    const def = BUFFS[b.id];
    if (!def) continue;
    const v = def[key];
    if (typeof v === "number" && v > 0) m *= v;
  }
  return m;
}

/** Множитель скорости бега: базис от SPD и баффы с `moveSpdMult` в данных. */
export function getMoveSpeedMultiplier(
  level: number,
  equipped: Partial<Record<EquipSlot, string>>,
  buffs: ActiveBuff[] | undefined,
  origin?: OriginStatBonus,
  attrs: CharacterAttributes = ZERO_ATTRIBUTES
): number {
  const d = getDerivedCombatStats(level, equipped, origin, attrs);
  let m = Math.min(1.28, Math.max(0.78, d.spd / BASE_SPD));
  m *= buffNumericProduct(buffs, "moveSpdMult");
  return m;
}
