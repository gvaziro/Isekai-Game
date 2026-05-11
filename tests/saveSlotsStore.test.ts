import { describe, expect, it } from "vitest";
import {
  normalizeSlots,
  SAVE_SLOT_COUNT,
} from "@/src/game/state/saveSlotsStore";

describe("saveSlotsStore normalizeSlots", () => {
  it("пустой ввод → массив из SAVE_SLOT_COUNT null", () => {
    expect(normalizeSlots(undefined)).toEqual(
      Array.from({ length: SAVE_SLOT_COUNT }, () => null)
    );
  });

  it("валидный слот с четырьмя ключами", () => {
    const e = {
      "last-summon-save-v1": "{}",
      "last-summon-quest-v1": "{}",
      "last-summon-lore-journal-v1": "{}",
      "last-summon-npc-dialogue-progress-v1": "{}",
    };
    const slots = normalizeSlots([
      { updatedAt: 1000, entries: e },
      null,
    ]);
    expect(slots[0]?.updatedAt).toBe(1000);
    expect(slots[0]?.entries).toEqual(e);
    expect(slots[1]).toBeNull();
  });

  it("невалидный слот (нет ключа) → null", () => {
    const slots = normalizeSlots([
      {
        updatedAt: 1,
        entries: { "last-summon-save-v1": "{}" },
      },
    ]);
    expect(slots[0]).toBeNull();
  });
});
