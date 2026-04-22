"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NPC_REPLY_MAX_CHARS } from "@/src/game/constants/dialogue";
import { clipNpcReply } from "@/src/game/ui/npcReplyClip";
import { useNpcChatStream } from "@/src/game/ui/useNpcChatStream";

type Turn = { role: "user" | "assistant"; content: string };

export type DialogueScriptedOpener = { label: string; prompt: string };

function NpcMessageBody({ content }: { content: string }) {
  const trimmed = content.trim();
  if (!trimmed) {
    return (
      <span className="text-zinc-400 italic">
        Модель не вернула текст. Повторите сообщение или смените фразу.
      </span>
    );
  }
  return (
    <span className="whitespace-pre-wrap break-words">
      {clipNpcReply(content)}
    </span>
  );
}

export default function DialogueOverlay({
  npcId,
  displayName,
  scriptedOpeners,
  onClose,
}: {
  npcId: string;
  /** Имя из traits.json (через GET /api/npcs) */
  displayName?: string;
  /** Кнопки быстрого старта из `dialogue_scripts.json`. */
  scriptedOpeners?: ReadonlyArray<DialogueScriptedOpener>;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Turn[]>([]);
  const [streaming, setStreaming] = useState("");
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const { resetAccumulator, consumeSseResponse } = useNpcChatStream();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, streaming]);

  const close = useCallback(() => {
    setError(null);
    window.dispatchEvent(
      new CustomEvent("npc-dialogue-close", { detail: { npcId } })
    );
    window.dispatchEvent(
      new CustomEvent("nagibatop:dialogue-close", { detail: { npcId } })
    );
    onClose();
  }, [npcId, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  async function summarizeAndClose(): Promise<void> {
    setError(null);
    if (msgs.length === 0) {
      close();
      return;
    }
    setSummarizing(true);
    try {
      const res = await fetch(`/api/npc/${npcId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summarize_dialogue",
          transcript: msgs.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      if (!res.ok) {
        setError(`Не удалось сохранить саммари: ${res.status}`);
        return;
      }
    } catch {
      setError("Ошибка сети при сохранении саммари.");
      return;
    } finally {
      setSummarizing(false);
    }
    close();
  }

  async function sendUserMessage(
    raw: string,
    opts?: { restoreInputOnError?: string }
  ): Promise<void> {
    const text = raw.trim();
    if (!text || loading || summarizing) return;

    chatAbortRef.current?.abort();
    const ac = new AbortController();
    chatAbortRef.current = ac;

    setLoading(true);
    resetAccumulator();
    setStreaming("");
    setError(null);

    try {
      const history = msgs.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`/api/chat/${npcId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
        signal: ac.signal,
      });

      await consumeSseResponse(res, text, {
        onStreamingText: setStreaming,
        onCommitted: (userLine, assistantLine) => {
          setMsgs((m) => [
            ...m,
            { role: "user", content: userLine },
            { role: "assistant", content: assistantLine },
          ]);
        },
        onStreamError: (message) => {
          setError(message);
          if (opts?.restoreInputOnError !== undefined) {
            setInput(opts.restoreInputOnError);
          }
        },
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      setError("Сеть или сервер недоступны.");
      if (opts?.restoreInputOnError !== undefined) {
        setInput(opts.restoreInputOnError);
      }
    } finally {
      setLoading(false);
    }
  }

  async function send(): Promise<void> {
    const text = input.trim();
    if (!text || loading || summarizing) return;
    setInput("");
    await sendUserMessage(text, { restoreInputOnError: text });
  }

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[100] flex flex-col justify-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={() => inputRef.current?.focus()}
      role="presentation"
    >
      <div className="mx-auto flex h-[min(72vh,520px)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-600 bg-zinc-900/97 p-4 text-sm text-zinc-100 shadow-2xl">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-700 pb-3">
          <div className="font-medium text-emerald-300">
            Диалог —{" "}
            <span className="text-zinc-200">{displayName ?? npcId}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={summarizing || loading}
              className="rounded-md border border-emerald-700 bg-emerald-950/80 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900 disabled:opacity-40"
              onClick={() => void summarizeAndClose()}
            >
              {summarizing ? "Сохранение…" : "Завершить и саммари"}
            </button>
            <button
              type="button"
              disabled={summarizing}
              className="rounded-md border border-zinc-600 px-3 py-1.5 text-xs hover:bg-zinc-800"
              onClick={close}
            >
              Закрыть (Esc)
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-2 rounded-md border border-red-900/80 bg-red-950/90 px-3 py-2 text-xs text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mb-3 min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden pr-1">
          {msgs.map((m, i) => (
            <div
              key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
              className={
                m.role === "user"
                  ? "ml-8 min-w-0 rounded-lg border border-emerald-700/55 bg-emerald-950/75 p-3 shadow-sm"
                  : "mr-8 min-w-0 rounded-lg border border-zinc-500/45 bg-zinc-600/90 p-3 shadow-sm"
              }
            >
              <span
                className={
                  m.role === "user"
                    ? "text-[10px] font-medium uppercase tracking-wide text-emerald-400/95"
                    : "text-[10px] font-medium uppercase tracking-wide text-zinc-300"
                }
              >
                {m.role === "user" ? "Вы" : "NPC"}
              </span>
              <p
                className={
                  m.role === "user"
                    ? "mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-emerald-50"
                    : "mt-1.5 text-[15px] leading-relaxed text-zinc-50 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]"
                }
              >
                {m.role === "user" ? (
                  m.content
                ) : (
                  <NpcMessageBody content={m.content} />
                )}
              </p>
            </div>
          ))}
          {(streaming.length > 0 || loading) && (
            <div className="mr-8 min-w-0 rounded-lg border border-zinc-500/45 bg-zinc-600/90 p-3 shadow-sm">
              <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">
                NPC
              </span>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-zinc-50 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                {streaming.length > 0 ? (
                  clipNpcReply(streaming)
                ) : loading ? (
                  <span className="animate-pulse text-zinc-300">Печатает…</span>
                ) : null}
              </p>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {scriptedOpeners && scriptedOpeners.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {scriptedOpeners.map((o, i) => (
              <button
                key={`${i}-${o.label}`}
                type="button"
                disabled={loading || summarizing || !o.prompt.trim()}
                className="rounded-lg border border-zinc-600 bg-zinc-800/80 px-3 py-1.5 text-xs text-zinc-100 hover:bg-zinc-700 disabled:opacity-40"
                onClick={() => void sendUserMessage(o.prompt)}
              >
                {o.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2 border-t border-zinc-800 pt-3">
          <input
            ref={inputRef}
            className="min-w-0 flex-1 rounded-lg border border-zinc-600 bg-zinc-950 px-3 py-2.5 text-base text-zinc-100 outline-none focus:border-emerald-500"
            placeholder="Введите сообщение…"
            value={input}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={loading || summarizing}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Tab") {
                e.preventDefault();
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            onKeyUp={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            disabled={loading || summarizing || !input.trim()}
            className="shrink-0 rounded-lg bg-emerald-700 px-5 py-2.5 font-medium text-white hover:bg-emerald-600 disabled:opacity-40"
            onClick={() => void send()}
          >
            Отправить
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          Enter — отправить · Shift+Enter можно вставить перенос · Esc — закрыть
        </p>
        <p className="mt-1 text-center text-[10px] text-zinc-600">
          До {NPC_REPLY_MAX_CHARS} символов в ответе NPC.
        </p>
      </div>
    </div>
  );
}
