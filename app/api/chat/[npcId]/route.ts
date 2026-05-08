import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadNpcCached } from "@/src/server/cache";
import { appendNpcEvent, assertSafeNpcId } from "@/src/server/npc-loader";
import { buildMessagesForCompletion } from "@/src/server/prompt-builder";
import { createNpcChatStructuredCompletion } from "@/src/server/openai";
import { getClientIp, rateLimit } from "@/src/server/rate-limit";
import {
  type NpcChatStructured,
  NpcChatStructuredSchema,
  normalizeNpcChatStructured,
} from "@/src/game/data/npcChatStructured";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  message: z.string().min(1).max(6000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(12000),
      })
    )
    .max(24),
  worldSnapshot: z.string().max(4500).optional(),
});

function buildSummary(user: string, assistant: string): string {
  const u = user.replace(/\s+/g, " ").trim().slice(0, 280);
  const a = assistant.replace(/\s+/g, " ").trim().slice(0, 420);
  return `Игрок: ${u} | NPC: ${a}`;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ npcId: string }> }
) {
  const ip = getClientIp(req.headers);
  if (!rateLimit(ip)) {
    return NextResponse.json(
      { error: "Слишком много запросов. Подождите немного." },
      { status: 429 }
    );
  }

  const { npcId: rawId } = await ctx.params;
  try {
    assertSafeNpcId(rawId);
  } catch {
    return NextResponse.json({ error: "Некорректный npcId" }, { status: 400 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Некорректное тело запроса" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "Сервер: не задан OPENAI_API_KEY" },
      { status: 500 }
    );
  }

  let npc;
  try {
    npc = await loadNpcCached(rawId);
  } catch {
    return NextResponse.json({ error: "NPC не найден" }, { status: 404 });
  }

  const messages = buildMessagesForCompletion(
    npc,
    body.history,
    body.message,
    body.worldSnapshot
  );
  const model = process.env.NPC_MODEL ?? "gpt-5.4-mini";

  let completion: OpenAI.Chat.Completions.ChatCompletion;
  let parsedRaw: NpcChatStructured | null;
  try {
    const r = await createNpcChatStructuredCompletion({
      model,
      messages,
      promptCacheKey: `npc:${rawId}`,
      schema: NpcChatStructuredSchema,
      schemaName: "npc_dialogue_turn",
    });
    completion = r.completion;
    parsedRaw = r.parsed;
  } catch (e) {
    console.error("[api/chat]", e);
    if (e instanceof OpenAI.AuthenticationError) {
      return NextResponse.json(
        { error: "OpenAI: проверьте OPENAI_API_KEY (неверный или отозванный ключ)." },
        { status: 401 }
      );
    }
    if (e instanceof OpenAI.RateLimitError) {
      return NextResponse.json(
        { error: "OpenAI: лимит запросов, попробуйте позже." },
        { status: 429 }
      );
    }
    if (e instanceof OpenAI.APIError) {
      const hint = e.message?.trim() || "ошибка API";
      return NextResponse.json(
        { error: `OpenAI (${e.status ?? "?"}): ${hint}`.slice(0, 900) },
        {
          status:
            typeof e.status === "number" &&
            e.status >= 400 &&
            e.status < 600
              ? e.status
              : 502,
        }
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `Upstream: ${msg}`.slice(0, 900) },
      { status: 502 }
    );
  }

  if (process.env.NPC_LOG_PROMPT_CACHE === "1" && completion.usage) {
    const cached =
      completion.usage.prompt_tokens_details?.cached_tokens ?? 0;
    console.log("[api/chat] prompt_cache", {
      npcId: rawId,
      prompt_tokens: completion.usage.prompt_tokens,
      cached_tokens: cached,
    });
  }

  const choice0 = completion.choices?.[0];
  let parsed: NpcChatStructured | null = parsedRaw;
  if (!parsed) {
    const sp = NpcChatStructuredSchema.safeParse(
      (choice0?.message as { parsed?: unknown } | undefined)?.parsed
    );
    parsed = sp.success ? sp.data : null;
  }
  if (!parsed) {
    return NextResponse.json(
      {
        error:
          "Модель не вернула разобранный JSON. Попробуйте ещё раз или смените фразу.",
      },
      { status: 502 }
    );
  }

  const out = normalizeNpcChatStructured(parsed);

  try {
    await appendNpcEvent(rawId, {
      ts: new Date().toISOString(),
      type: "dialogue",
      summary: buildSummary(body.message, out.reply),
    });
  } catch (e) {
    console.warn("[api/chat] appendNpcEvent", e);
  }

  return NextResponse.json(out, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
