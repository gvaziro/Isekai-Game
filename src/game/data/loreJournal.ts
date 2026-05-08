/**
 * Каталог фактов дневника знаний: тексты каноничны, открытие — только по известным id.
 */

export const LORE_FACT_CATEGORIES = [
  "world",
  "places",
  "people",
  "misc",
] as const;

export type LoreFactCategoryId = (typeof LORE_FACT_CATEGORIES)[number];

export const LORE_CATEGORY_LABEL_RU: Record<LoreFactCategoryId, string> = {
  world: "Мир",
  places: "Места",
  people: "Люди",
  misc: "Разное",
};

export type LoreFactDef = {
  id: string;
  category: LoreFactCategoryId;
  title: string;
  /** Основной текст записи в дневнике */
  body: string;
};

/** Стартовый набор фактов (можно расширять по мере контента). */
export const LORE_FACTS: readonly LoreFactDef[] = [
  {
    id: "world.forest_and_fog",
    category: "world",
    title: "Лес и туман",
    body:
      "Деревня окружена бескрайним лесом с одной стороны и магическим туманом на дороге наружу — с другой. Пока туман стоит, покинуть регион по дороге нельзя; в лес можно ходить за ресурсами и возвращаться.",
  },
  {
    id: "world.catacombs_guardian",
    category: "world",
    title: "Хранитель катакомб",
    body:
      "Туман на дороге наслал хранитель последнего этажа катакомб под деревней. После победы над ним на финальном этаже туман рассеивается и открывается путь за пределы деревни.",
  },
  {
    id: "world.isekai_origin",
    category: "world",
    title: "Перерождение",
    body:
      "Герой был человеком из другого мира и переродился здесь. В начале пути можно пройти короткий тест прошлой жизни — от ответов зависят стартовые качества и склонности.",
  },
  {
    id: "places.village",
    category: "places",
    title: "Деревня",
    body:
      "Убежище между лесом и заколдованной дорогой. Отсюда уходят тропы в лес и вход в катакомбы под землёй.",
  },
  {
    id: "places.catacombs",
    category: "places",
    title: "Катакомбы",
    body:
      "Подземелье под деревней: этаж за этажом опасности растут. На последнем этаже ждёт хранитель — ключ к снятию тумана.",
  },
  {
    id: "misc.journal",
    category: "misc",
    title: "Дневник знаний",
    body:
      "Сюда заносятся факты, которые герой узнаёт из разговоров, книг и страниц мира. Новые записи появляются сами, когда ты что-то понимаешь или слышишь.",
  },
] as const;

export const LORE_FACTS_BY_ID: Readonly<Record<string, LoreFactDef>> =
  Object.fromEntries(LORE_FACTS.map((f) => [f.id, f]));

export function isKnownLoreFactId(id: string): boolean {
  return id in LORE_FACTS_BY_ID;
}
