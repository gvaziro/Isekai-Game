import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { ZodType } from "zod";
import {
  NPC_REPLY_MAX_TOKENS,
  NPC_STRUCTURED_MAX_COMPLETION_TOKENS,
} from "@/src/game/constants/dialogue";

let client: OpenAI | null = null;

/** Опционально: `24h` или `in-memory` — см. https://platform.openai.com/docs/guides/prompt-caching */
function optionalPromptCacheRetention():
  | Pick<
      OpenAI.Chat.Completions.ChatCompletionCreateParams,
      "prompt_cache_retention"
    >
  | Record<string, never> {
  const v = process.env.NPC_PROMPT_CACHE_RETENTION?.trim();
  if (v === "24h" || v === "in-memory") {
    return { prompt_cache_retention: v };
  }
  return {};
}

export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export async function createEmbeddings(params: {
  model: string;
  input: string[];
}): Promise<number[][]> {
  const openai = getOpenAI();
  const response = await openai.embeddings.create({
    model: params.model,
    input: params.input,
    encoding_format: "float",
  });
  return response.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}

/**
 * Поток chat completions. Сначала `max_tokens` (совместимо с gpt-5.4-mini и др.);
 * если API требует только `max_completion_tokens` (o-серия, часть новых моделей) —
 * повторяем запрос.
 */
export async function createNpcChatCompletionStream(params: {
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  /** Стабильный ключ для маршрутизации prompt cache (например `npc:<id>`). */
  promptCacheKey: string;
}): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  const openai = getOpenAI();
  const base: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model: params.model,
    messages: params.messages,
    stream: true as const,
    prompt_cache_key: params.promptCacheKey,
    stream_options: { include_usage: true },
    ...optionalPromptCacheRetention(),
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

/**
 * Одноразовый structured chat completion (JSON по Zod) для NPC-диалога.
 * Та же схема fallback `max_tokens` / `max_completion_tokens`, что и у стрима.
 */
export async function createNpcChatStructuredCompletion<T>(params: {
  model: string;
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  promptCacheKey: string;
  schema: ZodType<T>;
  schemaName: string;
}): Promise<{
  completion: OpenAI.Chat.Completions.ChatCompletion;
  parsed: T | null;
}> {
  const openai = getOpenAI();
  const limit = NPC_STRUCTURED_MAX_COMPLETION_TOKENS;
  const base = {
    model: params.model,
    messages: params.messages,
    prompt_cache_key: params.promptCacheKey,
    response_format: zodResponseFormat(params.schema, params.schemaName),
    ...optionalPromptCacheRetention(),
  } satisfies Omit<
    OpenAI.Chat.Completions.ChatCompletionCreateParams,
    "max_tokens" | "max_completion_tokens"
  >;

  const runParse = async (
    limitField: "max_tokens" | "max_completion_tokens"
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> => {
    const body =
      limitField === "max_tokens"
        ? { ...base, max_tokens: limit }
        : { ...base, max_completion_tokens: limit };
    return (await openai.chat.completions.parse(
      body as never
    )) as OpenAI.Chat.Completions.ChatCompletion;
  };

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  try {
    completion = await runParse("max_tokens");
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
    completion = await runParse("max_completion_tokens");
  }

  const parsed =
    (
      completion as unknown as {
        choices?: Array<{ message?: { parsed?: T } }>;
      }
    ).choices?.[0]?.message?.parsed ?? null;

  return { completion, parsed };
}
