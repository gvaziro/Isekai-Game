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
    "Листок прибит к старому колышку у тропы. Почерк неровный, будто писали на колене.\n\n" +
    "Если идёшь из деревни на север, держись тропы и не строй из себя охотника. У кромки ещё можно собрать грибы, травы и пару сухих веток. Дальше начинается лес, где тебя никто искать не пойдёт без причины.\n\n" +
    "До темноты вернись. Если устал, голоден или ранен — разворачивайся сразу. Добыча не стоит того, чтобы Маркус потом считал твои следы вместо тебя.",
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
