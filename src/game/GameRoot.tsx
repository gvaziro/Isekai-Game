"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getShopByNpc } from "@/src/game/data/shops";
import DialogueOverlay, {
  type DialogueScriptedOpener,
} from "@/src/game/ui/DialogueOverlay";
import GameHud from "@/src/game/ui/GameHud";
import ChestStorageOverlay from "@/src/game/ui/ChestStorageOverlay";
import CraftOverlay from "@/src/game/ui/CraftOverlay";
import InventoryOverlay from "@/src/game/ui/InventoryOverlay";
import QuestJournalOverlay from "@/src/game/ui/QuestJournalOverlay";
import AchievementsTreeOverlay from "@/src/game/ui/AchievementsTreeOverlay";
import QuestToast from "@/src/game/ui/QuestToast";
import SettingsOverlay from "@/src/game/ui/SettingsOverlay";
import ShopOverlay from "@/src/game/ui/ShopOverlay";
import IsekaiOriginOverlay from "@/src/game/ui/IsekaiOriginOverlay";
import DungeonFloorPickerOverlay from "@/src/game/ui/DungeonFloorPickerOverlay";
import SleepOverlay from "@/src/game/ui/SleepOverlay";
import DungeonMapOverlay from "@/src/game/ui/DungeonMapOverlay";
import ForestMapOverlay from "@/src/game/ui/ForestMapOverlay";
import LevelStatOverlay from "@/src/game/ui/LevelStatOverlay";
import HotbarHud from "@/src/game/ui/HotbarHud";
import {
  DEATH_MODAL_EVENT,
  deathCorpseDropIdFromChestId,
  HOTBAR_SLOT_COUNT,
  HOTBAR_WHEEL_NUDGE_EVENT,
  isDeathCorpseChestId,
  PLAY_VIEWPORT_HEIGHT,
  PLAY_VIEWPORT_WIDTH,
  RESYNC_CORPSE_PICKUPS_EVENT,
} from "@/src/game/constants/gameplay";
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
import { subscribeAssetSliceOverridesSaved } from "@/src/game/load/assetSliceOverridesRuntime";
import { hotbarItemIsImmediatelyUsable } from "@/src/game/data/itemRegistry";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";

/** Можно ли открыть отдых (только город / лес — планирование сна и сдвиг времени суток). */
function canAttemptSleepChannel():
  | { ok: true }
  | { ok: false; reason: "wrong_location" } {
  const st = useGameStore.getState();
  if (st.currentLocationId !== "town" && st.currentLocationId !== "forest") {
    return { ok: false, reason: "wrong_location" };
  }
  return { ok: true };
}

type DialogueOpen = {
  npcId: string;
  displayName?: string;
  scriptedOpeners?: ReadonlyArray<DialogueScriptedOpener>;
};

type NpcInteractOpen = DialogueOpen;

type ShopOpenState = {
  shopId: string;
  npcId: string;
  shopTitle: string;
  displayName?: string;
};

function readPreviewFlag(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("preview") === "1";
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
        Dev (F9)
      </div>
      <div>
        x: {Math.round(player.x)} · y: {Math.round(player.y)}
      </div>
      <div className="text-zinc-500">save v{saveVersion} · nagibatop-save-v1</div>
    </div>
  );
}

export default function GameRoot() {
  const gameFrameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<import("phaser").Game | null>(null);
  const [dialogue, setDialogue] = useState<DialogueOpen | null>(null);
  const [npcInteract, setNpcInteract] = useState<NpcInteractOpen | null>(null);
  const [shopOpen, setShopOpen] = useState<ShopOpenState | null>(null);
  const [preview] = useState(readPreviewFlag);
  const [mapCaptureBusy, setMapCaptureBusy] = useState(false);
  const [mapCaptureNotice, setMapCaptureNotice] = useState<string | null>(null);
  const [devHud, setDevHud] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
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
  const [dungeonPicker, setDungeonPicker] = useState<{
    open: boolean;
    spawnId: string;
  }>({ open: false, spawnId: "from_town" });
  const [sleepOpen, setSleepOpen] = useState(false);
  const [dungeonMapOpen, setDungeonMapOpen] = useState(false);
  const [forestMapOpen, setForestMapOpen] = useState(false);
  const [gameStoreHydrated, setGameStoreHydrated] = useState(false);
  const unspentStatPoints = useGameStore(
    (s) => s.character.unspentStatPoints
  );
  const levelStatAllocOpen =
    !preview && gameStoreHydrated && unspentStatPoints > 0;

  const deathModalOpen = !preview && deathModalMessage !== null;

  const modalLike =
    inventoryOpen ||
    chestOpen !== null ||
    craftOpen !== null ||
    journalOpen ||
    achievementsOpen ||
    settingsOpen ||
    npcInteract !== null ||
    shopOpen !== null ||
    isekaiOpen ||
    dungeonPicker.open ||
    levelStatAllocOpen ||
    sleepOpen ||
    dungeonMapOpen ||
    forestMapOpen ||
    deathModalOpen;

  useEffect(() => {
    if (modalLike) {
      window.dispatchEvent(new CustomEvent("nagibatop-modal-open"));
    } else {
      window.dispatchEvent(new CustomEvent("nagibatop-modal-close"));
    }
  }, [modalLike]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message;
      if (!msg) return;
      setToast(msg);
      window.setTimeout(() => setToast(null), 2800);
    };
    window.addEventListener("nagibatop-toast", onToast);
    return () => window.removeEventListener("nagibatop-toast", onToast);
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
      setCraftToasts([]);
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
    window.addEventListener("nagibatop-craft-toast", onCraftToast);
    return () => window.removeEventListener("nagibatop-craft-toast", onCraftToast);
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
      setAchievementsOpen(false);
      setSettingsOpen(false);
      setInventoryOpen(false);
      setChestOpen({ chestId: d.chestId, chestX, chestY });
    };
    window.addEventListener("nagibatop-chest-open", onChestOpen);
    return () =>
      window.removeEventListener("nagibatop-chest-open", onChestOpen);
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
      setAchievementsOpen(false);
      setSettingsOpen(false);
      setInventoryOpen(false);
      setChestOpen(null);
      setCraftOpen({ stationId: d.stationId, label });
    };
    window.addEventListener("nagibatop-craft-open", onCraftOpen);
    return () =>
      window.removeEventListener("nagibatop-craft-open", onCraftOpen);
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
    window.addEventListener("nagibatop-npc-bark", onBark);
    return () => window.removeEventListener("nagibatop-npc-bark", onBark);
  }, []);

  useEffect(() => {
    if (preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F9") {
        e.preventDefault();
        setDevHud((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  const toggleInventory = useCallback(() => {
    setJournalOpen(false);
    setAchievementsOpen(false);
    setSettingsOpen(false);
    setInventoryOpen((v) => !v);
  }, []);

  const toggleJournal = useCallback(() => {
    setInventoryOpen(false);
    setAchievementsOpen(false);
    setSettingsOpen(false);
    setJournalOpen((v) => !v);
  }, []);

  const toggleAchievements = useCallback(() => {
    setInventoryOpen(false);
    setJournalOpen(false);
    setSettingsOpen(false);
    setAchievementsOpen((v) => !v);
  }, []);

  const toggleSettings = useCallback(() => {
    setInventoryOpen(false);
    setJournalOpen(false);
    setAchievementsOpen(false);
    setSettingsOpen((v) => !v);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (preview) return;
    const el = gameFrameRef.current;
    if (!el || !document.fullscreenEnabled || !el.requestFullscreen) {
      setToast("Полноэкранный режим недоступен в этом браузере.");
      window.setTimeout(() => setToast(null), 2800);
      return;
    }

    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen({ navigationUI: "hide" });
        hostRef.current?.focus({ preventScroll: true });
      }
    } catch (e) {
      console.warn("[GameRoot] fullscreen", e);
      setToast("Браузер не разрешил открыть игру на весь экран.");
      window.setTimeout(() => setToast(null), 2800);
    }
  }, [preview]);

  const closeSleep = useCallback(() => setSleepOpen(false), []);

  const closeDungeonMap = useCallback(() => setDungeonMapOpen(false), []);
  const closeForestMap = useCallback(() => setForestMapOpen(false), []);

  useEffect(() => {
    if (preview) return;
    const syncFullscreenState = () => {
      setFullscreenAvailable(
        Boolean(document.fullscreenEnabled && gameFrameRef.current?.requestFullscreen)
      );
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
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !e.altKey || e.code !== "Enter") return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      e.preventDefault();
      void toggleFullscreen();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [preview, toggleFullscreen]);

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
      if (e.repeat) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [contenteditable=true]")) {
        return;
      }
      if (dungeonMapOpen || forestMapOpen) return;
      if (
        dialogue ||
        npcInteract ||
        shopOpen ||
        isekaiOpen ||
        dungeonPicker.open ||
        levelStatAllocOpen ||
        inventoryOpen ||
        chestOpen !== null ||
        craftOpen !== null ||
        journalOpen ||
        achievementsOpen ||
        settingsOpen ||
        sleepOpen
      )
        return;
      if (e.code === "KeyI") {
        e.preventDefault();
        toggleInventory();
      }
      if (e.code === "KeyJ") {
        e.preventDefault();
        toggleJournal();
      }
      if (e.code === "KeyH") {
        e.preventDefault();
        toggleAchievements();
      }
      if (e.code === "KeyO") {
        e.preventDefault();
        toggleSettings();
      }
      if (e.code === "KeyZ") {
        e.preventDefault();
        const r = canAttemptSleepChannel();
        if (!r.ok) {
          window.dispatchEvent(
            new CustomEvent("nagibatop-toast", {
              detail: {
                message:
                  r.reason === "wrong_location"
                    ? "Отдохнуть можно только в городе или в лесу."
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
            new CustomEvent("nagibatop-toast", {
              detail: {
                message:
                  "Мини-карта доступна в лесу и в катакомбах (клавиша M).",
              },
            })
          );
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [
    preview,
    dungeonMapOpen,
    forestMapOpen,
    dialogue,
    npcInteract,
    shopOpen,
    isekaiOpen,
    dungeonPicker.open,
    levelStatAllocOpen,
    inventoryOpen,
    chestOpen,
    craftOpen,
    journalOpen,
    achievementsOpen,
    settingsOpen,
    sleepOpen,
    toggleInventory,
    toggleJournal,
    toggleAchievements,
    toggleSettings,
  ]);

  useEffect(() => {
    if (preview || !npcInteract) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("npc-dialogue-close", {
            detail: { npcId: npcInteract.npcId },
          })
        );
        setNpcInteract(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [preview, npcInteract]);

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
    setAchievementQuestCompletedCountSource(() =>
      useQuestStore.getState().completedQuestIds.length
    );
    const onAch = () => {
      useGameStore.getState().flushAchievements();
    };
    window.addEventListener("nagibatop-achievements-reevaluate", onAch);
    return () => {
      window.removeEventListener("nagibatop-achievements-reevaluate", onAch);
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
            new CustomEvent("nagibatop-toast", {
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
                new CustomEvent("nagibatop-toast", {
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
    window.addEventListener("nagibatop-dungeon-pick-request", onDungeonPick);
    return () =>
      window.removeEventListener("nagibatop-dungeon-pick-request", onDungeonPick);
  }, [preview]);

  useEffect(() => {
    const open = (e: Event) => {
      const ce = e as CustomEvent<{
        npcId: string;
        displayName?: string;
        scriptedOpeners?: ReadonlyArray<DialogueScriptedOpener>;
      }>;
      const { npcId, displayName, scriptedOpeners } = ce.detail ?? {};
      if (!npcId) return;
      setInventoryOpen(false);
      setJournalOpen(false);
      setAchievementsOpen(false);
      setSettingsOpen(false);
      setShopOpen(null);

      const shop = getShopByNpc(npcId);
      if (shop) {
        setNpcInteract({
          npcId,
          displayName,
          ...(scriptedOpeners?.length ? { scriptedOpeners } : {}),
        });
        return;
      }

      window.dispatchEvent(
        new CustomEvent("nagibatop:dialogue-open", {
          detail: { npcId, displayName, scriptedOpeners },
        })
      );
      setDialogue({
        npcId,
        displayName,
        ...(scriptedOpeners?.length ? { scriptedOpeners } : {}),
      });
      window.dispatchEvent(new CustomEvent("npc-dialogue-open"));
    };
    window.addEventListener("npc-interact-open", open);
    return () => window.removeEventListener("npc-interact-open", open);
  }, []);

  useEffect(() => {
    return subscribeAssetSliceOverridesSaved(() => phaserGameRef.current);
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    const gameWidth = preview ? WORLD.width : PLAY_VIEWPORT_WIDTH;
    const gameHeight = preview ? WORLD.height : PLAY_VIEWPORT_HEIGHT;

    let game: import("phaser").Game | undefined;
    /**
     * React Strict Mode и HMR вызывают cleanup до того, как async-импорт Phaser
     * успеет завершиться. Без этого флага в памяти одновременно висело бы два
     * экземпляра Phaser.Game с дублирующимися слушателями window (keydown,
     * nagibatop-modal-*, blur, respawn-player), и урон/события срабатывали
     * дважды.
     */
    let cancelled = false;

    void (async () => {
      const Phaser = await import("phaser");
      const { BootScene } = await import("@/src/game/scenes/BootScene");
      const { MainScene } = await import("@/src/game/scenes/MainScene");

      if (cancelled) return;

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        width: gameWidth,
        height: gameHeight,
        pixelArt: true,
        roundPixels: true,
        backgroundColor: "#1a1a1a",
        physics: {
          default: "arcade",
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [BootScene, MainScene],
      });
      phaserGameRef.current = game;
    })().catch((e) => {
      console.error("[GameRoot] Phaser init", e);
    });

    return () => {
      cancelled = true;
      phaserGameRef.current = null;
      game?.destroy(true);
      game = undefined;
    };
  }, [preview]);

  async function copyFullMapScreenshot(): Promise<void> {
    const capture = window.__NAGIBATOP_CAPTURE_FULL_MAP__;
    if (!capture) {
      setMapCaptureNotice("Дождитесь загрузки движка");
      window.setTimeout(() => setMapCaptureNotice(null), 2800);
      return;
    }
    setMapCaptureBusy(true);
    setMapCaptureNotice(null);
    try {
      const r = await capture();
      if (r.ok) {
        setMapCaptureNotice("Карта скопирована в буфер (PNG)");
      } else {
        setMapCaptureNotice(r.error ?? "Не удалось скопировать");
      }
    } finally {
      setMapCaptureBusy(false);
      window.setTimeout(() => setMapCaptureNotice(null), 3200);
    }
  }

  return (
    <div
      ref={gameFrameRef}
      className={
        isFullscreen
          ? "relative h-screen w-screen bg-black"
          : "relative inline-block"
      }
    >
      <button
        type="button"
        disabled={mapCaptureBusy}
        onClick={() => void copyFullMapScreenshot()}
        className="absolute right-2 top-2 z-20 rounded-md border border-zinc-600 bg-zinc-900/95 px-2.5 py-1.5 text-[11px] font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800 disabled:opacity-50"
        title="Снимок всей карты (масштаб под размер окна) — PNG в буфер обмена"
      >
        {mapCaptureBusy ? "…" : "Карта → буфер"}
      </button>
      {mapCaptureNotice ? (
        <p
          className="pointer-events-none absolute left-2 top-2 z-20 max-w-[min(90%,280px)] rounded-md border border-zinc-600 bg-zinc-950/90 px-2 py-1 text-[11px] text-zinc-200 shadow-md"
          role="status"
        >
          {mapCaptureNotice}
        </p>
      ) : null}
      <GameHud preview={preview} />
      {!preview ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-50 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("nagibatop-request-goto-location", {
                  detail: {
                    locationId: "town",
                    spawnId: "default",
                    reviveIfDead: true,
                  },
                })
              );
            }}
            className="pointer-events-auto rounded-lg border border-sky-700 bg-sky-950/90 px-3 py-2 text-left text-xs font-medium text-sky-100 shadow-md backdrop-blur-sm hover:bg-sky-900/90"
            title="Появиться у дороги в городе (без штрафа опыта)"
          >
            Respawn
          </button>
          <button
            type="button"
            onClick={toggleInventory}
            className="pointer-events-auto rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2 text-left text-xs font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800"
          >
            Инвентарь
            <span className="ml-2 font-mono text-[10px] text-zinc-500">I</span>
          </button>
          <button
            type="button"
            onClick={toggleJournal}
            className="pointer-events-auto rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2 text-left text-xs font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800"
          >
            Квесты
            <span className="ml-2 font-mono text-[10px] text-zinc-500">J</span>
          </button>
          <button
            type="button"
            onClick={toggleAchievements}
            className="pointer-events-auto rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2 text-left text-xs font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800"
          >
            Достижения
            <span className="ml-2 font-mono text-[10px] text-zinc-500">H</span>
          </button>
          <button
            type="button"
            onClick={toggleSettings}
            className="pointer-events-auto rounded-lg border border-zinc-600 bg-zinc-900/95 px-3 py-2 text-left text-xs font-medium text-zinc-100 shadow-md backdrop-blur-sm hover:bg-zinc-800"
          >
            Настройки
            <span className="ml-2 font-mono text-[10px] text-zinc-500">O</span>
          </button>
          <button
            type="button"
            disabled={!fullscreenAvailable}
            onClick={() => void toggleFullscreen()}
            className="pointer-events-auto rounded-lg border border-emerald-700 bg-emerald-950/90 px-3 py-2 text-left text-xs font-medium text-emerald-100 shadow-md backdrop-blur-sm hover:bg-emerald-900/90 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900/80 disabled:text-zinc-500"
            title="Переключить полноэкранный режим (Alt+Enter)"
          >
            {isFullscreen ? "Оконный режим" : "Во весь экран"}
            <span className="ml-2 font-mono text-[10px] text-emerald-400/80">
              Alt+Enter
            </span>
          </button>
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
            : isFullscreen
              ? "relative h-screen w-screen overflow-hidden bg-black"
              : "relative h-[min(88vh,720px)] w-[min(100%,1280px)] max-w-[1280px] overflow-hidden rounded-lg border border-zinc-700 bg-black"
        }
      >
        <div
          ref={hostRef}
          tabIndex={0}
          role="application"
          aria-label="Игровая сцена"
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            hostRef.current?.focus({ preventScroll: true });
          }}
          className={
            preview
              ? "overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-amber-600/50"
              : "h-full w-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-amber-600/50"
          }
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
        <AchievementsTreeOverlay
          open={!preview && achievementsOpen}
          onClose={() => setAchievementsOpen(false)}
        />
        <SettingsOverlay
          open={!preview && settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
        {!preview && npcInteract ? (
          <div
            className="pointer-events-auto absolute inset-0 z-[95] flex flex-col items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label="Действие с персонажем"
          >
            <div className="w-full max-w-md rounded-xl border border-zinc-600 bg-zinc-900/97 p-5 shadow-2xl">
              <p className="mb-4 text-center text-sm font-medium text-zinc-100">
                {npcInteract.displayName ?? npcInteract.npcId}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-600"
                  onClick={() => {
                    const { npcId, displayName, scriptedOpeners } =
                      npcInteract;
                    setNpcInteract(null);
                    window.dispatchEvent(
                      new CustomEvent("nagibatop:dialogue-open", {
                        detail: {
                          npcId,
                          displayName,
                          scriptedOpeners,
                        },
                      })
                    );
                    setDialogue({
                      npcId,
                      displayName,
                      ...(scriptedOpeners?.length ? { scriptedOpeners } : {}),
                    });
                    window.dispatchEvent(new CustomEvent("npc-dialogue-open"));
                  }}
                >
                  Поговорить
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-amber-700 bg-amber-950/80 px-4 py-3 text-sm font-medium text-amber-100 hover:bg-amber-900/90"
                  onClick={() => {
                    const shop = getShopByNpc(npcInteract.npcId);
                    if (!shop) return;
                    window.dispatchEvent(
                      new CustomEvent("npc-dialogue-close", {
                        detail: { npcId: npcInteract.npcId },
                      })
                    );
                    setNpcInteract(null);
                    setShopOpen({
                      shopId: shop.id,
                      npcId: npcInteract.npcId,
                      shopTitle: shop.title,
                      displayName: npcInteract.displayName,
                    });
                  }}
                >
                  Торговля
                </button>
              </div>
              <button
                type="button"
                className="mt-4 w-full rounded-md border border-zinc-600 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent("npc-dialogue-close", {
                      detail: { npcId: npcInteract.npcId },
                    })
                  );
                  setNpcInteract(null);
                }}
              >
                Отмена (Esc)
              </button>
            </div>
          </div>
        ) : null}
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
      {!preview ? <QuestToast /> : null}
      {dialogue ? (
        <DialogueOverlay
          npcId={dialogue.npcId}
          displayName={dialogue.displayName}
          scriptedOpeners={dialogue.scriptedOpeners}
          onClose={() => setDialogue(null)}
        />
      ) : null}
      {!preview && isekaiOpen ? (
        <IsekaiOriginOverlay onComplete={() => setIsekaiOpen(false)} />
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
