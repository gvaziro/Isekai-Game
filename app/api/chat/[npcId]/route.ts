import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadNpcCached } from "@/src/server/cache";
import { appendNpcEvent, assertSafeNpcId } from "@/src/server/npc-loader";
import { buildMessagesForCompletion } from "@/src/server/prompt-builder";
import { createNpcChatCompletionStream } from "@/src/server/openai";
import { getClientIp, rateLimit } from "@/src/server/rate-limit";
import { encodeSseMessage } from "@/src/server/stream-protocol";
import { extractChatCompletionDeltaText } from "@/src/server/openai-stream-delta";
import { NPC_REPLY_MAX_CHARS } from "@/src/game/constants/dialogue";

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
    return new NextResponse("Too Many Requests", { status: 429 });
  }

  const { npcId: rawId } = await ctx.params;
  try {
    assertSafeNpcId(rawId);
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return new NextResponse("Invalid body", { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return new NextResponse("OPENAI_API_KEY missing", { status: 500 });
  }

  let npc;
  try {
    npc = await loadNpcCached(rawId);
  } catch {
    return new NextResponse("NPC not found", { status: 404 });
  }

  const messages = buildMessagesForCompletion(npc, body.history, body.message);
  const model = process.env.NPC_MODEL ?? "gpt-4o-mini";

  let completionStream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    completionStream = await createNpcChatCompletionStream({
      model,
      messages,
    });
  } catch (e) {
    console.error("[api/chat]", e);
    if (e instanceof OpenAI.AuthenticationError) {
      return new NextResponse(
        "OpenAI: проверьте OPENAI_API_KEY (неверный или отозванный ключ).",
        { status: 401 }
      );
    }
    if (e instanceof OpenAI.RateLimitError) {
      return new NextResponse("OpenAI: лимит запросов, попробуйте позже.", {
        status: 429,
      });
    }
    if (e instanceof OpenAI.APIError) {
      const hint = e.message?.trim() || "ошибка API";
      return new NextResponse(`OpenAI (${e.status ?? "?"}): ${hint}`.slice(0, 900), {
        status:
          typeof e.status === "number" &&
          e.status >= 400 &&
          e.status < 600
            ? e.status
            : 502,
      });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return new NextResponse(`Upstream error: ${msg}`.slice(0, 900), {
      status: 502,
    });
  }

  const encoder = new TextEncoder();
  let assistantBuffer = "";

  const stream = new ReadableStream({
    async start(controller) {
      const safeClose = (): void => {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      try {
        for await (const part of completionStream) {
          const choice0 = part.choices?.[0];
          const token = extractChatCompletionDeltaText(choice0?.delta);
          if (token) {
            const room = NPC_REPLY_MAX_CHARS - assistantBuffer.length;
            if (room <= 0) {
              break;
            }
            const piece =
              token.length > room ? token.slice(0, room) : token;
            assistantBuffer += piece;
            if (piece.length > 0) {
              controller.enqueue(
                encoder.encode(encodeSseMessage({ type: "delta", text: piece }))
              );
            }
            if (assistantBuffer.length >= NPC_REPLY_MAX_CHARS) {
              break;
            }
          }
        }

        await appendNpcEvent(rawId, {
          ts: new Date().toISOString(),
          type: "dialogue",
          summary: buildSummary(body.message, assistantBuffer),
        });

        controller.enqueue(encoder.encode(encodeSseMessage({ type: "done" })));
        safeClose();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(
          encoder.encode(
            encodeSseMessage({
              type: "error",
              message: msg,
              code: "chat_stream",
            })
          )
        );
        safeClose();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
