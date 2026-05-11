import {
  formatNpcKnowledgeForPrompt,
  selectNpcKnowledge,
  selectNpcKnowledgeHybrid,
} from "@/src/server/npc-knowledge";
import type { NpcBundle } from "@/src/server/types";

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
    const { knowledge: _knowledge, ...promptTraits } = traits;
    return JSON.stringify(promptTraits, null, 2);
  } catch {
    return "{}";
  }
}

function formatRecentEvents(npc: NpcBundle, limit = 24): string {
  const lastLoreUpdateIndex = npc.events.findLastIndex((event) => event.type === "lore_update");
  const relevantEvents =
    lastLoreUpdateIndex >= 0 ? npc.events.slice(lastLoreUpdateIndex) : npc.events;
  const slice = relevantEvents.slice(-limit);
  if (slice.length === 0) return "(пока нет записанных событий)";
  return slice
    .map((e) => `- [${e.ts}] (${e.type}) ${e.summary}`)
    .join("\n");
}

/**
 * System-сообщения: сначала общий неизменный префикс (лучше prompt cache), затем профиль,
 * в конце — меняющийся лог событий.
 */
export function buildSystemMessages(
  npc: NpcBundle,
  knowledgeBlock?: string
): { role: "system"; content: string }[] {
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
    { role: "system", content: profile },
  ];
  if (knowledgeBlock?.trim()) {
    out.push({
      role: "system",
      content: knowledgeBlock.trim(),
    });
  }
  out.push(
    { role: "system", content: eventsBlock }
  );
  return out;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

const MAX_PROMPT_HISTORY_TURNS = 8;

function wrapLatestPlayerMessageForModel(raw: string): string {
  const t = raw.trim();
  return `--- Последняя реплика игрока ---\n${t}\n--- Конец реплики ---\nОтветь на неё естественно, в характере; не игнорируй вопрос и не уходи в сторону без причины.`;
}

function buildRuntimeSnapshotBlocks(
  worldSnapshot?: string | null,
  shopSnapshot?: string | null
): { role: "system"; content: string }[] {
  const blocks: { role: "system"; content: string }[] = [];
  const world = worldSnapshot?.trim();
  if (world) {
    blocks.push({
      role: "system",
      content: world,
    });
  }
  const shop = shopSnapshot?.trim();
  if (shop) {
    blocks.push({
      role: "system",
      content: `=== Лавка NPC сейчас (клиент игры) ===\n${shop}`,
    });
  }
  return blocks;
}

export function buildMessagesForCompletion(
  npc: NpcBundle,
  history: ChatTurn[],
  userMessage: string,
  worldSnapshot?: string | null,
  shopSnapshot?: string | null
): {
  role: "system" | "user" | "assistant";
  content: string;
}[] {
  const knowledgeQuery = [...history.slice(-6).map((h) => h.content), userMessage].join("\n");
  const knowledgeEntries = selectNpcKnowledge(npc, knowledgeQuery);
  const knowledgeBlock = formatNpcKnowledgeForPrompt(knowledgeEntries, npc);
  const sys = buildSystemMessages(npc, knowledgeBlock);
  const snap = buildRuntimeSnapshotBlocks(worldSnapshot, shopSnapshot)
    .map((block) => block.content)
    .join("\n\n");
  const snapBlock = snap
    ? ([
        {
          role: "system" as const,
          content: `=== Состояние мира сейчас (клиент игры) ===\n${snap}`,
        },
      ] satisfies { role: "system"; content: string }[])
    : [];
  const hist = history.slice(-MAX_PROMPT_HISTORY_TURNS).map((h) => ({
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

export async function buildMessagesForCompletionAsync(
  npc: NpcBundle,
  history: ChatTurn[],
  userMessage: string,
  worldSnapshot?: string | null,
  shopSnapshot?: string | null
): Promise<{
  role: "system" | "user" | "assistant";
  content: string;
}[]> {
  const knowledgeQuery = [...history.slice(-6).map((h) => h.content), userMessage].join("\n");
  const knowledgeEntries = await selectNpcKnowledgeHybrid(npc, knowledgeQuery);
  const knowledgeBlock = formatNpcKnowledgeForPrompt(knowledgeEntries, npc);
  const sys = buildSystemMessages(npc, knowledgeBlock);
  const snap = buildRuntimeSnapshotBlocks(worldSnapshot, shopSnapshot)
    .map((block) => block.content)
    .join("\n\n");
  const snapBlock = snap
    ? ([
        {
          role: "system" as const,
          content: `=== Состояние мира сейчас (клиент игры) ===\n${snap}`,
        },
      ] satisfies { role: "system"; content: string }[])
    : [];
  const hist = history.slice(-MAX_PROMPT_HISTORY_TURNS).map((h) => ({
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
