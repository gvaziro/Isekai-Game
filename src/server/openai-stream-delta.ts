/**
 * Извлекает видимый текст из `choices[].delta` в потоке chat.completions.
 * Типы SDK описывают `content` как string | null, но в рантайме (новые модели,
 * прокси) часто приходит массив частей или вложенные объекты — без этого UI
 * получает пустую строку и показывает «—».
 */
export function extractChatCompletionDeltaText(delta: unknown): string {
  if (!delta || typeof delta !== "object") return "";
  const d = delta as Record<string, unknown>;

  if (typeof d.refusal === "string" && d.refusal.length > 0) {
    return d.refusal;
  }

  return extractFromContentField(d.content);
}

function extractFromContentField(c: unknown): string {
  if (c == null) return "";
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    let out = "";
    for (const part of c) {
      out += extractFromContentPart(part);
    }
    return out;
  }
  if (typeof c === "object") {
    return extractFromContentPart(c);
  }
  return "";
}

function extractFromContentPart(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const o = part as Record<string, unknown>;

  if (typeof o.text === "string") return o.text;

  if (o.type === "text") {
    const t = o.text;
    if (typeof t === "string") return t;
    if (t && typeof t === "object") {
      const inner = t as Record<string, unknown>;
      if (typeof inner.value === "string") return inner.value;
    }
  }

  if (typeof o.content === "string") return o.content;
  if (Array.isArray(o.content)) {
    let s = "";
    for (const x of o.content) {
      s += extractFromContentPart(x);
    }
    return s;
  }

  return "";
}
