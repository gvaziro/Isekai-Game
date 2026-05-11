/**
 * Тексты читаемых предметов (записки, страницы). Канон текста — `world/books/*.md` с тем же id.
 */

export type ReadableBookDef = {
  /** Совпадает с `id` во frontmatter книги в базе знаний */
  bookId: string;
  title: string;
  body: string;
};

const BOOK_ITEM629: ReadableBookDef = {
  bookId: "book_forest_hub_spawn_note",
  title: "Записка у тропы",
  body:
    "Кто-то прижал листок камнем к корню — чернила размазались от влаги, но строки ещё читаются.\n\n" +
    "Если ты только вышел из деревни: не гонись за добычей. Здесь тропа ещё лжётся под ногами спокойно, а чуть в сторону — уже чужая густота. Старые говорили: пока видишь свой след на грязи главной дороги, ты можешь развернуться.\n\n" +
    "Дальше на север тропа не кончается, но кончается терпение леса. Не оставляй запас сил на ноль — и не верь тишине после заката.",
};

const BY_CURATED_ID: Readonly<Record<string, ReadableBookDef>> = {
  item629: BOOK_ITEM629,
};

export function getReadableBookForItem(
  curatedId: string
): ReadableBookDef | undefined {
  const id = curatedId.trim();
  return BY_CURATED_ID[id];
}
