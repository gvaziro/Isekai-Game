import { describe, expect, it } from "vitest";
import { OPENING_CUTSCENE_SCRIPT_VERSION } from "@/src/game/data/openingCutscene";
import {
  OPENING_CUTSCENE_LEGACY_BOOLEAN_MEANS_VERSION,
  resolvePersistedOpeningScriptVersion,
} from "@/src/game/data/openingCutsceneVersion";
import {
  computeGameRootModalLike,
  gameRootBlocksWorldMenuHotkeys,
  type GameRootModalLikeInput,
} from "@/src/game/ui/gameRootModalLock";
import {
  DEFAULT_PLAYER_NAME,
  MAX_PLAYER_NAME_LENGTH,
  createFreshPersistedGameState,
  normalizePlayerName,
  SAVE_VERSION,
  useGameStore,
} from "@/src/game/state/gameStore";

const allClosed = (): GameRootModalLikeInput => ({
  inventoryOpen: false,
  chestOpen: false,
  craftOpen: false,
  journalOpen: false,
  loreJournalOpen: false,
  readableBookOpen: false,
  achievementsOpen: false,
  settingsOpen: false,
  npcInteract: false,
  heroThoughtOpen: false,
  shopOpen: false,
  isekaiOpen: false,
  openingCutsceneOpen: false,
  dungeonPickerOpen: false,
  levelStatAllocOpen: false,
  sleepOpen: false,
  dungeonMapOpen: false,
  forestMapOpen: false,
  deathModalOpen: false,
  worldQuickMenuOpen: false,
  loadGameOverlayOpen: false,
  saveGameOverlayOpen: false,
});

describe("opening cutscene persist", () => {
  it("новая игра: версия сценария 0 и актуальный SAVE_VERSION", () => {
    const s = createFreshPersistedGameState();
    expect(s.openingCutsceneScriptVersion).toBe(0);
    expect(s.playerName).toBe(DEFAULT_PLAYER_NAME);
    expect(s.saveVersion).toBe(SAVE_VERSION);
  });

  it("миграция: пустой partial → 0", () => {
    expect(resolvePersistedOpeningScriptVersion({})).toBe(0);
  });

  it("миграция: legacy openingCutsceneSeen true → ревизия из boolean (старый сейв)", () => {
    expect(
      resolvePersistedOpeningScriptVersion({ openingCutsceneSeen: true })
    ).toBe(OPENING_CUTSCENE_LEGACY_BOOLEAN_MEANS_VERSION);
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

describe("player name persist", () => {
  it("normalizePlayerName: пустое и нестроковое значение дают дефолт", () => {
    expect(normalizePlayerName("   ")).toBe(DEFAULT_PLAYER_NAME);
    expect(normalizePlayerName(null)).toBe(DEFAULT_PLAYER_NAME);
  });

  it("normalizePlayerName: принимает валидное имя и схлопывает пробелы", () => {
    expect(normalizePlayerName("  Анна   Светлая  ")).toBe("Анна Светлая");
  });

  it("normalizePlayerName: длинное имя обрезается до лимита", () => {
    const raw = "А".repeat(MAX_PLAYER_NAME_LENGTH + 5);
    expect(normalizePlayerName(raw)).toBe("А".repeat(MAX_PLAYER_NAME_LENGTH));
  });

  it("setPlayerName: сохраняет нормализованное имя в store", () => {
    useGameStore.getState().setPlayerName("  Ника   ");
    expect(useGameStore.getState().playerName).toBe("Ника");
    useGameStore.getState().setPlayerName("");
    expect(useGameStore.getState().playerName).toBe(DEFAULT_PLAYER_NAME);
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

  it("computeGameRootModalLike: меню «?» открыто → true", () => {
    expect(
      computeGameRootModalLike({ ...allClosed(), worldQuickMenuOpen: true })
    ).toBe(true);
  });

  it("computeGameRootModalLike: окно загрузки открыто → true", () => {
    expect(
      computeGameRootModalLike({ ...allClosed(), loadGameOverlayOpen: true })
    ).toBe(true);
  });

  it("computeGameRootModalLike: окно сохранения в слот открыто → true", () => {
    expect(
      computeGameRootModalLike({ ...allClosed(), saveGameOverlayOpen: true })
    ).toBe(true);
  });

  it("gameRootBlocksWorldMenuHotkeys: только диалог → true", () => {
    expect(gameRootBlocksWorldMenuHotkeys(allClosed(), true)).toBe(true);
  });
});
