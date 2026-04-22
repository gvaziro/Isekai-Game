import OpenAI from "openai";
import { NPC_REPLY_MAX_TOKENS } from "@/src/game/constants/dialogue";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

/**
 * Поток chat completions. Сначала `max_tokens` (совместимо с gpt-4o-mini и др.);
 * если API требует только `max_completion_tokens` (o-серия, часть новых моделей) —
 * повторяем запрос.
 */
export async function createNpcChatCompletionStream(params: {
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
}): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const openai = getOpenAI();
  const base = {
    model: params.model,
    messages: params.messages,
    stream: true as const,
  };
  const limit = NPC_REPLY_MAX_TOKENS;
  try {
    const stream = await openai.chat.completions.create({
      ...base,
      max_tokens: limit,
    });
    return stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  } catch (first: unknown) {
    const msg = first instanceof Error ? first.message : String(first);
    const lower = msg.toLowerCase();
    const needAltLimit =
      lower.includes("max_completion_tokens") ||
      (lower.includes("unsupported parameter") &&
        (lower.includes("max_tokens") || lower.includes("'max_tokens'"))) ||
      lower.includes("not supported with this model") ||
      /use\s+['\"]max_completion_tokens['\"]/i.test(msg);
    if (!needAltLimit) {
      throw first;
    }
    const stream = await openai.chat.completions.create({
      ...base,
      max_completion_tokens: limit,
    });
    return stream as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  }
}
