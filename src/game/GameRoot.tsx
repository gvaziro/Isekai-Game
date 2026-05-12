"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { getShopByNpc } from "@/src/game/data/shops";
import DialogueOverlay from "@/src/game/ui/DialogueOverlay";
import type { NpcDialogueScene } from "@/src/game/types";
import HeroThoughtOverlay, {
  type HeroThoughtOpen,
} from "@/src/game/ui/HeroThoughtOverlay";
import GameHud from "@/src/game/ui/GameHud";
import ChestStorageOverlay from "@/src/game/ui/ChestStorageOverlay";
import CraftOverlay from "@/src/game/ui/CraftOverlay";
import InventoryOverlay from "@/src/game/ui/InventoryOverlay";
import QuestJournalOverlay from "@/src/game/ui/QuestJournalOverlay";
import LoreJournalOverlay from "@/src/game/ui/LoreJournalOverlay";
import AchievementsTreeOverlay from "@/src/game/ui/AchievementsTreeOverlay";
import QuestToast from "@/src/game/ui/QuestToast";
import SettingsOverlay from "@/src/game/ui/SettingsOverlay";
import LoadGameOverlay from "@/src/game/ui/LoadGameOverlay";
import SaveGameOverlay from "@/src/game/ui/SaveGameOverlay";
import ShopOverlay from "@/src/game/ui/ShopOverlay";
import IsekaiOriginOverlay from "@/src/game/ui/IsekaiOriginOverlay";
import OpeningCutsceneOverlay from "@/src/game/ui/OpeningCutsceneOverlay";
import DungeonFloorPickerOverlay from "@/src/game/ui/DungeonFloorPickerOverlay";
import SleepOverlay from "@/src/game/ui/SleepOverlay";
import DungeonMapOverlay from "@/src/game/ui/DungeonMapOverlay";
import ForestMapOverlay from "@/src/game/ui/ForestMapOverlay";
import LevelStatOverlay from "@/src/game/ui/LevelStatOverlay";
import ReadableBookOverlay from "@/src/game/ui/ReadableBookOverlay";
import HotbarHud from "@/src/game/ui/HotbarHud";
import {
  DEATH_MODAL_EVENT,
  deathCorpseDropIdFromChestId,
  HOTBAR_SLOT_COUNT,
  HOTBAR_WHEEL_NUDGE_EVENT,
  isDeathCorpseChestId,
  OPEN_LOAD_GAME_PANEL_SESSION_KEY,
  READABLE_BOOK_OPEN_EVENT,
  RESYNC_CORPSE_PICKUPS_EVENT,
} from "@/src/game/constants/gameplay";
import { playRenderDimensions } from "@/src/game/constants/renderPresets";
import { getSharedPhaserAudioContext } from "@/src/game/audio/sharedWebAudioContext";
import { useIsElectronClient } from "@/src/game/hooks/useIsElectronClient";
import { WORLD } from "@/src/game/layout";
import {
  useGameStore,
  waitForGameStoreHydration,
} from "@/src/game/state/gameStore";
import { setAchievementQuestCompletedCountSource } from "@/src/game/state/achievementQuestCount";
import {
  mountQuestEventBridge,
  useQuestStore,
  waitForQuestStoreHydration,
} from "@/src/game/state/questStore";
import { waitForLoreJournalHydration } from "@/src/game/state/loreJournalStore";
import {
  useSaveSlotsStore,
  waitForSaveSlotsHydration,
} from "@/src/game/state/saveSlotsStore";
import { useUiSettingsStore } from "@/src/game/state/uiSettingsStore";
import { mountLoreJournalEventBridge } from "@/src/game/systems/loreJournalEngine";
import { hotbarItemIsImmediatelyUsable } from "@/src/game/data/itemRegistry";
import { getReadableBookForItem } from "@/src/game/data/readableBooks";
import { isElectronClient } from "@/src/game/desktop";
import { applySaveSlotPayload } from "@/src/game/saves/applyProfileSlot";
import { flushElectronProfileWrites } from "@/src/game/saves/electronProfileStateStorage";
import { saveProfileNow } from "@/src/game/saves/saveProfileNow";
import { OPENING_CUTSCENE_SCRIPT_VERSION } from "@/src/game/data/openingCutscene";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import {
  computeGameRootModalLike,
  gameRootBlocksWorldMenuHotkeys,
  type GameRootModalLikeInput,
} from "@/src/game/ui/gameRootModalLock";
/** Можно ли открыть отдых (только город / лес — планирование сна и сдвиг времени суток). */
function canAttemptSleepChannel():
  | { ok: true }
  | { ok: false; reason: "wrong_location" } {
  const st = useGameStore.getState();
  if (st.currentLocationId !== "town" && st.currentLocationId !== "forest" && st.currentLocationId !== "beyond") {
    return { ok: false, reason: "wrong_location" };
  }
  return { ok: true };
}

type DialogueOpen = {
  npcId: string;
  displayName?: string;
  scriptedScenes?: ReadonlyArray<NpcDialogueScene>;
};

type ShopOpenState = {
  shopId: string;
  npcId: string;
  shopTitle: string;
  displayName?: string;
};

/** Снимок для keydown-обработчика: ref обновляется каждый рендер, useEffect зависит только от preview (устойчиво к HMR). */
type WorldMenuHotkeysRef = {
  dungeonMapOpen: boolean;
  forestMapOpen: boolean;
  dialogue: DialogueOpen | null;
  modalLockInput: GameRootModalLikeInput;
  toggleInventory: () => void;
  toggleJournal: () => void;
  toggleLoreJournal: () => void;
  toggleAchievements: () => void;
  toggleSettings: () => void;
  runQuickSave: () => Promise<void>;
  runQuickLoad: () => Promise<void>;
};


function readPreviewFlag(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "1";
}

/** Курсор по умолчанию в игровой оболочке (Phaser + HUD). Hotspot — острие стрелки (левый верх). */
const GAME_SHELL_CURSOR_CSS = 'url("/assets/ui/game-cursor.png") 0 0, pointer';

const WORLD_QUICK_MENU_ITEM_COUNT = 10;

/** Каскад: при открытии сначала «нижние» пункты (ближе к ?), при закрытии — сверху вниз. */
function worldQuickMenuItemMotion(
  open: boolean,
  indexFromTop: number
): { className: string; style: CSSProperties } {
  const staggerOpenMs = 44;
  const staggerCloseMs = 26;
  const delayMs = open
    ? (WORLD_QUICK_MENU_ITEM_COUNT - 1 - indexFromTop) * staggerOpenMs
    : indexFromTop * staggerCloseMs;
  return {
    className: [
      "pointer-events-auto transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[transform,opacity]",
      open
        ? "translate-y-0 opacity-100"
        : "translate-y-8 scale-95 opacity-0",
    ].join(" "),
    style: { transitionDelay: `${delayMs}ms` },
  };
}

function DevHud() {
  const player = useGameStore((s) => s.player);
  const saveVersion = useGameStore((s) => s.saveVersion);
  return (
    <div
      className="pointer-events-none absolute bottom-2 left-2 z-30 max-w-[min(100%,260px)] rounded-md border border-amber-900/80 bg-zinc-950/95 px-2.5 py-2 font-mono text-[10px] text-amber-100/95 shadow-lg"
      role="status"
    >
      <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-400/90">
        Dev (F10)
      </div>
      <div>
        x: {Math.round(player.x)} · y: {Math.round(player.y)}
      </div>
      <div className="text-zinc-500">save v{saveVersion} · last-summon-save-v1</div>
    </div>
  );
}

export default function GameRoot() {
  const gameFrameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<import("phaser").Game | null>(null);
  const [dialogue, setDialogue] = useState<DialogueOpen | null>(null);
  const [heroThought, setHeroThought] = useState<HeroThoughtOpen | null>(null);
  const [shopOpen, setShopOpen] = useState<ShopOpenState | null>(null);
  const [preview] = useState(readPreviewFlag);
  const [devHud, setDevHud] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const electronClient = useIsElectronClient();
  const playRenderPreset = useUiSettingsStore((s) => s.playRenderPreset);
  const playDims = useMemo(
    () => playRenderDimensions(playRenderPreset),
    [playRenderPreset]
  );
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [chestOpen, setChestOpen] = useState<{
    chestId: string;
    chestX: number;
    chestY: number;
  } | null>(null);
  const [craftOpen, setCraftOpen] = useState<{
    stationId: string;
    label: string;
  } | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [loreJournalOpen, setLoreJournalOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [deathModalMessage, setDeathModalMessage] = useState<string | null>(
    null
  );
  const deathModalCloseRef = useRef<HTMLButtonElement>(null);
  const [craftToasts, setCraftToasts] = useState<
    ReadonlyArray<{ id: number; message: string }>
  >([]);
  const craftToastSeq = useRef(0);
  const [isekaiOpen, setIsekaiOpen] = useState(false);
  const [openingCutsceneOpen, setOpeningCutsceneOpen] = useState(false);
  const [dungeonPicker, setDungeonPicker] = useState<{
    open: boolean;
    spawnId: string;
  }>({ open: false, spawnId: "from_town" });
  const [sleepOpen, setSleepOpen] = useState(false);
  const [dungeonMapOpen, setDungeonMapOpen] = useState(false);
  const [forestMapOpen, setForestMapOpen] = useState(false);
  const [readableBook, setReadableBook] = useState<{
    title: string;
    body: string;
  } | null>(null);
  /** Правое нижнее меню (инвентарь, квесты, …): по умолчанию скрыто, открывается по «?». */
  const [worldQuickMenuOpen, setWorldQuickMenuOpen] = useState(false);
  const [loadGameOverlayOpen, setLoadGameOverlayOpen] = useState(false);
  const [saveGameOverlayOpen, setSaveGameOverlayOpen] = useState(false);
  const [engineRemountKey, setEngineRemountKey] = useState(0);
  const [gameStoreHydrated, setGameStoreHydrated] = useState(false);
  const unspentStatPoints = useGameStore(
    (s) => s.character.unspentStatPoints
  );
  const openingCutsceneScriptVersion = useGameStore(
    (s) => s.openingCutsceneScriptVersion
  );
  const markOpeningCutsceneScriptCurrent = useGameStore(
    (s) => s.markOpeningCutsceneScriptCurrent
  );
  const levelStatAllocOpen =
    !preview &&
    gameStoreHydrated &&
    unspentStatPoints > 0 &&
    !openingCutsceneOpen;

  const deathModalOpen = !preview && deathModalMessage !== null;

  const modalLockInput = useMemo(
    (): GameRootModalLikeInput => ({
      inventoryOpen,
      chestOpen: chestOpen !== null,
      craftOpen: craftOpen !== null,
      journalOpen,
      loreJournalOpen,
      readableBookOpen: readableBook !== null,
      achievementsOpen,
      settingsOpen,
      npcInteract: false,
      heroThoughtOpen: heroThought !== null,
      shopOpen: shopOpen !== null,
      isekaiOpen,
      openingCutsceneOpen,
      dungeonPickerOpen: dungeonPicker.open,
      levelStatAllocOpen,
      sleepOpen,
      dungeonMapOpen,
      forestMapOpen,
      deathModalOpen,
      worldQuickMenuOpen,
      loadGameOverlayOpen,
      saveGameOverlayOpen,
    }),
    [
      inventoryOpen,
      chestOpen,
      craftOpen,
      journalOpen,
      loreJournalOpen,
      readableBook,
      achievementsOpen,
      settingsOpen,
      heroThought,
      shopOpen,
      isekaiOpen,
      openingCutsceneOpen,
      dungeonPicker.open,
      levelStatAllocOpen,
      sleepOpen,
      dungeonMapOpen,
      forestMapOpen,
      deathModalOpen,
      worldQuickMenuOpen,
      loadGameOverlayOpen,
      saveGameOverlayOpen,
    ]
  );

  const modalLike = computeGameRootModalLike(modalLockInput);
  const anyModalBlocking = modalLike || dialogue !== null;

  useEffect(() => {
    if (anyModalBlocking) {
      window.dispatchEvent(new CustomEvent("last-summon-modal-open"));
    } else {
      window.dispatchEvent(new CustomEvent("last-summon-modal-close"));
    }
  }, [anyModalBlocking]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message;
      if (!msg) return;
      setToast(msg);
      window.setTimeout(() => setToast(null), 2800);
    };
    window.addEventListener("last-summon-toast", onToast);
    return () => window.removeEventListener("last-summon-toast", onToast);
  }, []);

  useEffect(() => {
    const onDeathModal = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message;
      if (!msg) return;
      setDeathModalMessage(msg);
    };
    window.addEventListener(DEATH_MODAL_EVENT, onDeathModal);
    return () => window.removeEventListener(DEATH_MODAL_EVENT, onDeathModal);
  }, []);

  useEffect(() => {
    if (!deathModalOpen) return;
    const t = window.setTimeout(() => {
      deathModalCloseRef.current?.focus({ preventScroll: true });
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setDeathModalMessage(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [deathModalOpen]);

  useEffect(() => {
    if (craftOpen === null) {
      queueMicrotask(() => {
        setCraftToasts([]);
      });
    }
  }, [craftOpen]);

  useEffect(() => {
    const CRAFT_TOAST_MS = 2800;
    const CRAFT_TOAST_CAP = 3;
    const onCraftToast = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message;
      if (!msg) return;
      const id = ++craftToastSeq.current;
      setCraftToasts((prev) => {
        const next = [...prev, { id, message: msg }];
        return next.length > CRAFT_TOAST_CAP
          ? next.slice(-CRAFT_TOAST_CAP)
          : next;
      });
      window.setTimeout(() => {
        setCraftToasts((prev) => prev.filter((t) => t.id !== id));
      }, CRAFT_TOAST_MS);
    };
    window.addEventListener("last-summon-craft-toast", onCraftToast);
    return () => window.removeEventListener("last-summon-craft-toast", onCraftToast);
  }, []);

  useEffect(() => {
    const onChestOpen = (e: Event) => {
      const d = (e as CustomEvent<{ chestId?: string; chestX?: number; chestY?: number }>)
        .detail;
      if (!d?.chestId || typeof d.chestId !== "string") return;
      const chestX =
        typeof d.chestX === "number" && Number.isFinite(d.chestX) ? d.chestX : 0;
      const chestY =
        typeof d.chestY === "number" && Number.isFinite(d.chestY) ? d.chestY : 0;
      setJournalOpen(false);
      setLoreJournalOpen(false);
      setAchievementsOpen(false);
      setSettingsOpen(false);
      setLoadGameOverlayOpen(false);
      setSaveGameOverlayOpen(false);
      setInventoryOpen(false);
      setChestOpen({ chestId: d.chestId, chestX, chestY });
    };
    window.addEventListener("last-summon-chest-open", onChestOpen);
    return () =>
      window.removeEventListener("last-summon-chest-open", onChestOpen);
  }, []);

  useEffect(() => {
    const onReadableBook = (e: Event) => {
      const d = (e as CustomEvent<{ curatedId?: string }>).detail;
      const cid = typeof d?.curatedId === "string" ? d.curatedId.trim() : "";
      if (!cid) return;
      const book = getReadableBookForItem(cid);
      if (!book) return;
      setJournalOpen(false);
      setLoreJournalOpen(false);
      setAchievementsOpen(false);
      setSettingsOpen(false);
      setLoadGameOverlayOpen(false);
      setSaveGameOverlayOpen(false);
      setInventoryOpen(false);
      setChestOpen(null);
      setCraftOpen(null);
      setReadableBook({ title: book.title, body: book.body });
    };
    window.addEventListener(READABLE_BOOK_OPEN_EVENT, onReadableBook);
    return () =>
      window.removeEventListener(READABLE_BOOK_OPEN_EVENT, onReadableBook);
  }, []);

  useEffect(() => {
    const onCraftOpen = (e: Event) => {
      const d = (
        e as CustomEvent<{ stationId?: string; label?: string }>
      ).detail;
      if (!d?.stationId || typeof d.stationId !== "string") return;
      const label =
        typeof d.label === "string" && d.label.trim().length > 0
          ? d.label.trim()
          : "Крафт";
      setJournalOpen(false);
      setLoreJournalOpen(false);
      setAchievementsOpen(false);
      setSettingsOpen(false);
      setLoadGameOverlayOpen(false);
      setSaveGameOverlayOpen(false);
      setInventoryOpen(false);
      setChestOpen(null);
      setCraftOpen({ stationId: d.stationId, label });
    };
    window.addEventListener("last-summon-craft-open", onCraftOpen);
    return () =>
      window.removeEventListener("last-summon-craft-open", onCraftOpen);
  }, []);

  useEffect(() => {
    const onBark = (e: Event) => {
      const d = (
        e as CustomEvent<{
          npcId: string;
          displayName?: string;
          text: string;
        }>
      ).detail;
      if (!d?.text?.trim()) return;
      const name = (d.displayName?.trim() || d.npcId).trim();
      setToast(`${name}: ${d.text.trim()}`);
      window.setTimeout(() => setToast(null), 2800);
    };
    window.addEventListener("last-summon-npc-bark", onBark);
    return () => window.removeEventListener("last-summon-npc-bark", onBark);
  }, []);

  useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F10") {
        e.preventDefault();
        setDevHud((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const toggleInventory = useCallback(() => {
    setJournalOpen(false);
    setLoreJournalOpen(false);
    setAchievementsOpen(false);
    setSettingsOpen(false);
    setLoadGameOverlayOpen(false);
    setSaveGameOverlayOpen(false);
    setInventoryOpen((v) => !v);
  }, []);

  const toggleJournal = useCallback(() => {
    setInventoryOpen(false);
    setLoreJournalOpen(false);
    setAchievementsOpen(false);
    setSettingsOpen(false);
    setLoadGameOverlayOpen(false);
    setSaveGameOverlayOpen(false);
    setJournalOpen((v) => !v);
  }, []);

  const toggleLoreJournal = useCallback(() => {
    setInventoryOpen(false);
    setJournalOpen(false);
    setAchievementsOpen(false);
    setSettingsOpen(false);
    setLoadGameOverlayOpen(false);
    setSaveGameOverlayOpen(false);
    setLoreJournalOpen((v) => !v);
  }, []);

  const toggleAchievements = useCallback(() => {
    setInventoryOpen(false);
    setJournalOpen(false);
    setLoreJournalOpen(false);
    setSettingsOpen(false);
    setLoadGameOverlayOpen(false);
    setSaveGameOverlayOpen(false);
    setAchievementsOpen((v) => !v);
  }, []);

  const toggleSettings = useCallback(() => {
    setInventoryOpen(false);
    setJournalOpen(false);
    setLoreJournalOpen(false);
    setAchievementsOpen(false);
    setLoadGameOverlayOpen(false);
    setSaveGameOverlayOpen(false);
    setSettingsOpen((v) => !v);
  }, []);

  const closeWorldQuickMenu = useCallback(() => setWorldQuickMenuOpen(false), []);

  const runQuickSave = useCallback(async () => {
    const r = await saveProfileNow();
    window.dispatchEvent(
      new CustomEvent("last-summon-toast", {
        detail: {
          message: r.ok
            ? "Игра сохранена."
            : (r.error ?? "Не удалось сохранить."),
        },
      })
    );
  }, []);

  const handleLoadGameApplied = useCallback(() => {
    setEngineRemountKey((k) => k + 1);
    useQuestStore.getState().ingestEvent({ type: "reevaluate" });
  }, []);

  const runQuickLoad = useCallback(async () => {
    const slot = useSaveSlotsStore.getState().slots[0];
    if (!slot) {
      window.dispatchEvent(
        new CustomEvent("last-summon-toast", {
          detail: { message: "Нет автосохранения в слоте 0." },
        })
      );
      return;
    }
    if (
      !window.confirm(
        "Загрузить автосохранение (слот 0)? Несохранённый прогресс текущей сессии будет потерян."
      )
    ) {
      return;
    }
    const r = await applySaveSlotPayload(slot);
    if (!r.ok) {
      window.dispatchEvent(
        new CustomEvent("last-summon-toast", {
          detail: {
            message: r.error ?? "Не удалось загрузить автосохранение.",
          },
        })
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent("last-summon-toast", {
        detail: { message: "Загружено автосохранение (слот 0)." },
      })
    );
    handleLoadGameApplied();
  }, [handleLoadGameApplied]);

  const worldMenuHotkeysRef = useRef<WorldMenuHotkeysRef | null>(null);
  worldMenuHotkeysRef.current = {
    dungeonMapOpen,
    forestMapOpen,
    dialogue,
    modalLockInput,
    toggleInventory,
    toggleJournal,
    toggleLoreJournal,
    toggleAchievements,
    toggleSettings,
    runQuickSave,
    runQuickLoad,
  };

  const closeSleep = useCallback(() => setSleepOpen(false), []);

  const closeDungeonMap = useCallback(() => setDungeonMapOpen(false), []);
  const closeForestMap = useCallback(() => setForestMapOpen(false), []);

  useEffect(() => {
    if (preview) return;
    const syncFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === gameFrameRef.current);
    };
    syncFullscreenState();
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("fullscreenerror", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("fullscreenerror", syncFullscreenState);
    };
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    let prevLoc = useGameStore.getState().currentLocationId;
    return useGameStore.subscribe((s) => {
      const loc = s.currentLocationId;
      if (loc === prevLoc) return;
      prevLoc = loc;
      if (loc !== "dungeon") setDungeonMapOpen(false);
      if (loc !== "forest") setForestMapOpen(false);
    });
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      const h = worldMenuHotkeysRef.current;
      if (!h) return;
      if (e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      if (h.dungeonMapOpen || h.forestMapOpen) return;
      if (gameRootBlocksWorldMenuHotkeys(h.modalLockInput, h.dialogue !== null))
        return;
      if (e.code === "KeyI") {
        e.preventDefault();
        h.toggleInventory();
      }
      if (e.code === "KeyJ") {
        e.preventDefault();
        h.toggleJournal();
      }
      if (e.code === "KeyK") {
        e.preventDefault();
        h.toggleLoreJournal();
      }
      if (e.code === "KeyH") {
        e.preventDefault();
        h.toggleAchievements();
      }
      if (e.code === "KeyO") {
        e.preventDefault();
        h.toggleSettings();
      }
      if (e.code === "KeyZ") {
        e.preventDefault();
        const r = canAttemptSleepChannel();
        if (!r.ok) {
          window.dispatchEvent(
            new CustomEvent("last-summon-toast", {
              detail: {
                message:
                  r.reason === "wrong_location"
                    ? "Отдохнуть можно в деревне, в лесу или на дороге за деревней."
                    : "Нельзя открыть отдых.",
              },
            })
          );
          return;
        }
        setSleepOpen(true);
      }
      if (e.code === "KeyM") {
        e.preventDefault();
        const loc = useGameStore.getState().currentLocationId;
        if (loc === "dungeon") {
          setForestMapOpen(false);
          setDungeonMapOpen((v) => !v);
        } else if (loc === "forest") {
          setDungeonMapOpen(false);
          setForestMapOpen((v) => !v);
        } else {
          window.dispatchEvent(
            new CustomEvent("last-summon-toast", {
              detail: {
                message:
                  "Мини-карта доступна в лесу и в катакомбах (клавиша M).",
              },
            })
          );
        }
      }
      if (e.code === "F5") {
        e.preventDefault();
        void h.runQuickSave();
      }
      if (e.code === "F9") {
        e.preventDefault();
        void h.runQuickLoad();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      if (dialogue !== null) return;
      if (worldQuickMenuOpen) {
        e.preventDefault();
        setWorldQuickMenuOpen(false);
        return;
      }
      if (computeGameRootModalLike(modalLockInput)) return;
      e.preventDefault();
      setWorldQuickMenuOpen(true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [preview, dialogue, worldQuickMenuOpen, modalLockInput]);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let unmount: (() => void) | undefined;
    void waitForQuestStoreHydration()
      .then(() => {
        if (!cancelled) unmount = mountQuestEventBridge();
      })
      .catch((e) => {
        console.warn("[GameRoot] quest store hydration", e);
      });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    let unmount: (() => void) | undefined;
    void waitForLoreJournalHydration()
      .then(() => {
        if (!cancelled) unmount = mountLoreJournalEventBridge();
      })
      .catch((e) => {
        console.warn("[GameRoot] lore journal hydration", e);
      });
    return () => {
      cancelled = true;
      unmount?.();
    };
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    void waitForSaveSlotsHydration().catch(() => {
      /* ignore */
    });
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    setAchievementQuestCompletedCountSource(() =>
      useQuestStore.getState().completedQuestIds.length
    );
    const onAch = () => {
      useGameStore.getState().flushAchievements();
    };
    window.addEventListener("last-summon-achievements-reevaluate", onAch);
    return () => {
      window.removeEventListener("last-summon-achievements-reevaluate", onAch);
    };
  }, [preview]);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void waitForGameStoreHydration()
      .then(() => {
        if (cancelled) return;
        setGameStoreHydrated(true);
        const o = useGameStore.getState().isekaiOrigin;
        if (o && o.completed === false) setIsekaiOpen(true);
      })
      .catch((e) => {
        console.warn("[GameRoot] game store hydration", e);
      });
    return () => {
      cancelled = true;
    };
  }, [preview]);

  useEffect(() => {
    if (preview || !isElectronClient()) return;
    const onBeforeUnload = () => {
      void flushElectronProfileWrites();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        void flushElectronProfileWrites();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      void flushElectronProfileWrites();
    };
  }, [preview]);

  const handleOpeningCutsceneDone = useCallback(() => {
    markOpeningCutsceneScriptCurrent();
    setOpeningCutsceneOpen(false);
    useQuestStore.getState().ingestEvent({ type: "reevaluate" });
  }, [markOpeningCutsceneScriptCurrent]);

  /** Первый клик по полю имени не должен «съедаться» фокусом Phaser: снять фокус с canvas/хоста. */
  useEffect(() => {
    if (preview || !openingCutsceneOpen) return;
    const host = hostRef.current;
    const ae = document.activeElement;
    if (!(ae instanceof HTMLElement)) return;
    if (
      ae.classList.contains("last-summon-phaser-root") ||
      (host?.contains(ae) ?? false)
    ) {
      ae.blur();
    }
  }, [preview, openingCutsceneOpen]);

  useEffect(() => {
    if (preview || !gameStoreHydrated) return;
    if (openingCutsceneScriptVersion >= OPENING_CUTSCENE_SCRIPT_VERSION) return;
    if (isekaiOpen) return;
    queueMicrotask(() => {
      setOpeningCutsceneOpen(true);
    });
  }, [
    preview,
    gameStoreHydrated,
    isekaiOpen,
    openingCutsceneScriptVersion,
  ]);

  /** С главной: «Загрузка» — открыть панель слотов после гидрации (оверлей может быть под прологом, z-index). */
  useEffect(() => {
    if (preview || !gameStoreHydrated) return;
    let cancelled = false;
    if (typeof window === "undefined") return;
    let wantOpen = false;
    try {
      wantOpen = sessionStorage.getItem(OPEN_LOAD_GAME_PANEL_SESSION_KEY) === "1";
    } catch {
      return;
    }
    if (!wantOpen) return;

    void waitForSaveSlotsHydration()
      .then(() => {
        if (cancelled) return;
        let stillWant = false;
        try {
          stillWant =
            sessionStorage.getItem(OPEN_LOAD_GAME_PANEL_SESSION_KEY) === "1";
        } catch {
          return;
        }
        if (!stillWant) return;
        try {
          sessionStorage.removeItem(OPEN_LOAD_GAME_PANEL_SESSION_KEY);
        } catch {
          /* ignore */
        }
        setSaveGameOverlayOpen(false);
        setLoadGameOverlayOpen(true);
      })
      .catch((e) => {
        console.warn("[GameRoot] open load panel from home", e);
      });

    return () => {
      cancelled = true;
    };
  }, [preview, gameStoreHydrated]);

  useEffect(() => {
    if (preview) return;
    const blockHotbarInput = () => modalLike || dialogue !== null;
    const onWheel = (e: WheelEvent) => {
      if (blockHotbarInput()) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      if (e.deltaY === 0) return;
      e.preventDefault();
      useGameStore.getState().nudgeHotbarSelection(e.deltaY > 0 ? 1 : -1);
      window.dispatchEvent(new CustomEvent(HOTBAR_WHEEL_NUDGE_EVENT));
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener("wheel", onWheel, { capture: true } as AddEventListenerOptions);
    };
  }, [preview, modalLike, dialogue]);

  useEffect(() => {
    if (preview) return;
    const blockHotbarInput = () => modalLike || dialogue !== null;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      if (blockHotbarInput()) return;
      if (e.code === "KeyF") {
        e.preventDefault();
        const idx = useGameStore.getState().hotbarSelectedIndex;
        const r = useGameStore.getState().useConsumableAt(idx);
        if (!r.ok && r.reason) {
          window.dispatchEvent(
            new CustomEvent("last-summon-toast", {
              detail: { message: r.reason },
            })
          );
        }
        return;
      }
      if (e.code >= "Digit1" && e.code <= "Digit9") {
        const digit = e.code.charCodeAt(5) - 48;
        if (digit >= 1 && digit <= HOTBAR_SLOT_COUNT) {
          e.preventDefault();
          const idx = digit - 1;
          const gs = useGameStore.getState();
          const stack = gs.inventorySlots[idx];
          const canUseHotbarNumber =
            !!stack &&
            stack.qty > 0 &&
            hotbarItemIsImmediatelyUsable(stack.curatedId);

          if (canUseHotbarNumber) {
            const r = gs.useConsumableAt(idx);
            if (!r.ok && r.reason) {
              window.dispatchEvent(
                new CustomEvent("last-summon-toast", {
                  detail: { message: r.reason },
                })
              );
            }
          }
          gs.setHotbarSelectedIndex(idx);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [preview, modalLike, dialogue]);

  useEffect(() => {
    if (preview) return;
    const onDungeonPick = (ev: Event) => {
      const d = (ev as CustomEvent<{ spawnId?: string }>).detail;
      const sid =
        typeof d?.spawnId === "string" && d.spawnId.trim().length > 0
          ? d.spawnId.trim()
          : "from_town";
      setDungeonPicker({ open: true, spawnId: sid });
    };
    window.addEventListener("last-summon-dungeon-pick-request", onDungeonPick);
    return () =>
      window.removeEventListener("last-summon-dungeon-pick-request", onDungeonPick);
  }, [preview]);

  useEffect(() => {
    const open = (e: Event) => {
      const d = (e as CustomEvent<HeroThoughtOpen>).detail;
      const title = typeof d?.title === "string" ? d.title.trim() : "";
      const lines = Array.isArray(d?.lines)
        ? d.lines.filter((x) => typeof x === "string" && x.trim())
        : [];
      if (!title || lines.length === 0) return;
      setInventoryOpen(false);
      setJournalOpen(false);
      setLoreJournalOpen(false);
      setAchievementsOpen(false);
      setSettingsOpen(false);
      setLoadGameOverlayOpen(false);
      setSaveGameOverlayOpen(false);
      setShopOpen(null);
      setHeroThought({ title, lines });
    };
    window.addEventListener("last-summon-hero-thought-open", open);
    return () =>
      window.removeEventListener("last-summon-hero-thought-open", open);
  }, []);

  useEffect(() => {
    const open = (e: Event) => {
      const ce = e as CustomEvent<{
        npcId: string;
        displayName?: string;
        scriptedScenes?: ReadonlyArray<NpcDialogueScene>;
      }>;
      const { npcId, displayName, scriptedScenes } = ce.detail ?? {};
      if (!npcId) return;

      const gs = useGameStore.getState();
      if (gs.isekaiOrigin.completed === false) return;
      if (gs.openingCutsceneScriptVersion < OPENING_CUTSCENE_SCRIPT_VERSION) {
        return;
      }

      setInventoryOpen(false);
      setJournalOpen(false);
      setLoreJournalOpen(false);
      setAchievementsOpen(false);
      setSettingsOpen(false);
      setLoadGameOverlayOpen(false);
      setSaveGameOverlayOpen(false);
      setShopOpen(null);

      window.dispatchEvent(
        new CustomEvent("last-summon:dialogue-open", {
          detail: { npcId, displayName, scriptedScenes },
        })
      );
      setDialogue({
        npcId,
        displayName,
        ...(scriptedScenes?.length ? { scriptedScenes } : {}),
      });
      window.dispatchEvent(new CustomEvent("npc-dialogue-open"));
    };
    window.addEventListener("npc-interact-open", open);
    return () => window.removeEventListener("npc-interact-open", open);
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    void import("@/src/game/load/assetSliceOverridesRuntime").then((m) => {
      if (cancelled) return;
      cleanup = m.subscribeAssetSliceOverridesSaved(() => phaserGameRef.current);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const gameWidth = preview ? WORLD.width : playDims.width;
    const gameHeight = preview ? WORLD.height : playDims.height;

    let game: import("phaser").Game | undefined;
    let crispOnResize: (() => void) | undefined;
    /**
     * React Strict Mode и HMR вызывают cleanup до того, как async-импорт Phaser
     * успеет завершиться. Без этого флага в памяти одновременно висело бы два
     * экземпляра Phaser.Game с дублирующимися слушателями window (keydown,
     * last-summon-modal-*, blur, respawn-player), и урон/события срабатывали
     * дважды.
     */
    let cancelled = false;

    void (async () => {
      const Phaser = await import("phaser");
      const { BootScene } = await import("@/src/game/scenes/BootScene");
      const { MainScene } = await import("@/src/game/scenes/MainScene");

      if (cancelled) return;

      const audioContext = getSharedPhaserAudioContext();

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        width: gameWidth,
        height: gameHeight,
        backgroundColor: "#1a1a1a",
        audio: {
          context: audioContext,
        },
        physics: {
          default: "arcade",
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        render: {
          pixelArt: true,
          antialias: false,
          antialiasGL: false,
          roundPixels: true,
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
          // Целочисленный CSS-размер canvas — меньше дробного масштаба → меньше «каши» у браузера.
          autoRound: true,
        },
        scene: [BootScene, MainScene],
      });
      phaserGameRef.current = game;

      crispOnResize = () => {
        Phaser.Display.Canvas.CanvasInterpolation.setCrisp(
          game.canvas as HTMLCanvasElement
        );
      };
      crispOnResize();
      game.scale.on("resize", crispOnResize);
    })().catch((e) => {
      console.error("[GameRoot] Phaser init", e);
    });

    return () => {
      cancelled = true;
      if (game && crispOnResize) {
        game.scale.off("resize", crispOnResize);
      }
      phaserGameRef.current = null;
      game?.destroy(true);
      game = undefined;
    };
  }, [preview, playDims.width, playDims.height, engineRemountKey]);

  const worldQuickMenuMotion = useMemo(
    () =>
      Array.from({ length: WORLD_QUICK_MENU_ITEM_COUNT }, (_, i) =>
        worldQuickMenuItemMotion(worldQuickMenuOpen, i)
      ),
    [worldQuickMenuOpen]
  );

  const fillGameViewport =
    !preview && (isFullscreen || electronClient);

  return (
    <div
      ref={gameFrameRef}
      style={{ cursor: GAME_SHELL_CURSOR_CSS }}
      className={
        preview
          ? "relative inline-block"
          : fillGameViewport
            ? electronClient && !isFullscreen
              ? "relative flex h-full min-h-0 w-full flex-1 flex-col bg-black"
              : "relative h-screen w-screen bg-black"
            : "relative inline-block"
      }
    >
      <GameHud preview={preview} />
      {!preview ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-50">
          <div className="relative flex flex-col items-end">
            <div
              id="world-quick-menu"
              className={`absolute bottom-full right-0 mb-2 flex flex-col items-end gap-2 ${
                worldQuickMenuOpen ? "pointer-events-auto" : "pointer-events-none"
              }`}
              aria-hidden={!worldQuickMenuOpen}
              inert={worldQuickMenuOpen ? undefined : true}
            >
              <button
                type="button"
                onClick={() => {
                  closeWorldQuickMenu();
                  window.dispatchEvent(
                    new CustomEvent("last-summon-request-goto-location", {
                      detail: {
                        locationId: "town",
                        spawnId: "default",
                        reviveIfDead: true,
                      },
                    })
                  );
                }}
                className={`${worldQuickMenuMotion[0].className} rounded-lg border border-sky-700 bg-sky-950/90 px-3 py-2 text-left text-xs font-medium text-sky-100 shadow-md backdrop-blur-sm hover:bg-sky-900/90`}
                style={worldQuickMenuMotion[0].style}
                title="Появиться у дороги в городе (без штрафа опыта)"
              >
                Respawn
              </button>
              <button
                type="button"
                onClick={() => {
                  closeWorldQuickMenu();
                  toggleInventory();
                }}
                className={`${worldQuickMenuMotion[1].className} rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2 text-left text-xs font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800`}
                style={worldQuickMenuMotion[1].style}
              >
                Инвентарь
                <span className="ml-2 font-mono text-[10px] text-zinc-500">
                  I
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  closeWorldQuickMenu();
                  toggleJournal();
                }}
                className={`${worldQuickMenuMotion[2].className} rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2 text-left text-xs font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800`}
                style={worldQuickMenuMotion[2].style}
              >
                Квесты
                <span className="ml-2 font-mono text-[10px] text-zinc-500">
                  J
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  closeWorldQuickMenu();
                  toggleLoreJournal();
                }}
                className={`${worldQuickMenuMotion[3].className} rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2 text-left text-xs font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800`}
                style={worldQuickMenuMotion[3].style}
              >
                Дневник знаний
                <span className="ml-2 font-mono text-[10px] text-zinc-500">
                  K
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  closeWorldQuickMenu();
                  toggleAchievements();
                }}
                className={`${worldQuickMenuMotion[4].className} rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2 text-left text-xs font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800`}
                style={worldQuickMenuMotion[4].style}
              >
                Достижения
                <span className="ml-2 font-mono text-[10px] text-zinc-500">
                  H
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  closeWorldQuickMenu();
                  toggleSettings();
                }}
                className={`${worldQuickMenuMotion[5].className} rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2 text-left text-xs font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800`}
                style={worldQuickMenuMotion[5].style}
              >
                Настройки
                <span className="ml-2 font-mono text-[10px] text-zinc-500">
                  O
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  closeWorldQuickMenu();
                  void runQuickSave();
                }}
                className={`${worldQuickMenuMotion[6].className} rounded-lg border border-amber-800/90 bg-amber-950/90 px-3 py-2 text-left text-xs font-medium text-amber-100 shadow-md backdrop-blur-sm hover:bg-amber-900/90`}
                style={worldQuickMenuMotion[6].style}
                title="Быстрое сохранение (F5)"
              >
                Сохранить
                <span className="ml-2 font-mono text-[10px] text-amber-200/80">
                  F5
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  closeWorldQuickMenu();
                  setLoadGameOverlayOpen(false);
                  setSaveGameOverlayOpen(true);
                }}
                className={`${worldQuickMenuMotion[7].className} rounded-lg border border-teal-800/90 bg-teal-950/90 px-3 py-2 text-left text-xs font-medium text-teal-100 shadow-md backdrop-blur-sm hover:bg-teal-900/90`}
                style={worldQuickMenuMotion[7].style}
                title="Записать текущую игру в ручной слот 1–4"
              >
                Сохранить в слот…
              </button>
              <button
                type="button"
                onClick={() => {
                  closeWorldQuickMenu();
                  setSaveGameOverlayOpen(false);
                  setLoadGameOverlayOpen(true);
                }}
                className={`${worldQuickMenuMotion[8].className} rounded-lg border border-violet-800/90 bg-violet-950/90 px-3 py-2 text-left text-xs font-medium text-violet-100 shadow-md backdrop-blur-sm hover:bg-violet-900/90`}
                style={worldQuickMenuMotion[8].style}
                title="Загрузить из любого заполненного слота"
              >
                Загрузить
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                onClick={() => closeWorldQuickMenu()}
                className={`${worldQuickMenuMotion[9].className} inline-block rounded-lg border border-emerald-800 bg-emerald-950/90 px-3 py-2 text-left text-xs font-medium text-emerald-100 shadow-md backdrop-blur-sm hover:bg-emerald-900/90`}
                style={worldQuickMenuMotion[9].style}
              >
                Меню
              </a>
            </div>
            <button
              type="button"
              onClick={() => setWorldQuickMenuOpen((v) => !v)}
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border border-amber-700/90 bg-zinc-900/95 text-lg font-semibold text-amber-100 shadow-lg backdrop-blur-sm transition-colors hover:border-amber-600 hover:bg-zinc-800"
              aria-expanded={worldQuickMenuOpen}
              aria-controls="world-quick-menu"
              title="Игровое меню (Escape): инвентарь, F5/F9 сохранение и загрузка…"
            >
              ?
            </button>
          </div>
        </div>
      ) : null}
      {!preview && devHud ? <DevHud /> : null}
      {craftToasts.length > 0 ? (
        <div
          className="pointer-events-none absolute bottom-14 left-1/2 z-[120] flex max-w-md -translate-x-1/2 flex-col gap-1"
          role="status"
          aria-live="polite"
        >
          {craftToasts.map((t) => (
            <p
              key={t.id}
              className="rounded-md border border-emerald-800 bg-zinc-950/95 px-3 py-1.5 text-center text-[11px] leading-snug text-emerald-100 shadow-lg"
            >
              {t.message}
            </p>
          ))}
        </div>
      ) : null}
      {toast ? (
        <p
          className={`pointer-events-none absolute left-1/2 z-[120] max-w-md -translate-x-1/2 rounded-md border border-emerald-800 bg-zinc-950/95 px-3 py-2 text-center text-xs text-emerald-100 shadow-lg ${
            craftToasts.length > 0 ? "bottom-36" : "bottom-14"
          }`}
          role="status"
        >
          {toast}
        </p>
      ) : null}
      <div
        className={
          preview
            ? "relative inline-block overflow-hidden rounded-lg border border-zinc-700 bg-black"
            : fillGameViewport
              ? electronClient && !isFullscreen
                ? "relative flex min-h-0 w-full flex-1 flex-col items-center justify-center overflow-hidden bg-black"
                : "relative flex h-screen w-screen flex-col items-center justify-center overflow-hidden bg-black"
              : "relative w-full max-w-full overflow-hidden rounded-lg border border-zinc-700 bg-black"
        }
        style={
          !preview && !fillGameViewport
            ? {
                maxWidth: playDims.width,
                maxHeight: `min(88vh, ${playDims.height}px)`,
                aspectRatio: `${playDims.width} / ${playDims.height}`,
              }
            : undefined
        }
      >
        <div
          className={
            fillGameViewport
              ? "relative aspect-video h-full max-h-full w-full max-w-full overflow-hidden bg-black"
              : "contents"
          }
        >
        <div
          ref={hostRef}
          tabIndex={0}
          role="application"
          aria-label="Игровая сцена"
          inert={openingCutsceneOpen}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            if (openingCutsceneOpen) return;
            hostRef.current?.focus({ preventScroll: true });
          }}
          className={`last-summon-phaser-root ${
            openingCutsceneOpen ? "pointer-events-none" : ""
          } ${
            preview
              ? "overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-amber-600/50"
              : fillGameViewport
                ? "absolute inset-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-amber-600/50"
                : "h-full w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-amber-600/50"
          }`}
        />
        {!preview ? <HotbarHud /> : null}
        {deathModalOpen ? (
          <div
            className="pointer-events-auto absolute inset-0 z-[200] flex items-center justify-center bg-black/75 p-4"
            role="presentation"
          >
            <div
              className="paper-pixelated max-h-[min(78vh,560px)] w-full max-w-lg overflow-hidden rounded-sm border-2 border-[#7f1d1d] bg-[#1c1917]/98 shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
              role="dialog"
              aria-modal="true"
              aria-labelledby="death-modal-title"
            >
              <div className="border-b-2 border-[#7f1d1d]/80 bg-[#292524] px-4 py-2.5">
                <h2
                  id="death-modal-title"
                  className="text-center text-[13px] font-bold tracking-wide text-[#fecaca]"
                >
                  Вы без сознания
                </h2>
              </div>
              <div className="max-h-[min(60vh,420px)] overflow-y-auto px-4 py-3">
                <p className="whitespace-pre-wrap text-left text-[12px] leading-relaxed text-[#e7e5e4]">
                  {deathModalMessage}
                </p>
              </div>
              <div className="flex justify-center border-t border-[#44403c] bg-[#1c1917] px-4 py-3">
                <PaperButton
                  ref={deathModalCloseRef}
                  type="button"
                  variant="accent"
                  className="min-w-[8rem] px-4 py-1.5 text-[11px]"
                  onClick={() => setDeathModalMessage(null)}
                >
                  Понятно
                </PaperButton>
              </div>
            </div>
          </div>
        ) : null}
        <InventoryOverlay
          open={!preview && inventoryOpen}
          onClose={() => setInventoryOpen(false)}
        />
        <ChestStorageOverlay
          open={!preview && chestOpen !== null}
          chestId={chestOpen?.chestId ?? null}
          chestX={chestOpen?.chestX ?? 0}
          chestY={chestOpen?.chestY ?? 0}
          onClose={() => {
            const cur = chestOpen;
            if (cur && isDeathCorpseChestId(cur.chestId)) {
              useGameStore
                .getState()
                .finalizeDeathCorpseChest(
                  deathCorpseDropIdFromChestId(cur.chestId)
                );
              window.dispatchEvent(
                new CustomEvent(RESYNC_CORPSE_PICKUPS_EVENT)
              );
            }
            setChestOpen(null);
          }}
        />
        <CraftOverlay
          open={!preview && craftOpen !== null}
          stationId={craftOpen?.stationId ?? ""}
          stationLabel={craftOpen?.label ?? ""}
          onClose={() => setCraftOpen(null)}
        />
        <QuestJournalOverlay
          open={!preview && journalOpen}
          onClose={() => setJournalOpen(false)}
        />
        <LoreJournalOverlay
          open={!preview && loreJournalOpen}
          onClose={() => setLoreJournalOpen(false)}
        />
        <ReadableBookOverlay
          open={!preview && readableBook !== null}
          title={readableBook?.title ?? ""}
          body={readableBook?.body ?? ""}
          onClose={() => setReadableBook(null)}
        />
        <AchievementsTreeOverlay
          open={!preview && achievementsOpen}
          onClose={() => setAchievementsOpen(false)}
        />
        <SettingsOverlay
          open={!preview && settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
        <LoadGameOverlay
          open={!preview && loadGameOverlayOpen}
          onClose={() => setLoadGameOverlayOpen(false)}
          onAfterLoadSuccess={handleLoadGameApplied}
        />
        <SaveGameOverlay
          open={!preview && saveGameOverlayOpen}
          onClose={() => setSaveGameOverlayOpen(false)}
        />
        {!preview && shopOpen ? (
          <ShopOverlay
            open
            shopId={shopOpen.shopId}
            shopTitle={shopOpen.shopTitle}
            onClose={() => {
              setShopOpen(null);
            }}
          />
        ) : null}
        </div>
      </div>
      {!preview ? <QuestToast /> : null}
      {!preview && heroThought ? (
        <HeroThoughtOverlay
          key={`${heroThought.title}:${heroThought.lines.join("|")}`}
          thought={heroThought}
          onClose={() => setHeroThought(null)}
        />
      ) : null}
      {dialogue ? (
        <DialogueOverlay
          npcId={dialogue.npcId}
          displayName={dialogue.displayName}
          scriptedScenes={dialogue.scriptedScenes}
          onOpenShop={() => {
            const shop = getShopByNpc(dialogue.npcId);
            if (!shop) return;
            window.dispatchEvent(
              new CustomEvent("npc-dialogue-close", {
                detail: { npcId: dialogue.npcId },
              })
            );
            window.dispatchEvent(
              new CustomEvent("last-summon:dialogue-close", {
                detail: { npcId: dialogue.npcId },
              })
            );
            setDialogue(null);
            setShopOpen({
              shopId: shop.id,
              npcId: dialogue.npcId,
              shopTitle: shop.title,
              displayName: dialogue.displayName,
            });
          }}
          onClose={() => setDialogue(null)}
        />
      ) : null}
      {!preview && isekaiOpen ? (
        <IsekaiOriginOverlay onComplete={() => setIsekaiOpen(false)} />
      ) : null}
      {!preview && openingCutsceneOpen ? (
        <OpeningCutsceneOverlay
          open
          onComplete={handleOpeningCutsceneDone}
        />
      ) : null}
      {!preview && levelStatAllocOpen ? <LevelStatOverlay /> : null}
      {!preview && dungeonPicker.open ? (
        <DungeonFloorPickerOverlay
          open
          spawnId={dungeonPicker.spawnId}
          onClose={() =>
            setDungeonPicker({ open: false, spawnId: "from_town" })
          }
        />
      ) : null}
      {!preview && sleepOpen ? (
        <SleepOverlay open onClose={closeSleep} />
      ) : null}
      {!preview && dungeonMapOpen ? (
        <DungeonMapOverlay open onClose={closeDungeonMap} />
      ) : null}
      {!preview && forestMapOpen ? (
        <ForestMapOverlay open onClose={closeForestMap} />
      ) : null}

    </div>
  );
}
