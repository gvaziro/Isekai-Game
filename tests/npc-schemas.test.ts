import { describe, expect, it } from "vitest";
import {
  npcCharacterMdSchema,
  npcDialogueScriptsFileSchema,
  npcEventLineSchema,
  npcRouteSchema,
  npcTraitsSchema,
} from "@/src/game/data/schemas/npc";

describe("Zod-схемы NPC", () => {
  it("npcEventLineSchema принимает валидную строку jsonl", () => {
    const r = npcEventLineSchema.safeParse({
      ts: new Date().toISOString(),
      type: "dialogue",
      summary: "Игрок: hi | NPC: hey",
    });
    expect(r.success).toBe(true);
  });

  it("npcEventLineSchema отклоняет лишние ключи", () => {
    const r = npcEventLineSchema.safeParse({
      ts: new Date().toISOString(),
      type: "x",
      summary: "y",
      extra: true,
    });
    expect(r.success).toBe(false);
  });

  it("npcCharacterMdSchema требует непустой текст без NUL", () => {
    expect(npcCharacterMdSchema.safeParse("").success).toBe(false);
    expect(npcCharacterMdSchema.safeParse("Role: x").success).toBe(true);
    expect(npcCharacterMdSchema.safeParse("a\0b").success).toBe(false);
  });

  it("npcTraitsSchema passthrough сохраняет произвольные поля", () => {
    const r = npcTraitsSchema.safeParse({ name: "A", mood: "calm" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("A");
      expect((r.data as Record<string, unknown>).mood).toBe("calm");
    }
  });

  it("npcRouteSchema матчится к минимальному route.json", () => {
    const r = npcRouteSchema.safeParse({
      spawn: { x: 1, y: 2 },
      speed: 40,
      idleMs: [1000, 3000],
      waypoints: [{ x: 0, y: 0 }],
    });
    expect(r.success).toBe(true);
  });

  it("npcDialogueScriptsFileSchema принимает квестовую scripted-сцену", () => {
    const r = npcDialogueScriptsFileSchema.safeParse({
      scenes: [
        {
          id: "briefing",
          questId: "village_briefing",
          stageId: "talk_to_marcus",
          version: 1,
          steps: [
            {
              id: "start",
              npcText: "Сначала слушай, потом спрашивай.",
              choices: [
                {
                  label: "Я слушаю.",
                  playerText: "Я слушаю.",
                  complete: true,
                  unlockLoreFactIds: ["places.village"],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("npcDialogueScriptsFileSchema отклоняет scripted-сцену без выбора", () => {
    const r = npcDialogueScriptsFileSchema.safeParse({
      scenes: [
        {
          id: "briefing",
          questId: "village_briefing",
          stageId: "talk_to_marcus",
          version: 1,
          steps: [{ id: "start", npcText: "Нет выбора.", choices: [] }],
        },
      ],
    });
    expect(r.success).toBe(false);
  });
});
