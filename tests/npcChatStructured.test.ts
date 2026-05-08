import { describe, expect, it } from "vitest";
import {
  normalizeNpcChatStructured,
  NpcChatStructuredSchema,
} from "@/src/game/data/npcChatStructured";

describe("normalizeNpcChatStructured", () => {
  it("обрезает reply и оставляет три уникальные подсказки", () => {
    const out = normalizeNpcChatStructured(
      NpcChatStructuredSchema.parse({
        reply: "  Привет.  ",
        suggestions: ["Да", "Нет", "Может быть"],
      })
    );
    expect(out.reply.trim()).toBe(out.reply);
    expect(out.suggestions).toHaveLength(3);
    expect(new Set(out.suggestions.map((s) => s.toLowerCase())).size).toBe(3);
  });

  it("добивает подсказки при дубликатах", () => {
    const out = normalizeNpcChatStructured(
      NpcChatStructuredSchema.parse({
        reply: "Ок.",
        suggestions: ["Один", "Один", "Один"],
      })
    );
    expect(out.suggestions).toHaveLength(3);
    expect(out.suggestions[0]).toBe("Один");
  });
});
