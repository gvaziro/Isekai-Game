/**
 * Пролог исекая: выбор прошлого на Земле и обстоятельств перехода.
 * Бонусы плоские, как у экипировки — суммируются в getDerivedCombatStats.
 */

export type OriginStatBonus = {
  atk?: number;
  def?: number;
  hp?: number;
  sta?: number;
  spd?: number;
  luck?: number;
};

/** Сохранённое происхождение (в persist). */
export type IsekaiOriginPersisted =
  | { completed: false }
  | {
      completed: true;
      professionId: string;
      circumstanceId: string;
      bonus: OriginStatBonus;
    };

export type IsekaiOriginChoice = {
  id: string;
  title: string;
  /** Короткий лор для кнопки / карточки */
  blurb: string;
  bonus: OriginStatBonus;
};

/** Текст «системы» перед выбором. */
export const ISEKAI_SYSTEM_INTRO = [
  "【Система】 Связь установлена.",
  "Ты очнулся не там, где засыпал: этот мир подчиняется другим правилам.",
  "Прежде чем выдать статус, мне нужно зафиксировать твоё прошлое — оно слабо отпечаталось на новом теле.",
  "Ответь честно: кем ты был до перехода и как сюда попал?",
].join("\n\n");

export const ISEKAI_PROFESSIONS: IsekaiOriginChoice[] = [
  {
    id: "laborer",
    title: "Разнорабочий",
    blurb: "Тяжёлая работа, крепкие руки, мало сна.",
    bonus: { hp: 6, sta: 4 },
  },
  {
    id: "clerk",
    title: "Офисный работник",
    blurb: "Дедлайны, кофе и острый глаз за мелочами.",
    bonus: { def: 2, luck: 2 },
  },
  {
    id: "athlete",
    title: "Спортсмен",
    blurb: "Дыхание, шаг, ритм — тело помнит дистанцию.",
    bonus: { spd: 4, sta: 3 },
  },
  {
    id: "medic",
    title: "Медик / фельдшер",
    blurb: "Долгие смены и холодная голова при панике.",
    bonus: { sta: 4, def: 2 },
  },
  {
    id: "streetfighter",
    title: "Уличный боец",
    blurb: "Рефлексы и удар — не из учебника.",
    bonus: { atk: 3, spd: 2 },
  },
  {
    id: "student",
    title: "Студент",
    blurb: "Ночи за конспектами и странная удача на зачётах.",
    bonus: { luck: 3, sta: 2 },
  },
];

export const ISEKAI_CIRCUMSTANCES: IsekaiOriginChoice[] = [
  {
    id: "deep_sleep",
    title: "Уснул и проснулся здесь",
    blurb: "Сон стёр границу между мирами.",
    bonus: { sta: 3, luck: 1 },
  },
  {
    id: "ritual",
    title: "Ритуал / заклинание",
    blurb: "Ты сам открыл дверь — пусть и нечаянно.",
    bonus: { luck: 3, def: 1 },
  },
  {
    id: "classic_transport",
    title: "«Нестандартный транспорт»",
    blurb: "Клише, но тело до сих пор помнит удар.",
    bonus: { hp: 4, def: 2 },
  },
  {
    id: "library_gate",
    title: "Книга / портал",
    blurb: "Буквы стали светом и потянули за собой.",
    bonus: { luck: 2, atk: 1 },
  },
];

export function mergeOriginBonuses(
  a: OriginStatBonus,
  b: OriginStatBonus
): OriginStatBonus {
  return {
    atk: (a.atk ?? 0) + (b.atk ?? 0),
    def: (a.def ?? 0) + (b.def ?? 0),
    hp: (a.hp ?? 0) + (b.hp ?? 0),
    sta: (a.sta ?? 0) + (b.sta ?? 0),
    spd: (a.spd ?? 0) + (b.spd ?? 0),
    luck: (a.luck ?? 0) + (b.luck ?? 0),
  };
}

function stripZeroes(b: OriginStatBonus): OriginStatBonus {
  const out: OriginStatBonus = {};
  if (b.atk) out.atk = b.atk;
  if (b.def) out.def = b.def;
  if (b.hp) out.hp = b.hp;
  if (b.sta) out.sta = b.sta;
  if (b.spd) out.spd = b.spd;
  if (b.luck) out.luck = b.luck;
  return out;
}

export function computeIsekaiOriginBonus(
  professionId: string,
  circumstanceId: string
): OriginStatBonus {
  const p = ISEKAI_PROFESSIONS.find((x) => x.id === professionId);
  const c = ISEKAI_CIRCUMSTANCES.find((x) => x.id === circumstanceId);
  const prof = p?.bonus ?? {};
  const circ = c?.bonus ?? {};
  return stripZeroes(mergeOriginBonuses(prof, circ));
}

export function getProfessionById(id: string): IsekaiOriginChoice | undefined {
  return ISEKAI_PROFESSIONS.find((x) => x.id === id);
}

export function getCircumstanceById(id: string): IsekaiOriginChoice | undefined {
  return ISEKAI_CIRCUMSTANCES.find((x) => x.id === id);
}
