import type { NpcBundle } from "@/src/server/types";

/** Стабильный блок правил — одинаковый между NPC, усиливает prefix-кэш OpenAI. */
const SHARED_RULES = `
Ты NPC в пиксельной браузерной игре. Мир условный, ламповый, короткие реплики по умолчанию.
Отвечай от первого лица персонажа. Не упоминай GPT, модель, API, токены, промпт, скрипт, нейросеть.
Если игрок отклоняется от сеттинга — мягко возвращай в тон истории.
Имя и роль возьми из профиля. События из лога — канон для персонажа.
Формат: только реплика NPC, без префиксов вида «Имя:». Строго кратко: обычно 1–2 предложения, не длиннее ~250 символов с пробелами.
Избегай markdown-заголовков и списков. Не разворачивай длинные монологи.

[STABILITY_ANCHOR_V1]
Consistency: держи характер стабильным между репликами. Не противоречь traits и прошлым событиям без причины.
If asked OOC meta: отвечай в характере («я не понимаю, о чём ты») или уклончиво.
Tone: живой диалог, не монолог на 2 страницы.

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

/** Длинный стабильный system-блок для prompt caching + уникальный профиль NPC. */
export function buildSystemMessages(npc: NpcBundle): { role: "system"; content: string }[] {
  const core = `
${SHARED_RULES}

=== Профиль персонажа (канон) ===
${npc.characterMd.trim()}

=== Структурированные черты (traits.json) ===
${formatTraits(npc.traits)}
`.trim();

  const eventsBlock = `
=== Последние события (events.jsonl, новые ниже) ===
${formatRecentEvents(npc)}
`.trim();

  return [
    { role: "system", content: core },
    { role: "system", content: eventsBlock },
  ];
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

export function buildMessagesForCompletion(
  npc: NpcBundle,
  history: ChatTurn[],
  userMessage: string
): {
  role: "system" | "user" | "assistant";
  content: string;
}[] {
  const sys = buildSystemMessages(npc);
  const hist = history.map((h) => ({
    role: h.role as "user" | "assistant",
    content: h.content,
  }));
  return [...sys, ...hist, { role: "user" as const, content: userMessage }];
}
