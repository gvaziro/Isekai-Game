import { describe, expect, it } from "vitest";
import { extractChatCompletionDeltaText } from "@/src/server/openai-stream-delta";

describe("extractChatCompletionDeltaText", () => {
  it("строка content", () => {
    expect(extractChatCompletionDeltaText({ content: "привет" })).toBe("привет");
  });

  it("массив строк", () => {
    expect(
      extractChatCompletionDeltaText({ content: ["а", "б"] })
    ).toBe("аб");
  });

  it("массив объектов с полем text", () => {
    expect(
      extractChatCompletionDeltaText({
        content: [{ text: "один" }, { text: "два" }],
      })
    ).toBe("одиндва");
  });

  it("type:text и вложенный text.value", () => {
    expect(
      extractChatCompletionDeltaText({
        content: [{ type: "text", text: { value: "X" } }],
      })
    ).toBe("X");
  });

  it("refusal", () => {
    expect(
      extractChatCompletionDeltaText({ refusal: "нет" })
    ).toBe("нет");
  });

  it("пустой delta", () => {
    expect(extractChatCompletionDeltaText({})).toBe("");
  });
});
