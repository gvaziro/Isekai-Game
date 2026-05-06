import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { appendNpcEvent, assertSafeNpcId } from "@/src/server/npc-loader";
import { getOpenAI } from "@/src/server/openai";
import { loadNpcCached } from "@/src/server/cache";
import { getClientIp, rateLimit } from "@/src/server/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("append"),
    type: z.string().trim().min(1).max(80),
    summary: z.string().min(1).max(8000),
  }),
  z.object({
    mode: z.literal("summarize_dialogue"),
    transcript: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().max(12000),
        })
      )
      .min(1)
      .max(32),
  }),
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ npcId: string }> }
) {
  const ip = getClientIp(req.headers);
  if (!rateLimit(ip, "write")) {
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

  try {
    await loadNpcCached(rawId);
  } catch {
    return new NextResponse("NPC not found", { status: 404 });
  }

  if (body.mode === "append") {
    await appendNpcEvent(rawId, {
      ts: new Date().toISOString(),
      type: body.type,
      summary: body.summary,
    });
    return NextResponse.json({ ok: true });
  }

  if (!process.env.OPENAI_API_KEY) {
    return new NextResponse("OPENAI_API_KEY missing", { status: 500 });
  }

  const lines = body.transcript
    .map((t) => `${t.role === "user" ? "Игрок" : "NPC"}: ${t.content}`)
    .join("\n")
    .slice(0, 12000);

  const openai = getOpenAI();
  const model = process.env.NPC_SUMMARY_MODEL ?? process.env.NPC_MODEL ?? "gpt-5.4-mini";

  const completion = await openai.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content:
          "Сожми диалог в одну строку на русском, до 400 символов, без кавычек-ёлочек, без markdown.",
      },
      {
        role: "user",
        content: lines,
      },
    ],
    max_tokens: 200,
  });

  const text =
    completion.choices[0]?.message?.content?.trim() ??
    lines.slice(0, 400);

  await appendNpcEvent(rawId, {
    ts: new Date().toISOString(),
    type: "dialogue_summary",
    summary: text,
  });

  return NextResponse.json({ ok: true, summary: text });
}
