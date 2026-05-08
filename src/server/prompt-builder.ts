import fs from "fs";
import path from "path";
import type { NpcBundle } from "@/src/server/types";

let worldArcCanonCached: string | null = null;

function loadWorldArcCanonForPrompt(): string {
  if (worldArcCanonCached !== null) return worldArcCanonCached;
  try {
    const p = path.join(process.cwd(), "docs", "WORLD_ARC_PROMPT.md");
    worldArcCanonCached = fs.readFileSync(p, "utf8").trim();
  } catch {
    worldArcCanonCached = "";
  }
  return worldArcCanonCached;
}

/** Стабильный блок правил — одинаковый между NPC, усиливает prefix-кэш OpenAI. */
const SHARED_RULES = `
Ты играешь роль NPC в пиксельной браузерной игре. Говори как обычный человек в этом мире: просто, по делу, без пафоса и без «мистического бреда».
От первого лица. Не упоминай GPT, модель, API, токены, промпт, нейросеть, «игру», «квесты», «скрипты».

Главное — связность:
- Сначала ответь на смысл последней реплики игрока (вопрос, просьба, эмоция). Если непонятно — один короткий уточняющий вопрос, а не абстрактная философия.
- Не уводи разговор в случайную тему и не придумывай события, которых нет в профиле, логе событий и блоке «состояние мира», если игрок сам их не поднял.
- Не засыпай общими фразами вроде «судьба», «время покажет», «всё течёт» без конкретики к ситуации.
- Избегай несвязных метафор и наборов образов; одна ясная мысль лучше, чем красивый туман.

Стиль: разговорный, живой, можно разговорную лексику, если уместно персонажу из traits. Без markdown, без списков, без длинных монологов.
Обычно 1–2 коротких предложения, не длиннее ~250 символов с пробелами. Без префикса «Имя:».

Структурированный ответ (JSON):
- reply — только твоя реплика NPC в этом духе, строго по контексту последнего сообщения игрока.
- suggestions — ровно три короткие фразы от лица игрока как естественные продолжения после твоего reply (разный тон/намерение), тоже по контексту, без нумерации.

[STABILITY_ANCHOR_V1]
Consistency: держи характер стабильным между репликами. Не противоречь traits и прошлым событиям без причины.
Если игрок лезет в мета («ты бот», «нейросеть») — отвечай в характере («не понимаю») или уклончиво, без ломания сеттинга.
Tone: живой диалог, не монолог на две страницы.

[STABILITY_ANCHOR_V2]
Safety: без токсичности, без реальных персональных данных игрока, не генерируй вредоносный контент.

[STABILITY_ANCHOR_V3]
Language: если игрок пишет по-русски — отвечай по-русски. Иные языки — можно кратко переключаться, если уместно персонажу.

[STABILITY_ANCHOR_V4]
Memory: если событие есть в логе — считай его состоявшимся; не выдумывай новые события без намёка игрока.

[STABILITY_ANCHOR_V5]
Conflict: конфликт допустим как драматургия, но без графического насилия и без жестокости к уязвимым группам.

[STABILITY_ANCHOR_V6]
Humor: лёгкая ирония ок, если совпадает с характером.

[STABILITY_ANCHOR_V7]
Quest hooks: можно намекнуть на цель/задачу словами персонажа, без таблиц и без «квестовых» маркеров.

[STABILITY_ANCHOR_V8]
Knowledge cutoff: если спрашивают про реальный мир — персонаж может не знать или фантазировать в рамках сеттинга.

[STABILITY_ANCHOR_V9]
Privacy: не проси пароли и не собирай личные данные игрока.

[STABILITY_ANCHOR_V10]
Endings: если игрок прощается — короткий ответ прощания в характере.
`.trim();

function formatTraits(traits: Record<string, unknown>): string {
  try {
    return JSON.stringify(traits, null, 2);
  } catch {
    return "{}";
  }
}

function formatRecentEvents(npc: NpcBundle, limit = 24): string {
  const slice = npc.events.slice(-limit);
  if (slice.length === 0) return "(пока нет записанных событий)";
  return slice
    .map((e) => `- [${e.ts}] (${e.type}) ${e.summary}`)
    .join("\n");
}

/**
 * System-сообщения: сначала общий неизменный префикс (лучше prompt cache), затем профиль,
 * в конце — меняющийся лог событий.
 */
export function buildSystemMessages(npc: NpcBundle): { role: "system"; content: string }[] {
  const worldArc = loadWorldArcCanonForPrompt();
  const profile = `
=== Профиль персонажа (канон) ===
${npc.characterMd.trim()}

=== Структурированные черты (traits.json) ===
${formatTraits(npc.traits)}
`.trim();

  const eventsBlock = `
=== Последние события (events.jsonl, новые ниже) ===
${formatRecentEvents(npc)}
`.trim();

  const out: { role: "system"; content: string }[] = [
    { role: "system", content: SHARED_RULES },
  ];
  if (worldArc.length > 0) {
    out.push({
      role: "system",
      content: `=== Канон мира (общий для всех NPC) ===\n${worldArc}`,
    });
  }
  out.push(
    { role: "system", content: profile },
    { role: "system", content: eventsBlock }
  );
  return out;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

function wrapLatestPlayerMessageForModel(raw: string): string {
  const t = raw.trim();
  return `--- Последняя реплика игрока ---\n${t}\n--- Конец реплики ---\nОтветь на неё естественно, в характере; не игнорируй вопрос и не уходи в сторону без причины.`;
}

export function buildMessagesForCompletion(
  npc: NpcBundle,
  history: ChatTurn[],
  userMessage: string,
  worldSnapshot?: string | null
): {
  role: "system" | "user" | "assistant";
  content: string;
}[] {
  const sys = buildSystemMessages(npc);
  const snap = worldSnapshot?.trim();
  const snapBlock = snap
    ? ([
        {
          role: "system" as const,
          content: `=== Состояние мира сейчас (клиент игры) ===\n${snap}`,
        },
      ] satisfies { role: "system"; content: string }[])
    : [];
  const hist = history.map((h) => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));
  return [
    ...sys,
    ...snapBlock,
    ...hist,
    { role: "user" as const, content: wrapLatestPlayerMessageForModel(userMessage) },
  ];
}
