import { describe, expect, it, beforeEach } from "vitest";
import { LORE_FACTS } from "@/src/game/data/loreJournal";
import {
  resetLoreJournalToNewGame,
  useLoreJournalStore,
} from "@/src/game/state/loreJournalStore";

describe("loreJournalStore", () => {
  beforeEach(() => {
    resetLoreJournalToNewGame();
  });

  it("игнорирует неизвестный fact id", () => {
    const r = useLoreJournalStore.getState().unlockLoreFact("unknown.fact");
    expect(r.added).toBe(false);
    expect(useLoreJournalStore.getState().unlockedFactIds.length).toBe(0);
  });

  it("unlockLoreFact добавляет известную запись", () => {
    const id = LORE_FACTS[0]!.id;
    const r = useLoreJournalStore.getState().unlockLoreFact(id);
    expect(r.added).toBe(true);
    expect(useLoreJournalStore.getState().unlockedFactIds).toContain(id);
    expect(useLoreJournalStore.getState().entriesById[id]).toBeDefined();
  });

  it("повторный unlock той же записи — не добавляет", () => {
    const id = LORE_FACTS[1]!.id;
    expect(useLoreJournalStore.getState().unlockLoreFact(id).added).toBe(true);
    expect(useLoreJournalStore.getState().unlockLoreFact(id).added).toBe(false);
    expect(useLoreJournalStore.getState().unlockedFactIds.filter((x) => x === id).length).toBe(
      1
    );
  });

  it("unlockLoreFacts добавляет только новые", () => {
    const a = LORE_FACTS[0]!.id;
    const b = LORE_FACTS[1]!.id;
    const added = useLoreJournalStore
      .getState()
      .unlockLoreFacts([a, b, "bad.id", a], { source: "test" });
    expect(added.added.sort()).toEqual([a, b].sort());
    expect(useLoreJournalStore.getState().entriesById[a]?.source).toBe("test");
  });

  it("markLoreFactRead отмечает прочитанным", () => {
    const id = LORE_FACTS[2]!.id;
    useLoreJournalStore.getState().unlockLoreFact(id);
    useLoreJournalStore.getState().markLoreFactRead(id);
    expect(useLoreJournalStore.getState().readFactIds[id]).toBe(true);
  });

  it("resetLoreJournalToNewGame очищает состояние", () => {
    useLoreJournalStore.getState().unlockLoreFact(LORE_FACTS[0]!.id);
    resetLoreJournalToNewGame();
    expect(useLoreJournalStore.getState().unlockedFactIds.length).toBe(0);
    expect(Object.keys(useLoreJournalStore.getState().entriesById).length).toBe(
      0
    );
  });
});
