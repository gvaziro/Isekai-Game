/**
 * SSE-протокол для `/api/chat/:npcId` и будущей фазы 5.6 (tool calling).
 * Формат блока: `event: <имя>\\ndata: <JSON>\\n\\n`
 */

export type ChatStreamEventName = "delta" | "tool_call" | "done" | "error";

/**
 * Контракт `tool_call` для интеграции с LLM (фаза 5.6): стабильные поля для редьюсеров и UI.
 */
export type ToolCallEventPayload = {
  /** Идентификатор вызова (`tool_call.id` у провайдера или серверный UUID). */
  id: string;
  /** Имя зарегистрированного инструмента. */
  name: string;
  /** Аргументы после парсинга JSON-объекта ответа модели. */
  arguments: Record<string, unknown>;
};

export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "tool_call"; payload: ToolCallEventPayload }
  | { type: "done" }
  | { type: "error"; message: string; code?: string };

export function encodeSseMessage(ev: ChatStreamEvent): string {
  switch (ev.type) {
    case "delta":
      return sseBlock("delta", { text: ev.text });
    case "tool_call":
      return sseBlock("tool_call", ev.payload);
    case "done":
      return sseBlock("done", {});
    case "error":
      return sseBlock("error", {
        message: ev.message,
        ...(ev.code !== undefined ? { code: ev.code } : {}),
      });
    default: {
      const _exhaustive: never = ev;
      return _exhaustive;
    }
  }
}

function sseBlock(eventName: string, data: unknown): string {
  return `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
}

function parseSseBlock(block: string): ChatStreamEvent | null {
  let eventName = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  const dataStr = dataLines.join("\n");
  let data: unknown;
  try {
    data = JSON.parse(dataStr) as unknown;
  } catch {
    return {
      type: "error",
      message: "Invalid SSE data JSON",
      code: "sse_parse",
    };
  }
  if (eventName === "delta") {
    const o = data as { text?: unknown };
    if (typeof o?.text !== "string") {
      return {
        type: "error",
        message: "delta: missing text",
        code: "sse_shape",
      };
    }
    return { type: "delta", text: o.text };
  }
  if (eventName === "tool_call") {
    const o = data as {
      id?: unknown;
      name?: unknown;
      arguments?: unknown;
    };
    if (
      typeof o?.id !== "string" ||
      typeof o?.name !== "string" ||
      typeof o?.arguments !== "object" ||
      o.arguments === null ||
      Array.isArray(o.arguments)
    ) {
      return {
        type: "error",
        message: "tool_call: invalid payload shape",
        code: "sse_shape",
      };
    }
    return {
      type: "tool_call",
      payload: {
        id: o.id,
        name: o.name,
        arguments: o.arguments as Record<string, unknown>,
      },
    };
  }
  if (eventName === "done") {
    return { type: "done" };
  }
  if (eventName === "error") {
    const o = data as { message?: unknown; code?: unknown };
    if (typeof o?.message !== "string") {
      return {
        type: "error",
        message: "error event without message",
        code: "sse_shape",
      };
    }
    return {
      type: "error",
      message: o.message,
      ...(typeof o.code === "string" ? { code: o.code } : {}),
    };
  }
  return {
    type: "error",
    message: `Unknown SSE event: ${eventName}`,
    code: "sse_event",
  };
}

/**
 * Накопление фрагментов тела ответа; вызывать с последовательными строками UTF-8 (после TextDecoder).
 */
export function appendSseChunks(
  buffer: string,
  chunk: string,
  onEvent: (ev: ChatStreamEvent) => void
): string {
  let buf = buffer + chunk;
  while (true) {
    const idxRn = buf.indexOf("\r\n\r\n");
    const idxN = buf.indexOf("\n\n");
    let sep = -1;
    let len = 0;
    if (idxRn !== -1 && (idxN === -1 || idxRn <= idxN)) {
      sep = idxRn;
      len = 4;
    } else if (idxN !== -1) {
      sep = idxN;
      len = 2;
    } else {
      break;
    }
    const block = buf.slice(0, sep);
    buf = buf.slice(sep + len);
    if (block.trim().length === 0) {
      continue;
    }
    const parsed = parseSseBlock(block);
    if (parsed) {
      onEvent(parsed);
    }
  }
  return buf;
}
