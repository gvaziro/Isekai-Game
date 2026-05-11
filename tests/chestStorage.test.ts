import { describe, expect, it } from "vitest";
import { CHEST_STORAGE_SLOTS } from "@/src/game/constants/gameplay";
import { FOG_SEAL_SHARD_ITEM_ID } from "@/src/game/data/quests";
import { chestIdHasLootTable } from "@/src/game/data/loot";
import { dungeonBossChestIdForFloor } from "@/src/game/data/dungeonBoss";
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

  it("кладёт лут босс-сундука подземелья в ячейки сундука при первом открытии", () => {
    const base = createFreshPersistedGameState();
    const chestId = dungeonBossChestIdForFloor(1);
    useGameStore.setState({
      ...base,
      openedChestIds: {},
      chestSlots: {},
    });

    const r = useGameStore.getState().applyBossChestLootIfNeeded(chestId, 100, 200);
    expect(r.applied).toBe(true);
    expect(r.xp).toBeGreaterThan(0);

    const row = useGameStore.getState().chestSlots[chestId];
    expect(row).toBeDefined();
    expect(row!.some((s) => s !== null)).toBe(true);
    expect(useGameStore.getState().openedChestIds[chestId]).toBe(true);

    const r2 = useGameStore.getState().applyBossChestLootIfNeeded(chestId, 100, 200);
    expect(r2.applied).toBe(false);
  });

  it("guarantees the fog seal shard only in the floor 3 boss chest", () => {
    const base = createFreshPersistedGameState();
    useGameStore.setState({
      ...base,
      openedChestIds: {},
      chestSlots: {},
    });

    const floor3 = dungeonBossChestIdForFloor(3);
    useGameStore.getState().applyBossChestLootIfNeeded(floor3, 100, 200);
    expect(
      useGameStore
        .getState()
        .chestSlots[floor3]?.some((s) => s?.curatedId === FOG_SEAL_SHARD_ITEM_ID)
    ).toBe(true);

    const floor2 = dungeonBossChestIdForFloor(2);
    useGameStore.getState().applyBossChestLootIfNeeded(floor2, 100, 200);
    expect(
      useGameStore
        .getState()
        .chestSlots[floor2]?.some((s) => s?.curatedId === FOG_SEAL_SHARD_ITEM_ID)
    ).toBe(false);
  });
});
