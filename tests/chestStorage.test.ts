import { describe, expect, it } from "vitest";
import { CHEST_STORAGE_SLOTS } from "@/src/game/constants/gameplay";
import { chestIdHasLootTable } from "@/src/game/data/loot";
import {
  createFreshPersistedGameState,
  useGameStore,
} from "@/src/game/state/gameStore";

describe("chestIdHasLootTable", () => {
  it("распознаёт городские сундуки с таблицей", () => {
    expect(chestIdHasLootTable("chest_nw_house")).toBe(true);
    expect(chestIdHasLootTable("chest_ne_plaza")).toBe(true);
  });

  it("возвращает false для произвольного id", () => {
    expect(chestIdHasLootTable("chest_dungeon_boss_f1")).toBe(false);
    expect(chestIdHasLootTable("unknown")).toBe(false);
  });
});

describe("chest storage store", () => {
  it("переносит предмет из рюкзака в пустую ячейку сундука", () => {
    const base = createFreshPersistedGameState();
    const inv = [...base.inventorySlots];
    inv[0] = { curatedId: "hp_small", qty: 3 };
    useGameStore.setState({
      ...base,
      inventorySlots: inv,
    });

    const cid = "chest_test_unit";
    useGameStore.getState().ensureChestStorageRow(cid);
    useGameStore.getState().moveBetweenInvAndChest(
      cid,
      { kind: "inv", index: 0 },
      { kind: "chest", index: 5 }
    );

    const st = useGameStore.getState();
    expect(st.inventorySlots[0]).toBeNull();
    expect(st.chestSlots[cid]?.[5]).toEqual({
      curatedId: "hp_small",
      qty: 3,
    });
  });

  it("сливает совпадающие стаки при переносе в сундук", () => {
    const base = createFreshPersistedGameState();
    const inv = [...base.inventorySlots];
    inv[0] = { curatedId: "hp_small", qty: 5 };
    useGameStore.setState({
      ...base,
      inventorySlots: inv,
    });

    const cid = "chest_test_merge";
    useGameStore.getState().ensureChestStorageRow(cid);
    useGameStore.setState((s) => ({
      chestSlots: {
        ...s.chestSlots,
        [cid]: (() => {
          const row = Array.from(
            { length: CHEST_STORAGE_SLOTS },
            () => null as (typeof inv)[number]
          );
          row[2] = { curatedId: "hp_small", qty: 90 };
          return row;
        })(),
      },
    }));

    useGameStore.getState().moveBetweenInvAndChest(
      cid,
      { kind: "inv", index: 0 },
      { kind: "chest", index: 2 }
    );

    const st = useGameStore.getState();
    expect(st.chestSlots[cid]?.[2]?.qty).toBe(95);
    expect(st.inventorySlots[0]).toBeNull();
  });
});
