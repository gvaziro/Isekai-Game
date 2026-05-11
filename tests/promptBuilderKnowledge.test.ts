import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildMessagesForCompletion, buildSystemMessages } from "@/src/server/prompt-builder";
import type { NpcBundle } from "@/src/server/types";

describe("prompt-builder knowledge block", () => {
  it("добавляет knowledge-срез и больше не вставляет WORLD_ARC_PROMPT целиком", () => {
    const messages = buildMessagesForCompletion(elenaNpc(), [], "почему деревня заперта туманом?");
    const systemText = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    expect(systemText).toContain("=== Знания NPC сейчас ===");
    expect(systemText).toContain("Туман");
    expect(systemText).not.toContain("=== Канон мира (общий для всех NPC) ===");
    expect(systemText).not.toContain("blocked_facts");
    expect(systemText).not.toContain("goblin_king_controls_fog");
  });

  it("для вопроса про 10 этаж обычный NPC не получает скрытую механику печати напрямую", () => {
    const messages = buildMessagesForCompletion(elenaNpc(), [], "что на 10 этаж?");
    const systemText = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    expect(systemText).toContain("=== Знания NPC сейчас ===");
    expect(systemText).toContain("10-й этаж");
    expect(systemText).not.toContain("Король гоблинов удерживает не только туман снаружи");
    expect(systemText).not.toContain("более древней системой подземелья");
  });

  it("после lore_update не подсовывает старые события с прошлым каноном", () => {
    const npc = {
      ...elenaNpc(),
      events: [
        {
          ts: "2026-05-06T00:00:00.000Z",
          type: "dialogue",
          summary: "Старый канон: туман держит хранитель на 10-м этаже.",
        },
        {
          ts: "2026-05-08T12:00:00.000Z",
          type: "lore_update",
          summary: "Новый канон: финальный босс первого подземелья — Король гоблинов.",
        },
      ],
    };

    const systemText = buildSystemMessages(npc)
      .map((message) => message.content)
      .join("\n\n");

    expect(systemText).toContain("Король гоблинов");
    expect(systemText).not.toContain("Старый канон");
  });

  it("adds merchant stock snapshot when provided", () => {
    const messages = buildMessagesForCompletion(
      elenaNpc(),
      [],
      "что купить перед подземельем?",
      "location: village",
      "Лавка: тестовая.\nВ наличии:\n- hp_small: цена 12 зол.; остаток 2"
    );
    const systemText = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");

    expect(systemText).toContain("Лавка NPC сейчас");
    expect(systemText).toContain("hp_small");
    expect(systemText).toContain("остаток 2");
  });
});

function elenaNpc(): NpcBundle {
  const traits = JSON.parse(fs.readFileSync(path.join(process.cwd(), "npcs", "elena", "traits.json"), "utf8")) as Record<
    string,
    unknown
  >;
  return {
    id: "elena",
    traits,
    characterMd: "Елена profile",
    events: [],
    route: { spawn: { x: 0, y: 0 }, speed: 1, idleMs: [1, 2], waypoints: [] },
  };
}
