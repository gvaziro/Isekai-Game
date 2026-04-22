"use client";

import { useCallback, useRef } from "react";
import { appendSseChunks, type ChatStreamEvent } from "@/src/server/stream-protocol";
import { clipNpcReply } from "@/src/game/ui/npcReplyClip";

export type NpcChatTurn = { role: "user" | "assistant"; content: string };

type ConsumeCallbacks = {
  onStreamingText: (text: string) => void;
  onCommitted: (userText: string, assistantText: string) => void;
  onStreamError: (message: string) => void;
};

/**
 * Читает SSE из `/api/chat/:npcId`, накапливает ответ в ref (не теряется при ререндере).
 */
export function useNpcChatStream() {
  const assistantAccRef = useRef("");

  const resetAccumulator = useCallback(() => {
    assistantAccRef.current = "";
  }, []);

  const consumeSseResponse = useCallback(
    async (
      res: Response,
      userText: string,
      cbs: ConsumeCallbacks
    ): Promise<void> => {
      assistantAccRef.current = "";
      let sawDone = false;
      let sawStreamError = false;

      const commitPair = (assistantRaw: string) => {
        const assistantFinal = clipNpcReply(assistantRaw);
        cbs.onCommitted(userText, assistantFinal);
        assistantAccRef.current = "";
        cbs.onStreamingText("");
      };

      const handleEvent = (ev: ChatStreamEvent): void => {
        switch (ev.type) {
          case "delta": {
            assistantAccRef.current = clipNpcReply(
              assistantAccRef.current + ev.text
            );
            cbs.onStreamingText(assistantAccRef.current);
            break;
          }
          case "tool_call":
            break;
          case "done": {
            sawDone = true;
            commitPair(assistantAccRef.current);
            break;
          }
          case "error": {
            sawStreamError = true;
            assistantAccRef.current = "";
            cbs.onStreamingText("");
            cbs.onStreamError(ev.message);
            break;
          }
        }
      };

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        cbs.onStreamError(
          `Запрос не удался (${res.status}). ${errText.slice(0, 200)}`
        );
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let sseBuf = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (value) {
            const chunk = dec.decode(value, { stream: true });
            sseBuf = appendSseChunks(sseBuf, chunk, handleEvent);
          }
          if (done) {
            const tail = dec.decode();
            if (tail) {
              sseBuf = appendSseChunks(sseBuf, tail, handleEvent);
            }
            break;
          }
        }

        if (
          !sawDone &&
          !sawStreamError &&
          assistantAccRef.current.trim().length > 0
        ) {
          commitPair(assistantAccRef.current);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          return;
        }
        cbs.onStreamError("Сеть или сервер недоступны.");
      }
    },
    []
  );

  return { resetAccumulator, consumeSseResponse };
}
