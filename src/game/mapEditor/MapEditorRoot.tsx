"use client";

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getGrassDecor,
  getLocation,
  type GameLocation,
  type LocationId,
} from "@/src/game/locations";
import type {
  GrassDecorDef,
  LocationEnemySpawn,
  LocationExit,
} from "@/src/game/locations/types";
import { ENEMY_LEVEL_MAX } from "@/src/game/data/balance";
import { ENEMY_SPAWNS } from "@/src/game/data/combatWorld";
import {
  parseHexOrInt,
  serializeLocationToJsonObject,
} from "@/src/game/locations/locationSchema";
import {
  buildCatalogFromManifestLoad,
  type CatalogItem,
  type ManifestLoadEntry,
} from "@/src/game/mapEditor/manifestCatalog";
import { COLLIDER_PRESETS, presetCollider } from "@/src/game/mapEditor/colliderPresets";
import MapElementCatalog from "@/src/game/mapEditor/MapElementCatalog";
import SpriteSheetFramePicker from "@/src/game/mapEditor/SpriteSheetFramePicker";
import {
  persistStoredEditorDraftLocation,
} from "@/src/game/mapEditor/mapEditorDraftStorage";
import {
  MapEditScene,
  type InteractionLayer,
  type MapEditorBridge,
  type MapEditorBridgeTool,
  type WorldPick,
} from "@/src/game/mapEditor/MapEditScene";
import SelectionContextMenu from "@/src/game/mapEditor/SelectionContextMenu";
import type {
  GrassMenuPayload,
  MobMenuPayload,
  PropMenuPayload,
  SpawnMenuPayload,
} from "@/src/game/mapEditor/SelectionContextMenu";
import { MapEditorBootScene } from "@/src/game/mapEditor/MapEditorBootScene";
import { subscribeAssetSliceOverridesSaved } from "@/src/game/load/assetSliceOverridesRuntime";
import {
  nextTool,
  TOOL_BY_CODE,
  toolLabel,
} from "@/src/game/mapEditor/mapEditorShortcuts";
import { WORLD } from "@/src/game/layout";

type EditorTool = MapEditorBridgeTool;

/** Шаблон для инструмента «Моб» (без id и координат). */
const MOB_EDITOR_PRESETS: Omit<LocationEnemySpawn, "id" | "x" | "y">[] =
  ENEMY_SPAWNS.map((e) => ({
    zoneId: e.zoneId,
    lootTable: e.lootTable,
    mobVisualId: e.mobVisualId,
  }));

function clampMobEditorLevel(n: number): number {
  const x = Math.floor(Number.isFinite(n) ? n : 1);
  return Math.max(1, Math.min(ENEMY_LEVEL_MAX, x));
}

function cloneLoc(loc: GameLocation): GameLocation {
  return structuredClone(loc);
}

/** Редактируемая копия списка мобов (как в игре: `enemySpawns ?? ENEMY_SPAWNS`). */
function cloneForestMobs(loc: GameLocation): LocationEnemySpawn[] {
  return (loc.enemySpawns ?? ENEMY_SPAWNS.map((e) => ({ ...e }))).map((e) => ({
    ...e,
  }));
}

/** Цель и spawn по умолчанию для нового выхода с локации `sourceLocationId`. */
function defaultExitMeta(
  sourceLocationId: LocationId
): Pick<LocationExit, "targetLocationId" | "targetSpawnId" | "label"> {
  switch (sourceLocationId) {
    case "town":
      return {
        targetLocationId: "forest",
        targetSpawnId: "from_town",
        label: "В лес",
      };
    case "forest":
      return {
        targetLocationId: "town",
        targetSpawnId: "from_forest",
        label: "В поселение",
      };
    case "dungeon":
    default:
      return {
        targetLocationId: "town",
        targetSpawnId: "from_dungeon",
        label: "Наружу",
      };
  }
}

function grassSeedToHex(n: number): string {
  return `#${(n >>> 0).toString(16).padStart(6, "0")}`;
}

/**
 * Материализует `grassDecorItems` из процедурной генерации, если поле ещё не
 * задано — тогда редактирование (перемещение/удаление) сохраняется в черновике.
 */
function ensureGrassItems(
  loc: GameLocation,
  locId: LocationId
): GrassDecorDef[] {
  if (loc.grassDecorItems) return loc.grassDecorItems.map((g) => ({ ...g }));
  const list = getGrassDecor(locId);
  return list.map((g) => ({ ...g }));
}

/** Черновик редактора уже учтён внутри `getLocation` (localStorage). */
function loadStoredDraft(id: LocationId): GameLocation {
  return cloneLoc(getLocation(id));
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return t.isContentEditable;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-zinc-600 bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-300">
      {children}
    </kbd>
  );
}

export default function MapEditorRoot() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<import("phaser").Game | null>(null);
  const [locationId, setLocationId] = useState<LocationId>("town");
  const [draft, setDraft] = useState<GameLocation>(() =>
    loadStoredDraft("town")
  );
  const [tool, setTool] = useState<EditorTool>("select");
  const [textureKey, setTextureKey] = useState("tree1");
  /** Кадр выбранного spritesheet при кисти «Кисть». */
  const [paintFrame, setPaintFrame] = useState(0);
  const [colliderPresetId, setColliderPresetId] = useState("full");
  const [selectedPropIndex, setSelectedPropIndex] = useState<number | null>(
    null
  );
  const [selectedSpawnKey, setSelectedSpawnKey] = useState<string | null>(null);
  const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
  const [selectedMobIndex, setSelectedMobIndex] = useState<number | null>(null);
  /** Для keydown: не добавлять в deps `useEffect` клавиш — иначе при HMR меняется длина массива deps. */
  const keySelectionRef = useRef({
    selectedPropIndex: null as number | null,
    selectedMobIndex: null as number | null,
    selectedNpcId: null as string | null,
    worldPick: null as WorldPick,
  });
  const [npcPaintId, setNpcPaintId] = useState("elena");
  const [mobPresetIndex, setMobPresetIndex] = useState(0);
  const [mobPlaceLevel, setMobPlaceLevel] = useState(1);
  const [grassPaintVariant, setGrassPaintVariant] = useState(0);
  /** Резервные размеры для нового сегмента, если драг был меньше `dragSlopPx`. */
  const [pathPlaceWidth] = useState(200);
  const [pathPlaceHeight] = useState(44);
  const [spawnKey, setSpawnKey] = useState<string>("default");
  const [showGrass, setShowGrass] = useState(true);
  const [showOverlays, setShowOverlays] = useState(true);
  const [catalogImages, setCatalogImages] = useState<CatalogItem[]>([]);
  const [catalogSpritesheets, setCatalogSpritesheets] = useState<CatalogItem[]>(
    []
  );
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [pathForm, setPathForm] = useState({ x: 0, y: 0, w: 200, h: 120 });
  const [propMenu, setPropMenu] = useState<PropMenuPayload | null>(null);
  const [spawnMenu, setSpawnMenu] = useState<SpawnMenuPayload | null>(null);
  const [grassMenu, setGrassMenu] = useState<GrassMenuPayload | null>(null);
  const [mobMenu, setMobMenu] = useState<MobMenuPayload | null>(null);
  const [worldPick, setWorldPick] = useState<WorldPick>(null);
  const [interactionLayer, setInteractionLayer] =
    useState<InteractionLayer>("all");
  const [grassSeedInput, setGrassSeedInput] = useState(() =>
    grassSeedToHex(getLocation("town").grassDecorSeed)
  );

  const bridgeRef = useRef<MapEditorBridge>({
    tool,
    selectedPropIndex,
    selectedSpawnKey,
    selectedNpcId,
    selectedMobIndex,
    npcPaintId,
    mobPresetIndex,
    mobPlaceLevel,
    grassPaintVariant,
    pathPlaceWidth,
    pathPlaceHeight,
    worldPick,
    interactionLayer,
  });

  useEffect(() => {
    return subscribeAssetSliceOverridesSaved(() => gameRef.current);
  }, []);

  useLayoutEffect(() => {
    bridgeRef.current = {
      tool,
      selectedPropIndex,
      selectedSpawnKey,
      selectedNpcId,
      selectedMobIndex,
      npcPaintId,
      mobPresetIndex,
      mobPlaceLevel,
      grassPaintVariant,
      pathPlaceWidth,
      pathPlaceHeight,
      worldPick,
      interactionLayer,
    };
  }, [
    tool,
    selectedPropIndex,
    selectedSpawnKey,
    selectedNpcId,
    selectedMobIndex,
    npcPaintId,
    mobPresetIndex,
    mobPlaceLevel,
    grassPaintVariant,
    pathPlaceWidth,
    pathPlaceHeight,
    worldPick,
    interactionLayer,
  ]);

  useLayoutEffect(() => {
    keySelectionRef.current = {
      selectedPropIndex,
      selectedMobIndex,
      selectedNpcId,
      worldPick,
    };
  }, [selectedPropIndex, selectedMobIndex, selectedNpcId, worldPick]);

  const removeForestMobAtIndex = useCallback((i: number) => {
    setDraft((d) => {
      const next = cloneLoc(d);
      const list = cloneForestMobs(next);
      if (i < 0 || i >= list.length) return d;
      list.splice(i, 1);
      next.enemySpawns = list;
      return next;
    });
    setSelectedMobIndex((idx) => {
      if (idx === i) return null;
      if (idx !== null && idx > i) return idx - 1;
      return idx;
    });
  }, []);

  useEffect(() => {
    setGrassSeedInput(grassSeedToHex(draft.grassDecorSeed));
  }, [locationId, draft.grassDecorSeed]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      persistStoredEditorDraftLocation(locationId, draft);
    }, 450);
    return () => window.clearTimeout(t);
  }, [draft, locationId]);

  useEffect(() => {
    void Promise.all([
      fetch("/assets/world/manifest.json").then((r) => r.json()),
      fetch("/assets/world/pixel-crawler-environment.load.json")
        .then((r) => (r.ok ? r.json() : { load: [] }))
        .catch(() => ({ load: [] })),
      fetch("/assets/world/pixel-crawler-slices.load.json")
        .then((r) => (r.ok ? r.json() : { load: [] }))
        .catch(() => ({ load: [] })),
      fetch("/assets/world/pixel-crawler-autoslices.load.json")
        .then((r) => (r.ok ? r.json() : { load: [] }))
        .catch(() => ({ load: [] })),
    ])
      .then(
        ([data, extra, slices, autoSlices]: [
          { load?: ManifestLoadEntry[] },
          { load?: ManifestLoadEntry[] },
          { load?: ManifestLoadEntry[] },
          { load?: ManifestLoadEntry[] },
        ]) => {
        const load = [
          ...(data.load ?? []),
          ...(extra.load ?? []),
          ...(slices.load ?? []),
          ...(autoSlices.load ?? []),
        ];
        const { images, spritesheets } = buildCatalogFromManifestLoad(load);
        setCatalogImages(images);
        setCatalogSpritesheets(spritesheets);
      })
      .catch(() => {
        setCatalogImages([]);
        setCatalogSpritesheets([]);
      });
  }, []);

  const selectedPaintCatalogItem = useMemo(() => {
    return [...catalogImages, ...catalogSpritesheets].find(
      (c) => c.key === textureKey
    );
  }, [textureKey, catalogImages, catalogSpritesheets]);

  useEffect(() => {
    setPaintFrame(0);
  }, [textureKey]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let cancelled = false;
    let game: import("phaser").Game | undefined;

    void (async () => {
      const Phaser = await import("phaser");
      if (cancelled) return;

      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: el,
        width: WORLD.width,
        height: WORLD.height,
        pixelArt: true,
        roundPixels: true,
        backgroundColor: "#1a1a1a",
        /** Редактору звук не нужен; без этого при HMR/destroy бывают ошибки закрытого AudioContext. */
        audio: { noAudio: true },
        physics: {
          default: "arcade",
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        scene: [MapEditorBootScene, MapEditScene],
      });
      gameRef.current = game;
      game.registry.set("mapEditorInitial", {
        loc: draft,
        locId: locationId,
      });
    })().catch((e) => {
      console.error("[MapEditorRoot] Phaser init", e);
    });

    return () => {
      cancelled = true;
      game?.destroy(true);
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial mount only
  }, []);

  const applyWorld = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const scene = g.scene.getScene("MapEditScene") as MapEditScene | undefined;
    if (!scene?.scene.isActive()) return;
    scene.applyLocation(draft, locationId);
    scene.setOptions({ showGrass, showOverlays });
    scene.setBridge(bridgeRef.current);
  }, [draft, locationId, showGrass, showOverlays]);

  useEffect(() => {
    applyWorld();
  }, [applyWorld]);

  const syncBridgeOnly = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    const scene = g.scene.getScene("MapEditScene") as MapEditScene | undefined;
    if (!scene?.scene.isActive()) return;
    scene.setBridge({
      tool,
      selectedPropIndex,
      selectedSpawnKey,
      selectedNpcId,
      selectedMobIndex,
      npcPaintId,
      mobPresetIndex,
      mobPlaceLevel,
      grassPaintVariant,
      pathPlaceWidth,
      pathPlaceHeight,
      worldPick,
      interactionLayer,
    });
  }, [
    tool,
    selectedPropIndex,
    selectedSpawnKey,
    selectedNpcId,
    selectedMobIndex,
    npcPaintId,
    mobPresetIndex,
    mobPlaceLevel,
    grassPaintVariant,
    pathPlaceWidth,
    pathPlaceHeight,
    worldPick,
    interactionLayer,
  ]);

  useEffect(() => {
    syncBridgeOnly();
  }, [syncBridgeOnly]);

  useEffect(() => {
    if (tool !== "select" && tool !== "npc" && tool !== "mob") {
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
    }
  }, [tool]);

  useEffect(() => {
    const onPropSelect = (ev: Event) => {
      const d = (ev as CustomEvent<{ index: number }>).detail;
      if (typeof d?.index !== "number") return;
      setSelectedPropIndex(d.index);
      setSelectedSpawnKey(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
      setWorldPick(null);
    };
    const onSpawnSelect = (ev: Event) => {
      const d = (ev as CustomEvent<{ key: string }>).detail;
      if (!d?.key) return;
      setSelectedSpawnKey(d.key);
      setSelectedPropIndex(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
      setWorldPick(null);
    };
    const onNpcSelect = (ev: Event) => {
      const d = (ev as CustomEvent<{ npcId: string }>).detail;
      if (!d?.npcId) return;
      setSelectedNpcId(d.npcId);
      setSelectedMobIndex(null);
      setSelectedPropIndex(null);
      setSelectedSpawnKey(null);
      setWorldPick(null);
    };
    const onMobSelect = (ev: Event) => {
      const d = (ev as CustomEvent<{ index: number }>).detail;
      if (typeof d?.index !== "number") return;
      setSelectedMobIndex(d.index);
      setSelectedNpcId(null);
      setSelectedPropIndex(null);
      setSelectedSpawnKey(null);
      setWorldPick(null);
    };
    const onClear = (): void => {
      setSelectedPropIndex(null);
      setSelectedSpawnKey(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
      setWorldPick(null);
      setPropMenu(null);
      setSpawnMenu(null);
      setGrassMenu(null);
      setMobMenu(null);
    };
    const onGroundClick = (ev: Event) => {
      const d = (ev as CustomEvent<{ x: number; y: number }>).detail;
      if (typeof d?.x !== "number" || typeof d?.y !== "number") return;
      setWorldPick({ kind: "ground" });
      setSelectedPropIndex(null);
      setSelectedSpawnKey(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
    };
    const onGrassClick = (ev: Event) => {
      const d = (ev as CustomEvent<{ index: number; x: number; y: number }>)
        .detail;
      if (typeof d?.index !== "number") return;
      setWorldPick({ kind: "grass", index: d.index });
      setSelectedPropIndex(null);
      setSelectedSpawnKey(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
    };
    const onPathClick = (ev: Event) => {
      const d = (ev as CustomEvent<{
        segmentIndex: number;
        x: number;
        y: number;
      }>).detail;
      if (typeof d?.segmentIndex !== "number") return;
      setWorldPick({ kind: "path", segmentIndex: d.segmentIndex });
      setSelectedPropIndex(null);
      setSelectedSpawnKey(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
    };
    const onExitClick = (ev: Event) => {
      const d = (ev as CustomEvent<{
        exitIndex: number;
        x: number;
        y: number;
      }>).detail;
      if (typeof d?.exitIndex !== "number") return;
      setWorldPick({ kind: "exit", index: d.exitIndex });
      setSelectedPropIndex(null);
      setSelectedSpawnKey(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
    };
    const onAnimClick = (ev: Event) => {
      const d = (ev as CustomEvent<{ stationIndex: number; x: number; y: number }>)
        .detail;
      if (typeof d?.stationIndex !== "number") return;
      setWorldPick({ kind: "anim", stationIndex: d.stationIndex });
      setSelectedPropIndex(null);
      setSelectedSpawnKey(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
    };
    const onPropMoved = (ev: Event) => {
      const d = (ev as CustomEvent<{ index: number; x: number; y: number }>)
        .detail;
      if (
        typeof d?.index !== "number" ||
        typeof d?.x !== "number" ||
        typeof d?.y !== "number"
      )
        return;
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const p = next.imageProps[d.index];
        if (!p) return prev;
        p.x = d.x;
        p.y = d.y;
        return next;
      });
    };
    const onSpawnMoved = (ev: Event) => {
      const d = (ev as CustomEvent<{ key: string; x: number; y: number }>)
        .detail;
      if (
        !d?.key ||
        typeof d?.x !== "number" ||
        typeof d?.y !== "number"
      )
        return;
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const sp = {
          ...(next.spawns as Record<string, { x: number; y: number }>),
        };
        sp[d.key] = { x: d.x, y: d.y };
        next.spawns = sp as GameLocation["spawns"];
        return next;
      });
    };
    const onNpcPlace = (ev: Event) => {
      const d = (ev as CustomEvent<{ npcId: string; x: number; y: number }>)
        .detail;
      if (
        !d?.npcId ||
        typeof d?.x !== "number" ||
        typeof d?.y !== "number"
      )
        return;
      setDraft((prev) => {
        if (prev.id !== "town") return prev;
        const next = cloneLoc(prev);
        next.npcSpawnOverrides = {
          ...(next.npcSpawnOverrides ?? {}),
          [d.npcId]: { x: d.x, y: d.y },
        };
        return next;
      });
    };
    const onNpcMoved = (ev: Event) => {
      const d = (ev as CustomEvent<{ npcId: string; x: number; y: number }>)
        .detail;
      if (
        !d?.npcId ||
        typeof d?.x !== "number" ||
        typeof d?.y !== "number"
      )
        return;
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const o = { ...(next.npcSpawnOverrides ?? {}) };
        if (!o[d.npcId]) return prev;
        o[d.npcId] = { x: d.x, y: d.y };
        next.npcSpawnOverrides = o;
        return next;
      });
    };
    const onMobPlace = (ev: Event) => {
      const d = (ev as CustomEvent<{
        x: number;
        y: number;
        presetIndex: number;
        level: number;
      }>).detail;
      if (typeof d?.x !== "number" || typeof d?.y !== "number") return;
      const pi =
        typeof d.presetIndex === "number" &&
        d.presetIndex >= 0 &&
        d.presetIndex < MOB_EDITOR_PRESETS.length
          ? d.presetIndex
          : 0;
      const preset = MOB_EDITOR_PRESETS[pi];
      const lvl = clampMobEditorLevel(
        typeof d.level === "number" ? d.level : mobPlaceLevel
      );
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const list = cloneForestMobs(next);
        list.push({
          id: `mob_ed_${Date.now()}`,
          ...preset,
          x: d.x,
          y: d.y,
          level: lvl,
        });
        next.enemySpawns = list;
        return next;
      });
    };
    const onMobMoved = (ev: Event) => {
      const d = (ev as CustomEvent<{ index: number; x: number; y: number }>)
        .detail;
      if (
        typeof d?.index !== "number" ||
        typeof d?.x !== "number" ||
        typeof d?.y !== "number"
      )
        return;
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const list = cloneForestMobs(next);
        const row = list[d.index];
        if (!row) return prev;
        list[d.index] = { ...row, x: d.x, y: d.y };
        next.enemySpawns = list;
        return next;
      });
    };
    const onGrassPlace = (ev: Event) => {
      const d = (ev as CustomEvent<{
        x: number;
        y: number;
        variant: number;
      }>).detail;
      if (typeof d?.x !== "number" || typeof d?.y !== "number") return;
      const v = Math.max(0, Math.floor(d.variant ?? 0));
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const items = ensureGrassItems(next, next.id);
        items.push({ x: d.x, y: d.y, variant: v });
        next.grassDecorItems = items;
        return next;
      });
    };
    const onGrassMoved = (ev: Event) => {
      const d = (ev as CustomEvent<{ index: number; x: number; y: number }>)
        .detail;
      if (
        typeof d?.index !== "number" ||
        typeof d?.x !== "number" ||
        typeof d?.y !== "number"
      )
        return;
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const items = ensureGrassItems(next, next.id);
        const row = items[d.index];
        if (!row) return prev;
        items[d.index] = { ...row, x: d.x, y: d.y };
        next.grassDecorItems = items;
        return next;
      });
    };
    const onPathMoved = (ev: Event) => {
      const d = (ev as CustomEvent<{
        segmentIndex: number;
        x: number;
        y: number;
      }>).detail;
      if (
        typeof d?.segmentIndex !== "number" ||
        typeof d?.x !== "number" ||
        typeof d?.y !== "number"
      )
        return;
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const seg = next.pathSegments[d.segmentIndex];
        if (!seg) return prev;
        next.pathSegments = [...next.pathSegments];
        next.pathSegments[d.segmentIndex] = { ...seg, x: d.x, y: d.y };
        return next;
      });
    };
    const onPathCreate = (ev: Event) => {
      const d = (ev as CustomEvent<{
        x: number;
        y: number;
        w: number;
        h: number;
      }>).detail;
      if (
        typeof d?.x !== "number" ||
        typeof d?.y !== "number" ||
        typeof d?.w !== "number" ||
        typeof d?.h !== "number"
      )
        return;
      setDraft((prev) => {
        const next = cloneLoc(prev);
        next.pathSegments = [
          ...next.pathSegments,
          { x: d.x, y: d.y, w: d.w, h: d.h },
        ];
        return next;
      });
    };
    const onExitMoved = (ev: Event) => {
      const d = (ev as CustomEvent<{
        exitIndex: number;
        x: number;
        y: number;
      }>).detail;
      if (
        typeof d?.exitIndex !== "number" ||
        typeof d?.x !== "number" ||
        typeof d?.y !== "number"
      )
        return;
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const row = next.exits[d.exitIndex];
        if (!row) return prev;
        next.exits = [...next.exits];
        next.exits[d.exitIndex] = { ...row, x: d.x, y: d.y };
        return next;
      });
    };
    const onExitCreate = (ev: Event) => {
      const d = (ev as CustomEvent<{
        x: number;
        y: number;
        w: number;
        h: number;
      }>).detail;
      if (
        typeof d?.x !== "number" ||
        typeof d?.y !== "number" ||
        typeof d?.w !== "number" ||
        typeof d?.h !== "number"
      )
        return;
      setDraft((prev) => {
        const next = cloneLoc(prev);
        const meta = defaultExitMeta(next.id);
        const newExit: LocationExit = {
          id: `exit_${Date.now()}`,
          x: d.x,
          y: d.y,
          w: d.w,
          h: d.h,
          ...meta,
        };
        next.exits = [...next.exits, newExit];
        return next;
      });
    };
    const onWorldClick = (ev: Event) => {
      const d = (ev as CustomEvent<{ x: number; y: number }>).detail;
      if (typeof d?.x !== "number" || typeof d?.y !== "number") return;

      setDraft((prev) => {
        const next = cloneLoc(prev);
        if (tool === "paint" && textureKey) {
          const coll = presetCollider(colliderPresetId);
          const cat = [...catalogImages, ...catalogSpritesheets].find(
            (c) => c.key === textureKey
          );
          next.imageProps = [
            ...next.imageProps,
            {
              x: d.x,
              y: d.y,
              texture: textureKey,
              collider: coll,
              ...(cat?.type === "spritesheet"
                ? { frame: paintFrame }
                : {}),
            },
          ];
          return next;
        }
        if (tool === "spawn") {
          const sp = {
            ...(next.spawns as Record<string, { x: number; y: number }>),
          };
          sp[spawnKey] = { x: d.x, y: d.y };
          next.spawns = sp as GameLocation["spawns"];
          return next;
        }
        return prev;
      });
    };

    window.addEventListener(
      "nagibatop-map-editor-prop-select",
      onPropSelect as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-spawn-select",
      onSpawnSelect as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-npc-select",
      onNpcSelect as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-mob-select",
      onMobSelect as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-clear-selection",
      onClear
    );
    window.addEventListener(
      "nagibatop-map-editor-prop-moved",
      onPropMoved as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-spawn-moved",
      onSpawnMoved as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-npc-place",
      onNpcPlace as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-npc-moved",
      onNpcMoved as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-mob-place",
      onMobPlace as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-mob-moved",
      onMobMoved as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-world-click",
      onWorldClick as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-ground-click",
      onGroundClick as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-grass-click",
      onGrassClick as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-path-click",
      onPathClick as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-exit-click",
      onExitClick as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-anim-click",
      onAnimClick as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-grass-place",
      onGrassPlace as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-grass-moved",
      onGrassMoved as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-path-moved",
      onPathMoved as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-path-create",
      onPathCreate as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-exit-moved",
      onExitMoved as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-exit-create",
      onExitCreate as EventListener
    );
    return () => {
      window.removeEventListener(
        "nagibatop-map-editor-prop-select",
        onPropSelect as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-spawn-select",
        onSpawnSelect as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-npc-select",
        onNpcSelect as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-mob-select",
        onMobSelect as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-clear-selection",
        onClear
      );
      window.removeEventListener(
        "nagibatop-map-editor-prop-moved",
        onPropMoved as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-spawn-moved",
        onSpawnMoved as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-npc-place",
        onNpcPlace as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-npc-moved",
        onNpcMoved as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-mob-place",
        onMobPlace as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-mob-moved",
        onMobMoved as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-world-click",
        onWorldClick as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-ground-click",
        onGroundClick as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-grass-click",
        onGrassClick as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-path-click",
        onPathClick as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-exit-click",
        onExitClick as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-anim-click",
        onAnimClick as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-grass-place",
        onGrassPlace as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-grass-moved",
        onGrassMoved as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-path-moved",
        onPathMoved as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-path-create",
        onPathCreate as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-exit-moved",
        onExitMoved as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-exit-create",
        onExitCreate as EventListener
      );
    };
  }, [
    tool,
    textureKey,
    colliderPresetId,
    spawnKey,
    paintFrame,
    catalogImages,
    catalogSpritesheets,
    mobPlaceLevel,
  ]);

  useEffect(() => {
    const onPropMenu = (ev: Event) => {
      const d = (ev as CustomEvent<PropMenuPayload>).detail;
      if (typeof d?.propIndex !== "number") return;
      setPropMenu(d);
      setSpawnMenu(null);
      setGrassMenu(null);
      setMobMenu(null);
      setSelectedPropIndex(d.propIndex);
      setSelectedSpawnKey(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
    };
    const onSpawnMenu = (ev: Event) => {
      const d = (ev as CustomEvent<SpawnMenuPayload>).detail;
      if (!d?.spawnKey) return;
      setSpawnMenu(d);
      setPropMenu(null);
      setGrassMenu(null);
      setMobMenu(null);
      setSelectedSpawnKey(d.spawnKey);
      setSelectedPropIndex(null);
      setSelectedNpcId(null);
      setSelectedMobIndex(null);
    };
    const onGrassMenu = (ev: Event) => {
      const d = (ev as CustomEvent<GrassMenuPayload>).detail;
      if (typeof d?.clientX !== "number" || typeof d?.clientY !== "number")
        return;
      setGrassMenu(d);
      setPropMenu(null);
      setSpawnMenu(null);
      setMobMenu(null);
    };
    const onMobMenu = (ev: Event) => {
      const d = (ev as CustomEvent<MobMenuPayload>).detail;
      if (typeof d?.mobIndex !== "number") return;
      setMobMenu(d);
      setPropMenu(null);
      setSpawnMenu(null);
      setGrassMenu(null);
      setSelectedMobIndex(d.mobIndex);
      setSelectedPropIndex(null);
      setSelectedSpawnKey(null);
      setSelectedNpcId(null);
      setWorldPick(null);
    };
    window.addEventListener(
      "nagibatop-map-editor-prop-menu",
      onPropMenu as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-spawn-menu",
      onSpawnMenu as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-grass-menu",
      onGrassMenu as EventListener
    );
    window.addEventListener(
      "nagibatop-map-editor-mob-menu",
      onMobMenu as EventListener
    );
    return () => {
      window.removeEventListener(
        "nagibatop-map-editor-prop-menu",
        onPropMenu as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-spawn-menu",
        onSpawnMenu as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-grass-menu",
        onGrassMenu as EventListener
      );
      window.removeEventListener(
        "nagibatop-map-editor-mob-menu",
        onMobMenu as EventListener
      );
    };
  }, []);

  const jsonText = useMemo(
    () => JSON.stringify(serializeLocationToJsonObject(draft), null, 2),
    [draft]
  );

  const copyJson = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(jsonText);
      setExportNotice("JSON скопирован в буфер");
    } catch {
      setExportNotice("Не удалось скопировать");
    }
    window.setTimeout(() => setExportNotice(null), 2400);
  }, [jsonText]);

  const downloadJson = useCallback((): void => {
    const blob = new Blob([jsonText], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${draft.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setExportNotice("Файл скачан");
    window.setTimeout(() => setExportNotice(null), 2400);
  }, [jsonText, draft.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && e.code === "KeyC") {
        e.preventDefault();
        void copyJson();
        return;
      }
      if (mod && e.shiftKey && e.code === "KeyD") {
        e.preventDefault();
        downloadJson();
        return;
      }

      if (e.code === "KeyT" && !mod) {
        e.preventDefault();
        setShowGrass((v) => !v);
        return;
      }
      if (e.code === "KeyO" && !mod) {
        e.preventDefault();
        setShowOverlays((v) => !v);
        return;
      }

      if (e.code === "BracketLeft") {
        e.preventDefault();
        setTool((t) => nextTool(t, -1));
        return;
      }
      if (e.code === "BracketRight") {
        e.preventDefault();
        setTool((t) => nextTool(t, 1));
        return;
      }

      const byCode = TOOL_BY_CODE[e.code];
      if (byCode && !mod) {
        e.preventDefault();
        setTool(byCode);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setSelectedPropIndex(null);
        setSelectedSpawnKey(null);
        setSelectedNpcId(null);
        setSelectedMobIndex(null);
        setWorldPick(null);
        setPropMenu(null);
        setSpawnMenu(null);
        setGrassMenu(null);
        setMobMenu(null);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = keySelectionRef.current;
        if (sel.worldPick?.kind === "grass") {
          e.preventDefault();
          const i = sel.worldPick.index;
          setDraft((d) => {
            const next = cloneLoc(d);
            const items = ensureGrassItems(next, next.id);
            if (i < 0 || i >= items.length) return d;
            items.splice(i, 1);
            next.grassDecorItems = items;
            return next;
          });
          setWorldPick(null);
          return;
        }
        if (sel.worldPick?.kind === "path") {
          e.preventDefault();
          const i = sel.worldPick.segmentIndex;
          setDraft((d) => {
            const next = cloneLoc(d);
            if (i < 0 || i >= next.pathSegments.length) return d;
            next.pathSegments = next.pathSegments.filter((_, j) => j !== i);
            return next;
          });
          setWorldPick(null);
          return;
        }
        if (sel.worldPick?.kind === "exit") {
          e.preventDefault();
          const i = sel.worldPick.index;
          setDraft((d) => {
            const next = cloneLoc(d);
            if (i < 0 || i >= next.exits.length) return d;
            next.exits = next.exits.filter((_, j) => j !== i);
            return next;
          });
          setWorldPick(null);
          return;
        }
        if (sel.selectedMobIndex !== null) {
          e.preventDefault();
          removeForestMobAtIndex(sel.selectedMobIndex);
          return;
        }
        if (sel.selectedNpcId) {
          e.preventDefault();
          const id = sel.selectedNpcId;
          setDraft((d) => {
            const next = cloneLoc(d);
            const o = { ...(next.npcSpawnOverrides ?? {}) };
            delete o[id];
            if (Object.keys(o).length === 0) {
              delete next.npcSpawnOverrides;
            } else {
              next.npcSpawnOverrides = o;
            }
            return next;
          });
          setSelectedNpcId(null);
          return;
        }
        if (sel.selectedPropIndex === null) return;
        e.preventDefault();
        const i = sel.selectedPropIndex;
        setDraft((d) => {
          const next = cloneLoc(d);
          next.imageProps = next.imageProps.filter((_, j) => j !== i);
          return next;
        });
        setSelectedPropIndex(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copyJson, downloadJson, removeForestMobAtIndex]);

  function addPathSegment(): void {
    setDraft((d) => {
      const next = cloneLoc(d);
      next.pathSegments = [
        ...next.pathSegments,
        {
          x: pathForm.x,
          y: pathForm.y,
          w: pathForm.w,
          h: pathForm.h,
        },
      ];
      return next;
    });
  }

  function removePathSegment(i: number): void {
    setDraft((d) => {
      const next = cloneLoc(d);
      next.pathSegments = next.pathSegments.filter((_, j) => j !== i);
      return next;
    });
  }

  function removeProp(i: number): void {
    setDraft((d) => {
      const next = cloneLoc(d);
      next.imageProps = next.imageProps.filter((_, j) => j !== i);
      return next;
    });
    setSelectedPropIndex((idx) => {
      if (idx === i) return null;
      if (idx !== null && idx > i) return idx - 1;
      return idx;
    });
  }

  function deleteSelected(): void {
    if (selectedMobIndex !== null) {
      removeForestMobAtIndex(selectedMobIndex);
      return;
    }
    if (selectedPropIndex === null) return;
    removeProp(selectedPropIndex);
  }

  const duplicateProp = useCallback((index: number) => {
    setDraft((d) => {
      const next = cloneLoc(d);
      const p = next.imageProps[index];
      if (!p) return d;
      const nx = Math.min(d.world.width - 8, p.x + 28);
      const ny = Math.min(d.world.height - 8, p.y + 20);
      next.imageProps.splice(index + 1, 0, {
        ...p,
        x: nx,
        y: ny,
      });
      return next;
    });
    setWorldPick(null);
    setSelectedPropIndex(index + 1);
  }, []);

  const closeMenus = useCallback(() => {
    setPropMenu(null);
    setSpawnMenu(null);
    setGrassMenu(null);
    setMobMenu(null);
  }, []);

  const selectedMobLevel = useMemo(() => {
    if (selectedMobIndex === null) return 1;
    const row = cloneForestMobs(draft)[selectedMobIndex];
    return row ? clampMobEditorLevel(row.level ?? 1) : 1;
  }, [draft, selectedMobIndex]);

  const spawnKeys = Object.keys(draft.spawns);

  const forestPermanentMobs = useMemo(() => {
    if (locationId !== "forest") return [];
    return cloneForestMobs(draft);
  }, [draft, locationId]);

  return (
    <>
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:items-stretch lg:gap-6">
      <aside className="flex w-full max-w-sm shrink-0 flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-950/95 p-3 text-sm text-zinc-100 lg:max-h-[min(92vh,960px)]">
        <h1 className="text-base font-semibold text-amber-200/95">
          Редактор карты (dev)
        </h1>
        <p className="text-xs text-zinc-400">
          Координаты пропов — «ноги» спрайта (origin 0.5, 1). Колёсико — зум к курсору;
          сдвиг вида — режим «Просмотр» и ЛКМ, средняя кнопка мыши или{" "}
          <Kbd>Shift</Kbd>+ЛКМ.           В «Выбор» клик по земле, дороге, переходу, траве, костру и пр.
          подсвечивает слой внизу. Кликните по канвасу для фокуса и горячих клавиш.
        </p>

        <details className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-[11px] text-zinc-400">
          <summary className="cursor-pointer select-none text-zinc-300">
            Горячие клавиши
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1 pl-1">
            <li>
              <Kbd>1</Kbd> <Kbd>V</Kbd> — {toolLabel("select")};{" "}
              <Kbd>2</Kbd> <Kbd>B</Kbd> — {toolLabel("paint")};{" "}
              <Kbd>3</Kbd> <Kbd>S</Kbd> — {toolLabel("spawn")};{" "}
              <Kbd>5</Kbd> <Kbd>N</Kbd> — {toolLabel("npc")} (town);{" "}
              <Kbd>6</Kbd> <Kbd>M</Kbd> — {toolLabel("mob")};{" "}
              <Kbd>7</Kbd> <Kbd>G</Kbd> — {toolLabel("grass")};{" "}
              <Kbd>8</Kbd> <Kbd>R</Kbd> — {toolLabel("path")};{" "}
              <Kbd>9</Kbd> <Kbd>P</Kbd> — {toolLabel("exit")};{" "}
              <Kbd>4</Kbd> <Kbd>H</Kbd> — {toolLabel("pan")}
            </li>
            <li>
              <Kbd>[</Kbd> / <Kbd>]</Kbd> — предыдущий / следующий инструмент
            </li>
            <li>
              <Kbd>T</Kbd> — трава вкл/выкл; <Kbd>O</Kbd> — оверлеи вкл/выкл
            </li>
            <li>
              <Kbd>Esc</Kbd> — снять выделение; <Kbd>Del</Kbd> / <Kbd>Backspace</Kbd>{" "}
              — удалить выделенный проп, моба, сегмент дороги или переход; сбросить
              переопределение позиции NPC
            </li>
            <li>
              <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>C</Kbd> — JSON в буфер;{" "}
              <Kbd>Ctrl</Kbd>+<Kbd>Shift</Kbd>+<Kbd>D</Kbd> — скачать .json
            </li>
            <li>
              Колёсико мыши — масштаб; в «Просмотр» — ЛКМ тащит карту; в любом режиме
              — средняя кнопка или <Kbd>Shift</Kbd>+ЛКМ для сдвига вида
            </li>
          </ul>
        </details>

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-zinc-500">Локация</span>
          <select
            className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1"
            value={locationId}
            onChange={(e) => {
              const id = e.target.value as LocationId;
              persistStoredEditorDraftLocation(locationId, draft);
              setLocationId(id);
              setDraft(loadStoredDraft(id));
              setSelectedPropIndex(null);
              setSelectedSpawnKey(null);
              setSelectedNpcId(null);
              setSelectedMobIndex(null);
              setNpcPaintId("elena");
              setMobPresetIndex(0);
              setMobPlaceLevel(1);
              setWorldPick(null);
              setSpawnKey("default");
              setPropMenu(null);
              setSpawnMenu(null);
              setGrassMenu(null);
              setMobMenu(null);
            }}
          >
            <option value="town">town</option>
            <option value="forest">forest</option>
            <option value="dungeon">dungeon</option>
          </select>
          <span className="text-[10px] text-zinc-500">
            Черновик каждой локации автоматически сохраняется в localStorage этого
            браузера (отдельно для town, forest и dungeon).
          </span>
        </label>

        {locationId === "forest" ? (
          <details
            open
            className="rounded border border-zinc-800 bg-zinc-900/50 px-2 py-1.5 text-[11px] text-zinc-300"
          >
            <summary className="cursor-pointer select-none text-xs font-medium text-orange-200/90">
              Постоянные мобы леса ({forestPermanentMobs.length})
            </summary>
            <p className="mt-2 text-[10px] leading-snug text-zinc-500">
              Точки из <span className="font-mono">enemySpawns</span> (не случайные
              встречи). Удаление: кнопка ниже, <Kbd>Del</Kbd>, или ПКМ по маркеру на
              карте.
            </p>
            {forestPermanentMobs.length === 0 ? (
              <p className="mt-2 font-mono text-[10px] text-zinc-500">
                Список пуст — в игре для леса без поля в JSON используются значения по
                умолчанию из кода. Сохраните черновик с{" "}
                <span className="font-mono">enemySpawns: []</span>, чтобы убрать их
                полностью.
              </p>
            ) : (
              <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-0.5">
                {forestPermanentMobs.map((m, i) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-1 rounded border border-zinc-800/80 bg-zinc-950/80 px-2 py-1"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-[10px] text-orange-100/95">
                        {m.id}
                      </div>
                      <div className="text-[10px] text-zinc-500">
                        {m.mobVisualId} · {Math.round(m.x)}, {Math.round(m.y)}
                        {m.level != null ? ` · ур.${m.level}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 rounded border border-red-900/70 bg-red-950/50 px-2 py-0.5 text-[10px] text-red-200 hover:bg-red-900/60"
                      onClick={() => removeForestMobAtIndex(i)}
                    >
                      Удалить
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase text-zinc-500">
            Слой кликов (режим выбора)
          </span>
          <select
            className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1"
            value={interactionLayer}
            onChange={(e) =>
              setInteractionLayer(e.target.value as InteractionLayer)
            }
          >
            <option value="all">Все объекты</option>
            <option value="grass">Трава / дорога / земля</option>
            <option value="decor">Декор (камни, кусты)</option>
            <option value="trees">Деревья</option>
          </select>
          <span className="text-[10px] text-zinc-500">
            В узком слое клик попадает только в него — удобно править нижние слои без
            перекрытия деревьями.
          </span>
        </label>

        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2 text-xs">
          <div className="mb-1 font-medium text-zinc-300">Трава (генерация)</div>
          <label className="mb-2 flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-zinc-500">Seed (#RRGGBB)</span>
            <input
              className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 font-mono text-[11px]"
              value={grassSeedInput}
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value.trim();
                setGrassSeedInput(v);
                if (!/^#?[0-9a-fA-F]{6}$/.test(v)) return;
                setDraft((d) => {
                  const next = cloneLoc(d);
                  next.grassDecorSeed = parseHexOrInt(v);
                  return next;
                });
              }}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase text-zinc-500">
              Количество кустов
            </span>
            <input
              type="number"
              min={0}
              max={500}
              className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1"
              value={draft.grassDecorCount}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n) || n < 0) return;
                setDraft((d) => {
                  const next = cloneLoc(d);
                  next.grassDecorCount = Math.min(500, Math.floor(n));
                  return next;
                });
              }}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <label
            className="flex items-center gap-2 text-xs"
            title="Горячая клавиша: T"
          >
            <input
              type="checkbox"
              checked={showGrass}
              onChange={(e) => setShowGrass(e.target.checked)}
            />
            Трава <Kbd>T</Kbd>
          </label>
          <label
            className="flex items-center gap-2 text-xs"
            title="Горячая клавиша: O"
          >
            <input
              type="checkbox"
              checked={showOverlays}
              onChange={(e) => setShowOverlays(e.target.checked)}
            />
            Оверлеи <Kbd>O</Kbd>
          </label>
        </div>

        <div>
          <div className="mb-1 text-xs uppercase text-zinc-500">Инструмент</div>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["select", "Выбор", "1·V"],
                ["paint", "Кисть", "2·B"],
                ["spawn", "Спавн", "3·S"],
                ["npc", "NPC", "5·N"],
                ["mob", "Моб", "6·M"],
                ["grass", "Трава", "7·G"],
                ["path", "Дорожка", "8·R"],
                ["exit", "Переход", "9·P"],
                ["pan", "Просмотр", "4·H"],
              ] as const
            ).map(([id, label, keys]) => (
              <button
                key={id}
                type="button"
                title={`${label} (${keys.replace("·", " / ")})`}
                className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${
                  tool === id
                    ? "bg-amber-800 text-white"
                    : "bg-zinc-800 text-zinc-300"
                }`}
                onClick={() => setTool(id)}
              >
                {label}{" "}
                <span className="font-mono text-[10px] opacity-80">{keys}</span>
              </button>
            ))}
          </div>
        </div>

        {(tool === "paint" || tool === "select") && (
          <MapElementCatalog
            images={catalogImages}
            spritesheets={catalogSpritesheets}
            selectedKey={textureKey}
            onSelectKey={setTextureKey}
          />
        )}

        {(tool === "paint" || tool === "select") &&
        selectedPaintCatalogItem?.type === "spritesheet" &&
        selectedPaintCatalogItem.frameWidth &&
        selectedPaintCatalogItem.frameHeight ? (
          <SpriteSheetFramePicker
            imageUrl={selectedPaintCatalogItem.url}
            frameWidth={selectedPaintCatalogItem.frameWidth}
            frameHeight={selectedPaintCatalogItem.frameHeight}
            frameCount={selectedPaintCatalogItem.frameCount}
            value={paintFrame}
            onChange={setPaintFrame}
          />
        ) : null}

        {tool === "paint" || selectedPropIndex !== null ? (
          <label className="flex flex-col gap-1 text-xs">
            Коллайдер{tool === "paint" ? " для новых пропов" : ""}
            <select
              className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1"
              value={colliderPresetId}
              onChange={(e) => setColliderPresetId(e.target.value)}
            >
              {COLLIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {selectedPropIndex !== null ? (
              <button
                type="button"
                className="rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-[11px] hover:bg-zinc-700"
                onClick={() => {
                  const idx = selectedPropIndex;
                  if (idx === null) return;
                  setDraft((d) => {
                    const next = cloneLoc(d);
                    const p = next.imageProps[idx];
                    if (!p) return d;
                    const coll = presetCollider(colliderPresetId);
                    next.imageProps = next.imageProps.map((pp, i) =>
                      i === idx ? { ...pp, collider: coll } : pp
                    );
                    return next;
                  });
                }}
              >
                Применить к выделенному пропу
              </button>
            ) : null}
            <span className="text-[10px] text-zinc-500">
              «Полный кадр» — коллайдер по всему спрайту (для стен и любых
              предметов, вырезанных из тайлсета).
            </span>
          </label>
        ) : null}

        {tool === "spawn" ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-zinc-500">Ключ спавна</span>
            <select
              className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1"
              value={spawnKey}
              onChange={(e) => setSpawnKey(e.target.value)}
            >
              {spawnKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {tool === "npc" && locationId === "town" ? (
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-zinc-500">
              Какого NPC ставить
            </span>
            <select
              className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1"
              value={npcPaintId}
              onChange={(e) => setNpcPaintId(e.target.value)}
            >
              {Object.keys(draft.npcIdleTexture).map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-zinc-500">
              ЛКМ по карте — поставить точку «ног»; перетаскивание в «Выбор» или
              «NPC».
            </span>
          </label>
        ) : null}

        {tool === "grass" ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase text-zinc-500">
              Вариант куста (кадр 0..3)
            </span>
            <div className="flex flex-wrap gap-1">
              {[0, 1, 2, 3].map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`rounded px-2 py-1 font-mono text-xs ${
                    grassPaintVariant === v
                      ? "bg-lime-800 text-white"
                      : "bg-zinc-800 text-zinc-300"
                  }`}
                  onClick={() => setGrassPaintVariant(v)}
                >
                  {v}
                </button>
              ))}
            </div>
            <span className="text-[10px] text-zinc-500">
              ЛКМ — поставить куст; перетаскивание — передвинуть; <Kbd>Del</Kbd>{" "}
              — удалить выбранный.
            </span>
          </div>
        ) : null}

        {tool === "path" ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase text-zinc-500">
              Инструмент «Дорожка»
            </span>
            <span className="text-[10px] text-zinc-500">
              ЛКМ-тяни по карте — новый сегмент; клик по существующей дороге
              выделяет и позволяет тащить; <Kbd>Del</Kbd> — удалить выбранный.
            </span>
          </div>
        ) : null}

        {tool === "exit" ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase text-zinc-500">
              Инструмент «Переход»
            </span>
            <span className="text-[10px] text-zinc-500">
              ЛКМ-тяни по карте — новая зона выхода (как у дороги). Клик по синей
              зоне — выделить и тащить в «Выбор» или здесь. Цель и подпись
              редактируются внизу после выбора. <Kbd>Del</Kbd> — удалить выбранный
              переход.
            </span>
          </div>
        ) : null}

        {tool === "mob" ? (
          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase text-zinc-500">
              Шаблон моба
            </span>
            <select
              className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1"
              value={mobPresetIndex}
              onChange={(e) => setMobPresetIndex(Number(e.target.value))}
            >
              {MOB_EDITOR_PRESETS.map((p, i) => (
                <option key={i} value={i}>
                  {p.mobVisualId} · {p.zoneId} · {p.lootTable}
                </option>
              ))}
            </select>
            <div className="mt-2 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-zinc-500">
                Уровень новых мобов (1–{ENEMY_LEVEL_MAX})
              </span>
              <input
                type="number"
                min={1}
                max={ENEMY_LEVEL_MAX}
                className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 font-mono text-[11px]"
                value={mobPlaceLevel}
                onChange={(e) =>
                  setMobPlaceLevel(clampMobEditorLevel(Number(e.target.value)))
                }
              />
            </div>
            <span className="text-[10px] text-zinc-500">
              ЛКМ по карте — новый спавн; перетаскивание в «Выбор» или «Моб».
            </span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 rounded border border-zinc-800 p-2 text-xs">
          <span className="text-zinc-500">Выделение:</span>
          {selectedPropIndex !== null ? (
            <span>
              проп #{selectedPropIndex}{" "}
              <button
                type="button"
                className="text-red-400 underline hover:text-red-300"
                onClick={deleteSelected}
              >
                Удалить
              </button>
            </span>
          ) : selectedSpawnKey ? (
            <span>спавн «{selectedSpawnKey}»</span>
          ) : selectedNpcId ? (
            <span>
              NPC «{selectedNpcId}»{" "}
              <button
                type="button"
                className="text-red-400 underline hover:text-red-300"
                onClick={() => {
                  setDraft((d) => {
                    const next = cloneLoc(d);
                    const o = { ...(next.npcSpawnOverrides ?? {}) };
                    delete o[selectedNpcId];
                    if (Object.keys(o).length === 0) {
                      delete next.npcSpawnOverrides;
                    } else {
                      next.npcSpawnOverrides = o;
                    }
                    return next;
                  });
                  setSelectedNpcId(null);
                }}
              >
                Сброс позиции
              </button>
            </span>
          ) : selectedMobIndex !== null ? (
            <span className="flex flex-wrap items-center gap-2">
              <span>моб #{selectedMobIndex}</span>
              <label className="flex items-center gap-1 text-zinc-400">
                ур.
                <input
                  type="number"
                  min={1}
                  max={ENEMY_LEVEL_MAX}
                  className="w-14 rounded border border-zinc-600 bg-zinc-900 px-1 py-0.5 font-mono text-[11px]"
                  value={selectedMobLevel}
                  onChange={(e) => {
                    const i = selectedMobIndex;
                    const v = clampMobEditorLevel(Number(e.target.value));
                    setDraft((d) => {
                      if (i === null) return d;
                      const next = cloneLoc(d);
                      const list = cloneForestMobs(next);
                      if (i < 0 || i >= list.length) return d;
                      list[i] = { ...list[i], level: v };
                      next.enemySpawns = list;
                      return next;
                    });
                  }}
                />
              </label>
              <button
                type="button"
                className="text-red-400 underline hover:text-red-300"
                onClick={() => {
                  if (selectedMobIndex === null) return;
                  removeForestMobAtIndex(selectedMobIndex);
                }}
              >
                Удалить
              </button>
            </span>
          ) : worldPick?.kind === "ground" ? (
            <span className="text-slate-300">земля / фон</span>
          ) : worldPick?.kind === "grass" ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-lime-300/90">трава #{worldPick.index}</span>
              <button
                type="button"
                className="text-red-400 underline hover:text-red-300"
                onClick={() => {
                  const i = worldPick.index;
                  setDraft((d) => {
                    const next = cloneLoc(d);
                    const items = ensureGrassItems(next, next.id);
                    if (i < 0 || i >= items.length) return d;
                    items.splice(i, 1);
                    next.grassDecorItems = items;
                    return next;
                  });
                  setWorldPick(null);
                }}
              >
                Удалить
              </button>
            </span>
          ) : worldPick?.kind === "path" ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-emerald-300/90">
                дорога, сегмент #{worldPick.segmentIndex}
              </span>
              <button
                type="button"
                className="text-red-400 underline hover:text-red-300"
                onClick={() => {
                  const i = worldPick.segmentIndex;
                  setDraft((d) => {
                    const next = cloneLoc(d);
                    if (i < 0 || i >= next.pathSegments.length) return d;
                    next.pathSegments = next.pathSegments.filter(
                      (_, j) => j !== i
                    );
                    return next;
                  });
                  setWorldPick(null);
                }}
              >
                Удалить
              </button>
            </span>
          ) : worldPick?.kind === "exit" ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sky-300/90">
                переход #{worldPick.index}{" "}
                <span className="font-mono text-zinc-400">
                  → {draft.exits[worldPick.index]?.targetLocationId}
                </span>
              </span>
              <button
                type="button"
                className="text-red-400 underline hover:text-red-300"
                onClick={() => {
                  const i = worldPick.index;
                  setDraft((d) => {
                    const next = cloneLoc(d);
                    if (i < 0 || i >= next.exits.length) return d;
                    next.exits = next.exits.filter((_, j) => j !== i);
                    return next;
                  });
                  setWorldPick(null);
                }}
              >
                Удалить
              </button>
            </span>
          ) : worldPick?.kind === "anim" ? (
            <span className="text-orange-300/90">
              аним-станция #{worldPick.stationIndex}
            </span>
          ) : (
            <span className="text-zinc-600">нет</span>
          )}
        </div>

        {worldPick?.kind === "path" &&
        draft.pathSegments[worldPick.segmentIndex] ? (
          <div className="rounded border border-emerald-900/60 bg-emerald-950/20 p-2 text-xs">
            <div className="mb-1 text-emerald-300/90">
              Сегмент #{worldPick.segmentIndex}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(["x", "y", "w", "h"] as const).map((k) => {
                const seg = draft.pathSegments[worldPick.segmentIndex];
                const v = seg ? seg[k] : 0;
                return (
                  <label key={k} className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase text-zinc-500">
                      {k}
                    </span>
                    <input
                      type="number"
                      className="rounded border border-zinc-600 bg-zinc-900 px-1 font-mono text-[11px]"
                      value={v}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        const i = worldPick.segmentIndex;
                        setDraft((d) => {
                          const next = cloneLoc(d);
                          const row = next.pathSegments[i];
                          if (!row) return d;
                          next.pathSegments = [...next.pathSegments];
                          next.pathSegments[i] = { ...row, [k]: n };
                          return next;
                        });
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {worldPick?.kind === "exit" && draft.exits[worldPick.index] ? (
          <div className="rounded border border-sky-900/60 bg-sky-950/20 p-2 text-xs">
            <div className="mb-1 text-sky-300/90">
              Переход #{worldPick.index}
            </div>
            <label className="mb-2 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-zinc-500">id</span>
              <input
                type="text"
                className="rounded border border-zinc-600 bg-zinc-900 px-1 font-mono text-[11px]"
                value={draft.exits[worldPick.index]!.id}
                onChange={(e) => {
                  const i = worldPick.index;
                  const v = e.target.value;
                  setDraft((d) => {
                    const next = cloneLoc(d);
                    const row = next.exits[i];
                    if (!row) return d;
                    next.exits = [...next.exits];
                    next.exits[i] = { ...row, id: v };
                    return next;
                  });
                }}
              />
            </label>
            <label className="mb-2 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-zinc-500">
                Целевая локация
              </span>
              <select
                className="rounded border border-zinc-600 bg-zinc-900 px-1 py-0.5 font-mono text-[11px]"
                value={draft.exits[worldPick.index]!.targetLocationId}
                onChange={(e) => {
                  const i = worldPick.index;
                  const loc = e.target.value as LocationExit["targetLocationId"];
                  setDraft((d) => {
                    const next = cloneLoc(d);
                    const row = next.exits[i];
                    if (!row) return d;
                    next.exits = [...next.exits];
                    next.exits[i] = { ...row, targetLocationId: loc };
                    return next;
                  });
                }}
              >
                <option value="town">town</option>
                <option value="forest">forest</option>
                <option value="dungeon">dungeon</option>
              </select>
            </label>
            <label className="mb-2 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-zinc-500">
                targetSpawnId
              </span>
              <input
                type="text"
                className="rounded border border-zinc-600 bg-zinc-900 px-1 font-mono text-[11px]"
                value={draft.exits[worldPick.index]!.targetSpawnId}
                onChange={(e) => {
                  const i = worldPick.index;
                  const v = e.target.value;
                  setDraft((d) => {
                    const next = cloneLoc(d);
                    const row = next.exits[i];
                    if (!row) return d;
                    next.exits = [...next.exits];
                    next.exits[i] = { ...row, targetSpawnId: v };
                    return next;
                  });
                }}
              />
            </label>
            <label className="mb-2 flex flex-col gap-0.5">
              <span className="text-[10px] uppercase text-zinc-500">
                Подпись (label)
              </span>
              <input
                type="text"
                className="rounded border border-zinc-600 bg-zinc-900 px-1 text-[11px]"
                value={draft.exits[worldPick.index]!.label ?? ""}
                onChange={(e) => {
                  const i = worldPick.index;
                  const v = e.target.value;
                  setDraft((d) => {
                    const next = cloneLoc(d);
                    const row = next.exits[i];
                    if (!row) return d;
                    next.exits = [...next.exits];
                    next.exits[i] = {
                      ...row,
                      label: v.trim() === "" ? undefined : v,
                    };
                    return next;
                  });
                }}
              />
            </label>
            <div className="grid grid-cols-4 gap-1">
              {(["x", "y", "w", "h"] as const).map((k) => {
                const ex = draft.exits[worldPick.index];
                const v = ex ? ex[k] : 0;
                return (
                  <label key={k} className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase text-zinc-500">
                      {k}
                    </span>
                    <input
                      type="number"
                      className="rounded border border-zinc-600 bg-zinc-900 px-1 font-mono text-[11px]"
                      value={v}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        const i = worldPick.index;
                        setDraft((d) => {
                          const next = cloneLoc(d);
                          const row = next.exits[i];
                          if (!row) return d;
                          next.exits = [...next.exits];
                          next.exits[i] = { ...row, [k]: n };
                          return next;
                        });
                      }}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {worldPick?.kind === "grass" && (() => {
          const list = draft.grassDecorItems ?? getGrassDecor(draft.id);
          const g = list[worldPick.index];
          if (!g) return null;
          return (
            <div className="rounded border border-lime-900/60 bg-lime-950/20 p-2 text-xs">
              <div className="mb-1 text-lime-300/90">
                Трава #{worldPick.index}
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(["x", "y"] as const).map((k) => (
                  <label key={k} className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase text-zinc-500">
                      {k}
                    </span>
                    <input
                      type="number"
                      className="rounded border border-zinc-600 bg-zinc-900 px-1 font-mono text-[11px]"
                      value={g[k]}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (!Number.isFinite(n)) return;
                        const i = worldPick.index;
                        setDraft((d) => {
                          const next = cloneLoc(d);
                          const items = ensureGrassItems(next, next.id);
                          const row = items[i];
                          if (!row) return d;
                          items[i] = { ...row, [k]: n };
                          next.grassDecorItems = items;
                          return next;
                        });
                      }}
                    />
                  </label>
                ))}
                <label className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase text-zinc-500">
                    вариант
                  </span>
                  <select
                    className="rounded border border-zinc-600 bg-zinc-900 px-1 font-mono text-[11px]"
                    value={g.variant}
                    onChange={(e) => {
                      const v = Math.max(0, Math.floor(Number(e.target.value)));
                      const i = worldPick.index;
                      setDraft((d) => {
                        const next = cloneLoc(d);
                        const items = ensureGrassItems(next, next.id);
                        const row = items[i];
                        if (!row) return d;
                        items[i] = { ...row, variant: v };
                        next.grassDecorItems = items;
                        return next;
                      });
                    }}
                  >
                    {[0, 1, 2, 3].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          );
        })()
        }

        <div>
          <div className="mb-1 text-xs uppercase text-zinc-500">
            Сегменты путей ({draft.pathSegments.length})
          </div>
          <div className="grid grid-cols-4 gap-1 text-xs">
            <input
              className="rounded border border-zinc-600 bg-zinc-900 px-1"
              type="number"
              placeholder="x"
              value={pathForm.x}
              onChange={(e) =>
                setPathForm((f) => ({ ...f, x: Number(e.target.value) }))
              }
            />
            <input
              className="rounded border border-zinc-600 bg-zinc-900 px-1"
              type="number"
              placeholder="y"
              value={pathForm.y}
              onChange={(e) =>
                setPathForm((f) => ({ ...f, y: Number(e.target.value) }))
              }
            />
            <input
              className="rounded border border-zinc-600 bg-zinc-900 px-1"
              type="number"
              placeholder="w"
              value={pathForm.w}
              onChange={(e) =>
                setPathForm((f) => ({ ...f, w: Number(e.target.value) }))
              }
            />
            <input
              className="rounded border border-zinc-600 bg-zinc-900 px-1"
              type="number"
              placeholder="h"
              value={pathForm.h}
              onChange={(e) =>
                setPathForm((f) => ({ ...f, h: Number(e.target.value) }))
              }
            />
          </div>
          <button
            type="button"
            className="mt-1 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-700"
            onClick={addPathSegment}
          >
            Добавить сегмент
          </button>
          <ul className="mt-2 max-h-24 overflow-y-auto text-[11px] text-zinc-400">
            {draft.pathSegments.map((s, i) => (
              <li
                key={`p-${i}-${s.x}-${s.y}`}
                className="flex justify-between gap-1 border-b border-zinc-800 py-0.5"
              >
                <span>
                  {i}: {Math.round(s.x)},{Math.round(s.y)} {Math.round(s.w)}×
                  {Math.round(s.h)}
                </span>
                <button
                  type="button"
                  className="text-red-400 hover:underline"
                  onClick={() => removePathSegment(i)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-1 text-xs uppercase text-zinc-500">
            Пропы ({draft.imageProps.length})
          </div>
          <ul className="max-h-32 overflow-y-auto text-[11px]">
            {draft.imageProps.map((p, i) => (
              <li
                key={`prop-${i}-${p.texture}-${p.x}`}
                className="flex items-center justify-between gap-1 border-b border-zinc-800 py-0.5"
              >
                <button
                  type="button"
                  className={`text-left hover:underline ${
                    selectedPropIndex === i
                      ? "text-amber-300"
                      : "text-zinc-300"
                  }`}
                  onClick={() => {
                    setSelectedPropIndex(i);
                    setSelectedSpawnKey(null);
                  }}
                >
                  {i} {p.texture}
                  {p.frame !== undefined ? ` #${p.frame}` : ""} @{" "}
                  {Math.round(p.x)},{Math.round(p.y)}
                </button>
                <button
                  type="button"
                  className="text-red-400 hover:underline"
                  onClick={() => removeProp(i)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-zinc-700 pt-2">
          <button
            type="button"
            title="Ctrl+Shift+C"
            className="rounded bg-emerald-900/80 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-800"
            onClick={() => void copyJson()}
          >
            JSON → буфер
          </button>
          <button
            type="button"
            title="Ctrl+Shift+D"
            className="rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            onClick={downloadJson}
          >
            Скачать .json
          </button>
        </div>
        {exportNotice ? (
          <p className="text-xs text-emerald-400/90" role="status">
            {exportNotice}
          </p>
        ) : null}
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div
          ref={hostRef}
          tabIndex={0}
          role="application"
          aria-label="Карта локации"
          className="mx-auto w-full max-w-[min(100%,min(1600px,96vw))] shrink-0 overflow-hidden rounded-lg border border-zinc-700 bg-black outline-none focus-visible:ring-2 focus-visible:ring-amber-600/50"
          style={{
            aspectRatio: `${WORLD.width} / ${WORLD.height}`,
            maxHeight: "min(92vh, calc(100vw * 0.75))",
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const g = gameRef.current;
            const scene = g?.scene.getScene("MapEditScene") as
              | MapEditScene
              | undefined;
            scene?.openContextMenuFromDomClient(e.clientX, e.clientY);
          }}
          onMouseDown={(e) => {
            if (e.button === 0) hostRef.current?.focus({ preventScroll: true });
          }}
        />
      </div>
    </div>

    {propMenu ? (
      <SelectionContextMenu
        type="prop"
        payload={propMenu}
        textureLabel={
          draft.imageProps[propMenu.propIndex]?.texture ?? "?"
        }
        onDuplicate={() => duplicateProp(propMenu.propIndex)}
        onDelete={() => removeProp(propMenu.propIndex)}
        onClose={closeMenus}
      />
    ) : null}
    {spawnMenu ? (
      <SelectionContextMenu
        type="spawn"
        payload={spawnMenu}
        onClose={closeMenus}
      />
    ) : null}
    {grassMenu ? (
      <SelectionContextMenu
        type="grass"
        payload={grassMenu}
        onClose={closeMenus}
      />
    ) : null}
    {mobMenu ? (
      <SelectionContextMenu
        type="mob"
        payload={mobMenu}
        mobLabel={(() => {
          const row = cloneForestMobs(draft)[mobMenu.mobIndex];
          return row ? `${row.id} · ${row.mobVisualId}` : "?";
        })()}
        onDelete={() => removeForestMobAtIndex(mobMenu.mobIndex)}
        onClose={closeMenus}
      />
    ) : null}
    </>
  );
}
