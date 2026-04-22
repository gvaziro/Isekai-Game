import { describe, expect, it } from "vitest";
import {
  appendSseChunks,
  encodeSseMessage,
  type ChatStreamEvent,
  type ToolCallEventPayload,
} from "@/src/server/stream-protocol";

describe("stream-protocol", () => {
  it("восстанавливает delta из одного блока", () => {
    const encoded = encodeSseMessage({ type: "delta", text: "привет" });
    const events: ChatStreamEvent[] = [];
    appendSseChunks("", encoded, (e) => events.push(e));
    expect(events).toEqual([{ type: "delta", text: "привет" }]);
  });

  it("склеивает SSE при разрыве между заголовком и телом", () => {
    const encoded = encodeSseMessage({ type: "done" });
    const cut = Math.max(1, Math.floor(encoded.length / 2));
    const a = encoded.slice(0, cut);
    const b = encoded.slice(cut);
    const events: ChatStreamEvent[] = [];
    let buf = "";
    buf = appendSseChunks(buf, a, (e) => events.push(e));
    expect(events).toHaveLength(0);
    buf = appendSseChunks(buf, b, (e) => events.push(e));
    expect(buf).toBe("");
    expect(events.some((e) => e.type === "done")).toBe(true);
  });

  it("принимает контракт tool_call для фазы 5.6", () => {
    const payload: ToolCallEventPayload = {
      id: "call_1",
      name: "example_tool",
      arguments: { qty: 2 },
    };
    const encoded = encodeSseMessage({ type: "tool_call", payload });
    const events: ChatStreamEvent[] = [];
    appendSseChunks("", encoded, (e) => events.push(e));
    expect(events).toEqual([{ type: "tool_call", payload }]);
  });
});
