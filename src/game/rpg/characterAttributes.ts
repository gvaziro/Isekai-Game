/** Распределяемые базовые характеристики героя (очки при левелапе). */
export type CharacterAttributes = {
  str: number;
  agi: number;
  /** Живучесть — запас HP. */
  vit: number;
  /** Стойкость — защита (DEF). */
  tgh: number;
  /** Выносливость — запас стамины. */
  end: number;
  mob: number;
};

export const ZERO_ATTRIBUTES: CharacterAttributes = {
  str: 0,
  agi: 0,
  vit: 0,
  tgh: 0,
  end: 0,
  mob: 0,
};

export type AttrKey = keyof CharacterAttributes;

export function sanitizeCharacterAttributes(
  raw: unknown
): CharacterAttributes {
  if (!raw || typeof raw !== "object") return { ...ZERO_ATTRIBUTES };
  const o = raw as Record<string, unknown>;
  const n = (k: string) => {
    const v = o[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return 0;
    return Math.max(0, Math.floor(v));
  };
  return {
    str: n("str"),
    agi: n("agi"),
    vit: n("vit"),
    tgh: n("tgh"),
    end: n("end"),
    mob: n("mob"),
  };
}
