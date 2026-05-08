import { describe, expect, it } from "vitest";
import { OPENING_CUTSCENE_SCRIPT_VERSION } from "@/src/game/data/openingCutscene";
import { resolvePersistedOpeningScriptVersion } from "@/src/game/data/openingCutsceneVersion";
import {
  computeGameRootModalLike,
  gameRootBlocksWorldMenuHotkeys,
  type GameRootModalLikeInput,
} from "@/src/game/ui/gameRootModalLock";
import {
  createFreshPersistedGameState,
  SAVE_VERSION,
} from "@/src/game/state/gameStore";

const allClosed = (): GameRootModalLikeInput => ({
  inventoryOpen: false,
  chestOpen: false,
  craftOpen: false,
  journalOpen: false,
  loreJournalOpen: false,
  achievementsOpen: false,
  settingsOpen: false,
  npcInteract: false,
  shopOpen: false,
  isekaiOpen: false,
  openingCutsceneOpen: false,
  dungeonPickerOpen: false,
  levelStatAllocOpen: false,
  sleepOpen: false,
  dungeonMapOpen: false,
  forestMapOpen: false,
  deathModalOpen: false,
});

describe("opening cutscene persist", () => {
  it("новая игра: версия сценария 0 и актуальный SAVE_VERSION", () => {
    const s = createFreshPersistedGameState();
    expect(s.openingCutsceneScriptVersion).toBe(0);
    expect(s.saveVersion).toBe(SAVE_VERSION);
  });

  it("миграция: пустой partial → 0", () => {
    expect(resolvePersistedOpeningScriptVersion({})).toBe(0);
  });

  it("миграция: legacy openingCutsceneSeen true → не ниже ревизии 1", () => {
    expect(
      resolvePersistedOpeningScriptVersion({ openingCutsceneSeen: true })
    ).toBe(OPENING_CUTSCENE_SCRIPT_VERSION);
  });

  it("миграция: число из сейва сохраняется в пределах текущей ревизии", () => {
    expect(
      resolvePersistedOpeningScriptVersion({
        openingCutsceneScriptVersion: 0,
      })
    ).toBe(0);
    expect(
      resolvePersistedOpeningScriptVersion({
        openingCutsceneScriptVersion: OPENING_CUTSCENE_SCRIPT_VERSION,
      })
    ).toBe(OPENING_CUTSCENE_SCRIPT_VERSION);
  });
});

describe("gameRoot modal lock", () => {
  it("computeGameRootModalLike: всё закрыто → false", () => {
    expect(computeGameRootModalLike(allClosed())).toBe(false);
  });

  it("computeGameRootModalLike: смерть открыта → true", () => {
    expect(
      computeGameRootModalLike({ ...allClosed(), deathModalOpen: true })
    ).toBe(true);
  });

  it("gameRootBlocksWorldMenuHotkeys: миникарта без диалога → true", () => {
    expect(
      gameRootBlocksWorldMenuHotkeys(
        { ...allClosed(), dungeonMapOpen: true },
        false
      )
    ).toBe(true);
  });

  it("computeGameRootModalLike: дневник знаний открыт → true", () => {
    expect(
      computeGameRootModalLike({ ...allClosed(), loreJournalOpen: true })
    ).toBe(true);
  });

  it("gameRootBlocksWorldMenuHotkeys: только диалог → true", () => {
    expect(gameRootBlocksWorldMenuHotkeys(allClosed(), true)).toBe(true);
  });
});
