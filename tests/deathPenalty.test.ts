import { describe, expect, it, vi, afterEach } from "vitest";
import {
  BASE_INVENTORY_SLOTS,
  MAX_STACK,
} from "@/src/game/constants/gameplay";
import {
  DEATH_SICKNESS_BUFF_ID,
  DEATH_SICKNESS_DURATION_SEC,
  applyXpDeathPenalty,
  rollGoldLostOnDeath,
} from "@/src/game/data/balance";
import {
  createFreshPersistedGameState,
  useGameStore,
} from "@/src/game/state/gameStore";

afterEach(() => {
  vi.restoreAllMocks();
  useGameStore.setState(createFreshPersistedGameState());
});

describe("rollGoldLostOnDeath", () => {
  it("при нуле золота ничего не теряется", () => {
    expect(rollGoldLostOnDeath(0, () => 0.5)).toBe(0);
  });

  it("5–15% от текущего золота (детерминированный rnd)", () => {
    expect(rollGoldLostOnDeath(100, () => 0)).toBe(5);
    expect(rollGoldLostOnDeath(100, () => 1)).toBe(15);
  });
});

describe("respawnAfterDeath", () => {
  it("первая смерть: дебаф, потеря золота, штраф XP", () => {
    const base = createFreshPersistedGameState();
    vi.spyOn(Math, "random").mockReturnValue(0);
    useGameStore.setState({
      ...base,
      currentLocationId: "town",
      player: { x: 100, y: 200 },
      character: {
        ...base.character,
        level: 5,
        xp: 500,
        gold: 100,
        buffs: [],
      },
    });
    const expectedXp = applyXpDeathPenalty(5, 500);
    useGameStore.getState().respawnAfterDeath();
    const st = useGameStore.getState();
    expect(st.currentLocationId).toBe("town");
    expect(st.character.level).toBe(expectedXp.level);
    expect(st.character.xp).toBe(expectedXp.xp);
    expect(st.character.gold).toBe(95);
    expect(Object.keys(st.deathDrops)).toHaveLength(0);
    const sick = st.character.buffs.find((b) => b.id === DEATH_SICKNESS_BUFF_ID);
    expect(sick).toBeDefined();
    expect(sick!.remainingSec).toBe(DEATH_SICKNESS_DURATION_SEC);
  });

  it("смерть под болезнью: труп с инвентарём и экипировкой", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const base = createFreshPersistedGameState();
    const inv = [...base.inventorySlots];
    inv[0] = { curatedId: "apple", qty: 2 };
    useGameStore.setState({
      ...base,
      currentLocationId: "forest",
      player: { x: 400, y: 300 },
      character: {
        ...base.character,
        level: 3,
        xp: 100,
        gold: 50,
        buffs: [{ id: DEATH_SICKNESS_BUFF_ID, remainingSec: 100 }],
      },
      inventorySlots: inv,
      equipped: { weapon: "spear_short" },
    });
    useGameStore.getState().respawnAfterDeath();
    const st = useGameStore.getState();
    expect(st.inventorySlots.every((s) => s === null)).toBe(true);
    expect(st.equipped).toEqual({});
    const drops = Object.values(st.deathDrops);
    expect(drops).toHaveLength(1);
    const d = drops[0]!;
    expect(d.locationId).toBe("forest");
    expect(d.dungeonFloor).toBeNull();
    expect(d.x).toBe(400);
    expect(d.y).toBe(300);
    expect(d.corpseInventory[0]).toEqual({ curatedId: "apple", qty: 2 });
    expect(d.corpseEquipped.weapon).toBe("spear_short");
  });
});

describe("tryRecoverDeathCorpse", () => {
  it("частичный подбор оставляет остаток в deathDrops", () => {
    const base = createFreshPersistedGameState();
    const inv = [...base.inventorySlots];
    inv[0] = { curatedId: "apple", qty: 98 };
    for (let i = 1; i < BASE_INVENTORY_SLOTS; i++) {
      inv[i] = { curatedId: "hp_small", qty: MAX_STACK };
    }
    const corpseId = "corp_test_1";
    const corpseInv = [...base.inventorySlots];
    corpseInv[0] = { curatedId: "apple", qty: 5 };
    useGameStore.setState({
      ...base,
      inventorySlots: inv,
      deathDrops: {
        [corpseId]: {
          id: corpseId,
          locationId: "town",
          dungeonFloor: null,
          x: 0,
          y: 0,
          corpseInventory: corpseInv,
          corpseEquipped: {},
        },
      },
    });

    const res = useGameStore.getState().tryRecoverDeathCorpse(corpseId);
    expect(res.ok).toBe(true);
    expect(res.partial).toBe(true);

    const st = useGameStore.getState();
    expect(st.inventorySlots[0]?.qty).toBe(99);
    const left = st.deathDrops[corpseId];
    expect(left).toBeDefined();
    expect(left!.corpseInventory[0]).toEqual({ curatedId: "apple", qty: 4 });
  });
});
