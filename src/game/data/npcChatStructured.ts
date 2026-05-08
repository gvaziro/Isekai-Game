import { z } from "zod";
import { NPC_REPLY_MAX_CHARS } from "@/src/game/constants/dialogue";
import { clipNpcReply } from "@/src/game/ui/npcReplyClip";

/** Макс. длина одной подсказки ответа игрока (символы). */
const PLAYER_SUGGESTION_MAX_CHARS = 160;

const FALLBACK_SUGGESTIONS: readonly [string, string, string] = [
  "Понятно.",
  "Расскажи подробнее.",
  "Мне пора.",
];

/**
 * Структурированный ответ NPC для `/api/chat/:npcId`.
 * `reply` — реплика NPC; `suggestions` — три варианта следующей реплики игрока.
 */
export const NpcChatStructuredSchema = z.object({
  reply: z
    .string()
    .min(1)
    .max(NPC_REPLY_MAX_CHARS + 120)
    .describe(
      "Реплика NPC по-русски: 1–2 коротких предложения, прямой ответ на последнее сообщение игрока, разговорный тон, без абстрактного бреда и без отрыва от темы."
    ),
  suggestions: z
    .array(
      z
        .string()
        .min(1)
        .max(PLAYER_SUGGESTION_MAX_CHARS)
        .describe(
          "Короткая фраза от лица игрока — естественное продолжение после reply, по тому же контексту."
        )
    )
    .length(3)
    .describe(
      "Ровно три разных варианта следующей реплики игрока (разный тон или намерение), все связаны с диалогом."
    ),
});

export type NpcChatStructured = z.infer<typeof NpcChatStructuredSchema>;

/** Ответ `/api/chat/:npcId` после нормализации на сервере (для safeParse на клиенте). */
export const NpcChatClientResponseSchema = z.object({
  reply: z.string().min(1),
  suggestions: z.array(z.string().min(1)).length(3),
});

function normalizeOneSuggestion(s: string): string {
  return s.replace(/\s+/g, " ").trim().slice(0, PLAYER_SUGGESTION_MAX_CHARS);
}

/**
 * Обрезка реплики NPC, очистка и дедупликация подсказок, добивка до трёх строк.
 */
export function normalizeNpcChatStructured(data: NpcChatStructured): NpcChatStructured {
  const reply = clipNpcReply(data.reply.trim());

  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of data.suggestions) {
    const t = normalizeOneSuggestion(raw);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length === 3) break;
  }

  while (out.length < 3) {
    const base =
      FALLBACK_SUGGESTIONS[out.length % FALLBACK_SUGGESTIONS.length];
    let candidate = base;
    let n = 0;
    while (seen.has(candidate.toLowerCase())) {
      n += 1;
      candidate = `${base} (${n})`;
    }
    seen.add(candidate.toLowerCase());
    out.push(candidate.slice(0, PLAYER_SUGGESTION_MAX_CHARS));
  }

  return {
    reply,
    suggestions: out.slice(0, 3),
  };
}
