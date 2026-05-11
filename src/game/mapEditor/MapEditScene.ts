import * as Phaser from "phaser";
import type { AssetManifest } from "@/src/game/types";
import { getGrassDecor } from "@/src/game/locations";
import {
  addGroundDisplay,
  addPathDirtLayer,
} from "@/src/game/locations/groundDisplay";
import type {
  GameLocation,
  LocationEnemySpawn,
  LocationId,
} from "@/src/game/locations/types";
import { CAMERA_ZOOM_PLAY } from "@/src/game/locations/types";
import {
  isDecorPropTexture,
  isTreePropTexture,
} from "@/src/game/mapEditor/mapEditorLayerTaxonomy";
import { ENEMY_SPAWNS } from "@/src/game/data/combatWorld";
import {
  ASSET_SLICE_OVERRIDES_TEXTURES_APPLIED,
  getEffectivePropCollider,
} from "@/src/game/load/assetSliceOverridesRuntime";
import { ensureCroppedPropTexture } from "@/src/game/load/croppedPropTexture";

const DEPTH_OVERLAY = 10000;
const DEPTH_SPAWN_MARKER = 9990;
/** Текстура дороги поверх земли, под кустами/пропами. */
const DEPTH_PATH_DIRT = -1.5;
/** Невидимые зоны дороги — выше земли, ниже пропов по глубине Y. */
const DEPTH_PATH_HIT = 100;

const MAP_EDITOR_ZOOM_MIN = 0.5;
const MAP_EDITOR_ZOOM_MAX = 4;

export type MapEditorBridgeTool =
  | "select"
  | "paint"
  | "pan"
  | "spawn"
  | "npc"
  | "mob"
  | "grass"
  | "path"
  | "exit";

export type WorldPick =
  | null
  | { kind: "grass"; index: number }
  | { kind: "path"; segmentIndex: number }
  | { kind: "exit"; index: number }
  | { kind: "anim"; stationIndex: number }
  | { kind: "ground" };

export type InteractionLayer = "all" | "grass" | "decor" | "trees";

export type MapEditorBridge = {
  tool: MapEditorBridgeTool;
  selectedPropIndex: number | null;
  selectedSpawnKey: string | null;
  /** Выбранный NPC (маркер на карте, town). */
  selectedNpcId: string | null;
  /** Выбранный моб по индексу в `enemySpawns` (как в игре, с дефолтом `ENEMY_SPAWNS`). */
  selectedMobIndex: number | null;
  /** Какой NPC ставит инструмент «NPC» (town). */
  npcPaintId: string;
  /** Шаблон моба для инструмента «Моб» (индекс в `MOB_EDITOR_PRESETS`). */
  mobPresetIndex: number;
  /** Уровень для новых мобов (инструмент «Моб»). */
  mobPlaceLevel: number;
  /** Вариант куста для инструмента «Трава» (кадр grass_decor: 0..3). */
  grassPaintVariant: number;
  /** Для инструмента «Дорожка»: драг LMB создаёт прямоугольник; эти значения — fallback если драг < `dragSlopPx` (ставим маленький сегмент). */
  pathPlaceWidth: number;
  pathPlaceHeight: number;
  worldPick: WorldPick;
  interactionLayer: InteractionLayer;
};

type DragState =
  | {
      kind: "prop";
      index: number;
      grabDx: number;
      grabDy: number;
      sprite: Phaser.GameObjects.Image;
    }
  | {
      kind: "spawn";
      key: string;
      grabDx: number;
      grabDy: number;
      marker: Phaser.GameObjects.Arc;
    }
  | {
      kind: "npc";
      npcId: string;
      grabDx: number;
      grabDy: number;
      marker: Phaser.GameObjects.Arc;
    }
  | {
      kind: "mob";
      index: number;
      grabDx: number;
      grabDy: number;
      marker: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite;
    }
  | {
      kind: "grass";
      index: number;
      grabDx: number;
      grabDy: number;
      sprite: Phaser.GameObjects.Image;
    }
  | {
      kind: "path";
      segmentIndex: number;
      grabDx: number;
      grabDy: number;
      dirtSprites: Phaser.GameObjects.GameObject[];
      hitRect: Phaser.GameObjects.Rectangle;
    }
  /** Рисование нового прямоугольника дороги инструментом «Дорожка». */
  | {
      kind: "pathDraw";
      startX: number;
      startY: number;
      preview: Phaser.GameObjects.Rectangle;
    }
  /** Перетаскивание зоны перехода между локациями. */
  | {
      kind: "exit";
      index: number;
      grabDx: number;
      grabDy: number;
      hitRect: Phaser.GameObjects.Rectangle;
    }
  /** Новый переход: ЛКМ-тянуть прямоугольник (как дорожка). */
  | {
      kind: "exitDraw";
      startX: number;
      startY: number;
      preview: Phaser.GameObjects.Rectangle;
    };

type PendingPick =
  | {
      kind: "prop";
      index: number;
      sprite: Phaser.GameObjects.Image;
      startCx: number;
      startCy: number;
    }
  | {
      kind: "spawn";
      key: string;
      marker: Phaser.GameObjects.Arc;
      startCx: number;
      startCy: number;
    }
  | {
      kind: "npc";
      npcId: string;
      marker: Phaser.GameObjects.Arc;
      startCx: number;
      startCy: number;
    }
  | {
      kind: "mob";
      index: number;
      marker: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite;
      startCx: number;
      startCy: number;
    }
  | {
      kind: "grass";
      index: number;
      sprite: Phaser.GameObjects.Image;
      startCx: number;
      startCy: number;
    }
  | {
      kind: "path";
      segmentIndex: number;
      dirtSprites: Phaser.GameObjects.GameObject[];
      hitRect: Phaser.GameObjects.Rectangle;
      startCx: number;
      startCy: number;
    }
  | {
      kind: "exit";
      index: number;
      hitRect: Phaser.GameObjects.Rectangle;
      startCx: number;
      startCy: number;
    };

type CameraPanState = {
  startScrollX: number;
  startScrollY: number;
  startPointerX: number;
  startPointerY: number;
};

type MapEditorKind =
  | "prop"
  | "spawn"
  | "npcMarker"
  | "mobMarker"
  | "animStation"
  | "exit"
  | "grass"
  | "path"
  | "ground";

const KIND_PRIORITY: MapEditorKind[] = [
  "prop",
  "spawn",
  "npcMarker",
  "mobMarker",
  "animStation",
  "exit",
  "grass",
  "path",
  "ground",
];

export class MapEditScene extends Phaser.Scene {
  private disposables: Phaser.GameObjects.GameObject[] = [];
  /** Для перетаскивания дорожек: индекс сегмента → его dirt-спрайты. */
  private pathDirtByIndex = new Map<number, Phaser.GameObjects.GameObject[]>();
  /** Индекс сегмента → его невидимая hit-рамка. */
  private pathHitByIndex = new Map<number, Phaser.GameObjects.Rectangle>();
  /** Индекс выхода → hit-рамка (центр как у дороги). */
  private exitHitByIndex = new Map<number, Phaser.GameObjects.Rectangle>();
  /** Индекс → sprite травинки (для drag/selection). */
  private grassSpriteByIndex = new Map<number, Phaser.GameObjects.Image>();
  private overlayG!: Phaser.GameObjects.Graphics;
  private selectionG!: Phaser.GameObjects.Graphics;
  private showGrass = true;
  private showOverlays = true;
  private bridge: MapEditorBridge = {
    tool: "select",
    selectedPropIndex: null,
    selectedSpawnKey: null,
    selectedNpcId: null,
    selectedMobIndex: null,
    npcPaintId: "elena",
    mobPresetIndex: 0,
    mobPlaceLevel: 1,
    grassPaintVariant: 0,
    pathPlaceWidth: 200,
    pathPlaceHeight: 44,
    worldPick: null,
    interactionLayer: "all",
  };
  private drag: DragState | null = null;
  private pending: PendingPick | null = null;
  private readonly dragSlopPx = 7;
  private cameraPan: CameraPanState | null = null;
  /** Отложенный applyLocation, пока идёт перетаскивание / ожидание slop. */
  private pendingApply: { loc: GameLocation; locId: LocationId } | null = null;
  /** Кэш для getWorldPoint — без лишних аллокаций. */
  private readonly worldPointScratch = new Phaser.Math.Vector2();
  private sliceTexturesAppliedHandler: (() => void) | null = null;

  constructor() {
    super({ key: "MapEditScene" });
  }

  create(): void {
    this.overlayG = this.add.graphics();
    this.overlayG.setDepth(DEPTH_OVERLAY);

    this.selectionG = this.add.graphics();
    this.selectionG.setDepth(DEPTH_OVERLAY + 1);

    this.input.on("pointerdown", this.onPointerDown, this);
    this.input.on("pointermove", this.onPointerMove, this);
    this.input.on("pointerup", this.onPointerUp, this);
    this.input.on("pointerupoutside", this.onPointerUp, this);
    this.input.on("wheel", this.onWheel, this);

    const initial = this.registry.get("mapEditorInitial") as
      | { loc: GameLocation; locId: LocationId }
      | undefined;
    if (initial) {
      this.applyLocation(initial.loc, initial.locId);
    }

    this.sliceTexturesAppliedHandler = () => {
      const last = this.registry.get("mapEditorLastPayload") as
        | { loc: GameLocation; locId: LocationId }
        | undefined;
      if (last && this.showOverlays) {
        this.drawOverlays(last.loc);
      }
    };
    if (typeof window !== "undefined" && this.sliceTexturesAppliedHandler) {
      window.addEventListener(
        ASSET_SLICE_OVERRIDES_TEXTURES_APPLIED,
        this.sliceTexturesAppliedHandler
      );
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (
        typeof window !== "undefined" &&
        this.sliceTexturesAppliedHandler
      ) {
        window.removeEventListener(
          ASSET_SLICE_OVERRIDES_TEXTURES_APPLIED,
          this.sliceTexturesAppliedHandler
        );
        this.sliceTexturesAppliedHandler = null;
      }
    });
  }

  setBridge(bridge: MapEditorBridge): void {
    this.bridge = { ...bridge };
    this.refreshSelectionHighlight();
  }

  setOptions(opts: { showGrass?: boolean; showOverlays?: boolean }): void {
    if (opts.showGrass !== undefined) this.showGrass = opts.showGrass;
    if (opts.showOverlays !== undefined) this.showOverlays = opts.showOverlays;
    const last = this.registry.get("mapEditorLastPayload") as
      | { loc: GameLocation; locId: LocationId }
      | undefined;
    if (last) this.applyLocation(last.loc, last.locId);
  }

  private clearWorld(): void {
    for (const o of this.disposables) {
      o.destroy();
    }
    this.disposables = [];
    this.pathDirtByIndex.clear();
    this.pathHitByIndex.clear();
    this.exitHitByIndex.clear();
    this.grassSpriteByIndex.clear();
    this.overlayG.clear();
    this.selectionG.clear();
  }

  applyLocation(loc: GameLocation, locId: LocationId): void {
    if (
      this.drag !== null ||
      this.pending !== null ||
      this.cameraPan !== null
    ) {
      this.pendingApply = { loc, locId };
      return;
    }
    this.doApplyLocation(loc, locId);
  }

  private doApplyLocation(loc: GameLocation, locId: LocationId): void {
    const prevPayload = this.registry.get("mapEditorLastPayload") as
      | { loc: GameLocation; locId: LocationId }
      | undefined;
    const cam = this.cameras.main;
    /** Не сбрасывать вид при каждом клике/обновлении draft — иначе зум и центр скачут. */
    const preserveView =
      prevPayload != null &&
      prevPayload.locId === locId &&
      prevPayload.loc.world.width === loc.world.width &&
      prevPayload.loc.world.height === loc.world.height;
    const savedZoom = preserveView ? cam.zoom : null;
    const savedScrollX = preserveView ? cam.scrollX : null;
    const savedScrollY = preserveView ? cam.scrollY : null;

    this.registry.set("mapEditorLastPayload", { loc, locId });
    this.drag = null;
    this.pending = null;
    this.cameraPan = null;
    this.clearWorld();

    const W = loc.world.width;
    const H = loc.world.height;
    this.physics.world.setBounds(0, 0, W, H);

    const bg = this.add
      .rectangle(0, 0, W, H, loc.backgroundFill)
      .setOrigin(0, 0)
      .setDepth(-10);
    this.disposables.push(bg);

    const ground = addGroundDisplay(
      this,
      loc.groundTextureKey,
      W,
      H,
      -2
    );
    ground.setData("mapEditorKind", "ground");
    ground.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, W, H),
      Phaser.Geom.Rectangle.Contains
    );
    this.disposables.push(ground);

    loc.pathSegments.forEach((seg, segmentIndex) => {
      const dirts = addPathDirtLayer(this, [seg], DEPTH_PATH_DIRT);
      for (const o of dirts) {
        this.disposables.push(o);
      }
      this.pathDirtByIndex.set(segmentIndex, dirts);

      const z = this.add.rectangle(
        seg.x + seg.w / 2,
        seg.y + seg.h / 2,
        seg.w,
        seg.h,
        0x000000,
        0
      );
      z.setDepth(DEPTH_PATH_HIT);
      z.setData("mapEditorKind", "path");
      z.setData("mapEditorPathIndex", segmentIndex);
      z.setInteractive(
        new Phaser.Geom.Rectangle(-seg.w / 2, -seg.h / 2, seg.w, seg.h),
        Phaser.Geom.Rectangle.Contains
      );
      this.disposables.push(z);
      this.pathHitByIndex.set(segmentIndex, z);
    });

    loc.exits.forEach((ex, exitIndex) => {
      const z = this.add.rectangle(
        ex.x + ex.w / 2,
        ex.y + ex.h / 2,
        ex.w,
        ex.h,
        0x000000,
        0
      );
      z.setDepth(DEPTH_PATH_HIT + 2);
      z.setData("mapEditorKind", "exit");
      z.setData("mapEditorExitIndex", exitIndex);
      z.setInteractive(
        new Phaser.Geom.Rectangle(-ex.w / 2, -ex.h / 2, ex.w, ex.h),
        Phaser.Geom.Rectangle.Contains
      );
      this.disposables.push(z);
      this.exitHitByIndex.set(exitIndex, z);
    });

    if (this.showGrass) {
      const decorList = getGrassDecor(locId);
      decorList.forEach((d, grassIndex) => {
        const spr = this.add
          .image(d.x, d.y, "grass_decor", d.variant)
          .setOrigin(0.5, 1);
        spr.setDepth(d.y - 0.15);
        spr.setData("mapEditorKind", "grass");
        spr.setData("mapEditorGrassIndex", grassIndex);
        if (this.textures.exists("grass_decor")) {
          const fr = this.textures.getFrame("grass_decor", d.variant);
          const fw = fr.width;
          const fh = fr.height;
          spr.setInteractive(
            new Phaser.Geom.Rectangle(-fw / 2, -fh, fw, fh),
            Phaser.Geom.Rectangle.Contains
          );
        }
        this.disposables.push(spr);
        this.grassSpriteByIndex.set(grassIndex, spr);
      });
    }

    loc.imageProps.forEach((p, index) => {
      let texKey = p.texture;
      if (p.textureCrop) {
        const ck = ensureCroppedPropTexture(this, p.texture, p.textureCrop);
        if (!ck) return;
        texKey = ck;
      }
      const img =
        p.frame !== undefined && !p.textureCrop
          ? this.add.image(p.x, p.y, texKey, p.frame).setOrigin(0.5, 1)
          : this.add.image(p.x, p.y, texKey).setOrigin(0.5, 1);
      img.setDepth(p.y);
      img.setData("mapEditorKind", "prop");
      img.setData("mapEditorPropIndex", index);
      const fr = this.textures.getFrame(texKey);
      const w = fr.width;
      const h = fr.height;
      img.setInteractive(
        new Phaser.Geom.Rectangle(-w / 2, -h, w, h),
        Phaser.Geom.Rectangle.Contains
      );
      this.disposables.push(img);
    });

    loc.animStations.forEach((s, stationIndex) => {
      const spr = this.add.sprite(s.x, s.y, s.texture, 0).setOrigin(0.5, 1);
      spr.setDepth(s.y);
      if (this.anims.exists(s.animKey)) {
        spr.play(s.animKey);
      }
      this.disposables.push(spr);

      const c = s.collider;
      const zone = this.add.rectangle(c.x, c.y, c.w, c.h, 0x000000, 0);
      zone.setDepth(s.y + 0.05);
      zone.setData("mapEditorKind", "animStation");
      zone.setData("mapEditorAnimIndex", stationIndex);
      zone.setInteractive(
        new Phaser.Geom.Rectangle(-c.w / 2, -c.h / 2, c.w, c.h),
        Phaser.Geom.Rectangle.Contains
      );
      this.disposables.push(zone);
    });

    const spawnEntries = Object.entries(loc.spawns);
    for (const [key, sp] of spawnEntries) {
      const c = this.add.circle(sp.x, sp.y, 13, 0xfacc15, 0.28);
      c.setStrokeStyle(2, 0xeab308, 0.95);
      c.setDepth(DEPTH_SPAWN_MARKER);
      c.setData("mapEditorKind", "spawn");
      c.setData("mapEditorSpawnKey", key);
      c.setInteractive(
        new Phaser.Geom.Circle(0, 0, 15),
        Phaser.Geom.Circle.Contains
      );
      this.disposables.push(c);
    }

    if (locId === "town") {
      const npcPos = loc.npcSpawnOverrides ?? {};
      for (const npcId of Object.keys(npcPos)) {
        const pos = npcPos[npcId];
        if (!pos) continue;
        const c = this.add.circle(pos.x, pos.y, 14, 0xc4b5fd, 0.32);
        c.setStrokeStyle(2, 0x8b5cf6, 0.95);
        c.setDepth(DEPTH_SPAWN_MARKER);
        c.setData("mapEditorKind", "npcMarker");
        c.setData("mapEditorNpcId", npcId);
        c.setInteractive(
          new Phaser.Geom.Circle(0, 0, 16),
          Phaser.Geom.Circle.Contains
        );
        this.disposables.push(c);
      }
    }

    const mobs = loc.enemySpawns ?? ENEMY_SPAWNS;
    mobs.forEach((mob, index) => {
      this.addForestMobVisual(mob, index);
    });

    cam.setBounds(0, 0, W, H);
    if (
      preserveView &&
      savedZoom != null &&
      savedScrollX != null &&
      savedScrollY != null
    ) {
      cam.setZoom(savedZoom);
      cam.scrollX = savedScrollX;
      cam.scrollY = savedScrollY;
    } else {
      cam.setZoom(CAMERA_ZOOM_PLAY);
      cam.centerOn(W / 2, H / 2);
    }

    if (this.showOverlays) {
      this.drawOverlays(loc);
    }

    this.refreshSelectionHighlight();
  }

  /** Спрайт врага из `manifest.mobs` или запасной круг, если текстуры нет. */
  private addForestMobVisual(mob: LocationEnemySpawn, index: number): void {
    const manifest = this.registry.get("assetManifest") as
      | AssetManifest
      | undefined;
    const def = manifest?.mobs?.[mob.mobVisualId];
    if (def && this.textures.exists(def.textureKeyIdle)) {
      const spr = this.add
        .sprite(mob.x, mob.y, def.textureKeyIdle, 0)
        .setOrigin(0.5, 1);
      if (this.anims.exists(def.idleAnim)) {
        spr.play(def.idleAnim, true);
      }
      spr.setData("mapEditorKind", "mobMarker");
      spr.setData("mapEditorMobIndex", index);
      spr.setDepth(mob.y);
      const fr = this.textures.getFrame(def.textureKeyIdle);
      const w = fr.width;
      const h = fr.height;
      spr.setInteractive(
        new Phaser.Geom.Rectangle(-w / 2, -h, w, h),
        Phaser.Geom.Rectangle.Contains
      );
      this.disposables.push(spr);
      return;
    }
    const c = this.add.circle(mob.x, mob.y, 14, 0xfdba74, 0.32);
    c.setStrokeStyle(2, 0xea580c, 0.95);
    c.setDepth(DEPTH_SPAWN_MARKER);
    c.setData("mapEditorKind", "mobMarker");
    c.setData("mapEditorMobIndex", index);
    c.setInteractive(
      new Phaser.Geom.Circle(0, 0, 16),
      Phaser.Geom.Circle.Contains
    );
    this.disposables.push(c);
  }

  private flushPendingApply(): void {
    if (!this.pendingApply) return;
    if (
      this.drag !== null ||
      this.pending !== null ||
      this.cameraPan !== null
    ) {
      return;
    }
    const p = this.pendingApply;
    this.pendingApply = null;
    this.doApplyLocation(p.loc, p.locId);
  }

  private isWorldXYInBounds(wx: number, wy: number): boolean {
    const last = this.registry.get("mapEditorLastPayload") as
      | { loc: GameLocation }
      | undefined;
    if (!last) return false;
    const W = last.loc.world.width;
    const H = last.loc.world.height;
    return wx >= 0 && wx <= W && wy >= 0 && wy <= H;
  }

  /** ПКМ из DOM (contextmenu) — координаты экрана → мир. */
  openContextMenuFromDomClient(clientX: number, clientY: number): void {
    const canvas = this.sys.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const rw = Math.max(rect.width, 1);
    const rh = Math.max(rect.height, 1);
    const x = ((clientX - rect.left) / rw) * this.scale.gameSize.width;
    const y = ((clientY - rect.top) / rh) * this.scale.gameSize.height;
    this.cameras.main.getWorldPoint(x, y, this.worldPointScratch);
    this.handleRmbInteraction(
      this.worldPointScratch.x,
      this.worldPointScratch.y,
      clientX,
      clientY
    );
  }

  private onWheel(
    pointer: Phaser.Input.Pointer,
    _over: unknown,
    _dx: number,
    dy: number,
    _dz: number
  ): void {
    if (dy === 0) return;
    const cam = this.cameras.main;
    const oldZoom = cam.zoom;
    const factor = dy > 0 ? 0.92 : 1.08;
    const newZoom = Phaser.Math.Clamp(
      oldZoom * factor,
      MAP_EDITOR_ZOOM_MIN,
      MAP_EDITOR_ZOOM_MAX
    );
    if (Math.abs(newZoom - oldZoom) < 1e-6) return;

    const worldPoint = cam.getWorldPoint(pointer.x, pointer.y);
    cam.setZoom(newZoom);
    const newWorldPoint = cam.getWorldPoint(pointer.x, pointer.y);
    cam.scrollX += worldPoint.x - newWorldPoint.x;
    cam.scrollY += worldPoint.y - newWorldPoint.y;
  }

  /**
   * Ручной hit-test в координатах мира: надёжнее, чем только hitTestPointer при
   * Scale.FIT, зуме камеры и сложном порядке объектов.
   */
  private worldPointHitsInteractiveBounds(
    o: Phaser.GameObjects.GameObject,
    wx: number,
    wy: number
  ): boolean {
    const kind = o.getData?.("mapEditorKind") as MapEditorKind | undefined;
    if (!kind) return false;

    switch (kind) {
      case "prop":
      case "grass": {
        const img = o as Phaser.GameObjects.Image;
        const w = img.width;
        const h = img.height;
        if (w <= 0 || h <= 0) return false;
        const px = img.x;
        const py = img.y;
        return (
          wx >= px - w / 2 &&
          wx <= px + w / 2 &&
          wy >= py - h &&
          wy <= py
        );
      }
      case "spawn": {
        const c = o as Phaser.GameObjects.Arc;
        return Phaser.Math.Distance.Between(wx, wy, c.x, c.y) <= 15;
      }
      case "npcMarker": {
        const c = o as Phaser.GameObjects.Arc;
        return Phaser.Math.Distance.Between(wx, wy, c.x, c.y) <= 16;
      }
      case "mobMarker": {
        if (o instanceof Phaser.GameObjects.Arc) {
          const c = o;
          return Phaser.Math.Distance.Between(wx, wy, c.x, c.y) <= 16;
        }
        const img = o as Phaser.GameObjects.Sprite;
        const w = img.width;
        const h = img.height;
        if (w <= 0 || h <= 0) return false;
        const px = img.x;
        const py = img.y;
        return (
          wx >= px - w / 2 &&
          wx <= px + w / 2 &&
          wy >= py - h &&
          wy <= py
        );
      }
      case "animStation":
      case "path":
      case "exit": {
        const r = o as Phaser.GameObjects.Rectangle;
        const hw = r.width / 2;
        const hh = r.height / 2;
        return (
          wx >= r.x - hw &&
          wx <= r.x + hw &&
          wy >= r.y - hh &&
          wy <= r.y + hh
        );
      }
      case "ground": {
        const last = this.registry.get("mapEditorLastPayload") as
          | { loc: GameLocation }
          | undefined;
        if (!last) return false;
        const W = last.loc.world.width;
        const H = last.loc.world.height;
        return wx >= 0 && wx <= W && wy >= 0 && wy <= H;
      }
      default:
        return false;
    }
  }

  private getKindsForInteractionLayer(): MapEditorKind[] {
    switch (this.bridge.interactionLayer) {
      case "grass":
        return ["grass", "exit", "path", "ground"];
      case "decor":
      case "trees":
      case "all":
      default:
        return [...KIND_PRIORITY];
    }
  }

  private propTextureAtIndex(index: number): string | null {
    const last = this.registry.get("mapEditorLastPayload") as
      | { loc: GameLocation }
      | undefined;
    const t = last?.loc.imageProps[index]?.texture;
    return typeof t === "string" ? t : null;
  }

  private propMatchesInteractionLayer(
    obj: Phaser.GameObjects.GameObject
  ): boolean {
    if (obj.getData?.("mapEditorKind") !== "prop") return true;
    const idx = obj.getData("mapEditorPropIndex") as number;
    const tex = this.propTextureAtIndex(idx);
    if (!tex) return false;
    const layer = this.bridge.interactionLayer;
    if (layer === "all") return true;
    if (layer === "decor") return isDecorPropTexture(tex);
    if (layer === "trees") return isTreePropTexture(tex);
    return true;
  }

  private pickPriorityObject(wx: number, wy: number): Phaser.GameObjects.GameObject | undefined {
    const kinds = this.getKindsForInteractionLayer();
    for (const kind of kinds) {
      const objs = this.disposables.filter((obj) => {
        if (!obj.active) return false;
        return obj.getData?.("mapEditorKind") === kind;
      }) as Phaser.GameObjects.GameObject[];
      objs.sort((a, b) => {
        const da = (a as Phaser.GameObjects.GameObject & { depth: number })
          .depth;
        const db = (b as Phaser.GameObjects.GameObject & { depth: number })
          .depth;
        return db - da;
      });
      for (const obj of objs) {
        if (kind === "prop" && !this.propMatchesInteractionLayer(obj)) {
          continue;
        }
        if (this.worldPointHitsInteractiveBounds(obj, wx, wy)) {
          return obj;
        }
      }
    }
    return undefined;
  }

  private isRightButton(pointer: Phaser.Input.Pointer): boolean {
    if (pointer.rightButtonDown()) return true;
    const ev = pointer.event as MouseEvent | undefined;
    return ev?.button === 2;
  }

  private handleRmbInteraction(
    wx: number,
    wy: number,
    clientX: number,
    clientY: number
  ): void {
    const tool = this.bridge.tool;
    const top = this.pickPriorityObject(wx, wy);
    const propHit =
      top?.getData?.("mapEditorKind") === "prop"
        ? (top as Phaser.GameObjects.Image)
        : undefined;
    const spawnHit =
      top?.getData?.("mapEditorKind") === "spawn"
        ? (top as Phaser.GameObjects.Arc)
        : undefined;
    const mobHitRmb =
      top?.getData?.("mapEditorKind") === "mobMarker"
        ? (top as Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite)
        : undefined;

    if (propHit && tool !== "spawn") {
      const idx = propHit.getData("mapEditorPropIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-prop-select", {
          detail: { index: idx },
        })
      );
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-prop-menu", {
          detail: { propIndex: idx, clientX, clientY },
        })
      );
      return;
    }
    if (spawnHit && (tool === "select" || tool === "spawn")) {
      const key = spawnHit.getData("mapEditorSpawnKey") as string;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-spawn-select", {
          detail: { key },
        })
      );
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-spawn-menu", {
          detail: { spawnKey: key, clientX, clientY },
        })
      );
      return;
    }
    if (
      mobHitRmb &&
      (tool === "select" || tool === "mob")
    ) {
      const index = mobHitRmb.getData("mapEditorMobIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-mob-select", {
          detail: { index },
        })
      );
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-mob-menu", {
          detail: { mobIndex: index, clientX, clientY },
        })
      );
      return;
    }
    if (tool === "select") {
      this.dispatchWorldLayerRmb(top, wx, wy, clientX, clientY);
    }
  }

  private clientCoords(pointer: Phaser.Input.Pointer): {
    cx: number;
    cy: number;
  } {
    const ev = pointer.event as MouseEvent | PointerEvent | undefined;
    if (ev?.clientX != null && ev?.clientY != null) {
      return { cx: ev.clientX, cy: ev.clientY };
    }
    return { cx: pointer.x, cy: pointer.y };
  }

  private shouldStartCameraPan(
    pointer: Phaser.Input.Pointer,
    tool: MapEditorBridgeTool
  ): boolean {
    if (pointer.middleButtonDown()) return true;
    if (tool === "pan" && pointer.leftButtonDown()) return true;
    const ev = pointer.event as MouseEvent | undefined;
    if (pointer.leftButtonDown() && ev?.shiftKey && tool !== "pan") {
      ev.preventDefault();
      return true;
    }
    return false;
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    const tool = this.bridge.tool;

    if (this.shouldStartCameraPan(pointer, tool)) {
      const cam = this.cameras.main;
      this.cameraPan = {
        startScrollX: cam.scrollX,
        startScrollY: cam.scrollY,
        startPointerX: pointer.x,
        startPointerY: pointer.y,
      };
      this.pending = null;
      return;
    }

    const cam = this.cameras.main;
    cam.getWorldPoint(pointer.x, pointer.y, this.worldPointScratch);
    const wx = this.worldPointScratch.x;
    const wy = this.worldPointScratch.y;

    const top = this.pickPriorityObject(wx, wy);
    const propHit =
      top?.getData?.("mapEditorKind") === "prop"
        ? (top as Phaser.GameObjects.Image)
        : undefined;
    const spawnHit =
      top?.getData?.("mapEditorKind") === "spawn"
        ? (top as Phaser.GameObjects.Arc)
        : undefined;
    const npcHit =
      top?.getData?.("mapEditorKind") === "npcMarker"
        ? (top as Phaser.GameObjects.Arc)
        : undefined;
    const mobHit =
      top?.getData?.("mapEditorKind") === "mobMarker"
        ? (top as Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite)
        : undefined;
    const grassHit =
      top?.getData?.("mapEditorKind") === "grass"
        ? (top as Phaser.GameObjects.Image)
        : undefined;
    const pathHit =
      top?.getData?.("mapEditorKind") === "path"
        ? (top as Phaser.GameObjects.Rectangle)
        : undefined;
    const exitHit =
      top?.getData?.("mapEditorKind") === "exit"
        ? (top as Phaser.GameObjects.Rectangle)
        : undefined;

    if (this.isRightButton(pointer)) {
      pointer.event?.preventDefault?.();
      const { cx, cy } = this.clientCoords(pointer);
      this.handleRmbInteraction(wx, wy, cx, cy);
      return;
    }

    if (!pointer.leftButtonDown()) return;

    if (tool === "grass") {
      if (grassHit) {
        const index = grassHit.getData("mapEditorGrassIndex") as number;
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-grass-click", {
            detail: { index, x: wx, y: wy },
          })
        );
        const { cx, cy } = this.clientCoords(pointer);
        this.pending = {
          kind: "grass",
          index,
          sprite: grassHit,
          startCx: cx,
          startCy: cy,
        };
        return;
      }
      if (this.isWorldXYInBounds(wx, wy)) {
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-grass-place", {
            detail: {
              x: wx,
              y: wy,
              variant: this.bridge.grassPaintVariant,
            },
          })
        );
      }
      return;
    }

    if (tool === "path") {
      if (pathHit) {
        const idx = pathHit.getData("mapEditorPathIndex") as number;
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-path-click", {
            detail: { segmentIndex: idx, x: wx, y: wy },
          })
        );
        const dirts = this.pathDirtByIndex.get(idx) ?? [];
        const { cx, cy } = this.clientCoords(pointer);
        this.pending = {
          kind: "path",
          segmentIndex: idx,
          dirtSprites: dirts,
          hitRect: pathHit,
          startCx: cx,
          startCy: cy,
        };
        return;
      }
      if (this.isWorldXYInBounds(wx, wy)) {
        const preview = this.add
          .rectangle(wx, wy, 1, 1, 0x22c55e, 0.35)
          .setOrigin(0, 0);
        preview.setStrokeStyle(2, 0x16a34a, 0.95);
        preview.setDepth(DEPTH_OVERLAY + 2);
        this.drag = {
          kind: "pathDraw",
          startX: wx,
          startY: wy,
          preview,
        };
      }
      return;
    }

    if (tool === "exit") {
      if (exitHit) {
        const idx = exitHit.getData("mapEditorExitIndex") as number;
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-exit-click", {
            detail: { exitIndex: idx, x: wx, y: wy },
          })
        );
        const { cx, cy } = this.clientCoords(pointer);
        this.pending = {
          kind: "exit",
          index: idx,
          hitRect: exitHit,
          startCx: cx,
          startCy: cy,
        };
        return;
      }
      if (this.isWorldXYInBounds(wx, wy)) {
        const preview = this.add
          .rectangle(wx, wy, 1, 1, 0x3b82f6, 0.28)
          .setOrigin(0, 0);
        preview.setStrokeStyle(2, 0x2563eb, 0.95);
        preview.setDepth(DEPTH_OVERLAY + 2);
        this.drag = {
          kind: "exitDraw",
          startX: wx,
          startY: wy,
          preview,
        };
      }
      return;
    }

    if (tool === "paint" || tool === "spawn") {
      if (propHit && tool !== "spawn") {
        const idx = propHit.getData("mapEditorPropIndex") as number;
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-prop-select", {
            detail: { index: idx },
          })
        );
        const { cx, cy } = this.clientCoords(pointer);
        this.pending = {
          kind: "prop",
          index: idx,
          sprite: propHit,
          startCx: cx,
          startCy: cy,
        };
        return;
      }
      if (spawnHit && tool === "spawn") {
        const key = spawnHit.getData("mapEditorSpawnKey") as string;
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-spawn-select", {
            detail: { key },
          })
        );
        const { cx, cy } = this.clientCoords(pointer);
        this.pending = {
          kind: "spawn",
          key,
          marker: spawnHit,
          startCx: cx,
          startCy: cy,
        };
        return;
      }
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-world-click", {
          detail: { x: wx, y: wy },
        })
      );
      return;
    }

    if (tool === "npc") {
      const last = this.registry.get("mapEditorLastPayload") as
        | { locId: LocationId }
        | undefined;
      if (last?.locId !== "town") return;
      if (npcHit) {
        const npcId = npcHit.getData("mapEditorNpcId") as string;
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-npc-select", {
            detail: { npcId },
          })
        );
        const { cx, cy } = this.clientCoords(pointer);
        this.pending = {
          kind: "npc",
          npcId,
          marker: npcHit,
          startCx: cx,
          startCy: cy,
        };
        return;
      }
      const paintId = this.bridge.npcPaintId;
      if (paintId && this.isWorldXYInBounds(wx, wy)) {
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-npc-place", {
            detail: { npcId: paintId, x: wx, y: wy },
          })
        );
      }
      return;
    }

    if (tool === "mob") {
      if (mobHit) {
        const index = mobHit.getData("mapEditorMobIndex") as number;
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-mob-select", {
            detail: { index },
          })
        );
        const { cx, cy } = this.clientCoords(pointer);
        this.pending = {
          kind: "mob",
          index,
          marker: mobHit,
          startCx: cx,
          startCy: cy,
        };
        return;
      }
      if (this.isWorldXYInBounds(wx, wy)) {
        window.dispatchEvent(
          new CustomEvent("last-summon-map-editor-mob-place", {
            detail: {
              x: wx,
              y: wy,
              presetIndex: this.bridge.mobPresetIndex,
              level: this.bridge.mobPlaceLevel,
            },
          })
        );
      }
      return;
    }

    if (tool === "pan") {
      return;
    }

    if (propHit) {
      const idx = propHit.getData("mapEditorPropIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-prop-select", {
          detail: { index: idx },
        })
      );
      const { cx, cy } = this.clientCoords(pointer);
      this.pending = {
        kind: "prop",
        index: idx,
        sprite: propHit,
        startCx: cx,
        startCy: cy,
      };
      return;
    }

    if (spawnHit) {
      const key = spawnHit.getData("mapEditorSpawnKey") as string;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-spawn-select", {
          detail: { key },
        })
      );
      const { cx, cy } = this.clientCoords(pointer);
      this.pending = {
        kind: "spawn",
        key,
        marker: spawnHit,
        startCx: cx,
        startCy: cy,
      };
      return;
    }

    if (npcHit) {
      const npcId = npcHit.getData("mapEditorNpcId") as string;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-npc-select", {
          detail: { npcId },
        })
      );
      const { cx, cy } = this.clientCoords(pointer);
      this.pending = {
        kind: "npc",
        npcId,
        marker: npcHit,
        startCx: cx,
        startCy: cy,
      };
      return;
    }

    if (mobHit) {
      const index = mobHit.getData("mapEditorMobIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-mob-select", {
          detail: { index },
        })
      );
      const { cx, cy } = this.clientCoords(pointer);
      this.pending = {
        kind: "mob",
        index,
        marker: mobHit,
        startCx: cx,
        startCy: cy,
      };
      return;
    }

    if (exitHit && tool === "select") {
      const idx = exitHit.getData("mapEditorExitIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-exit-click", {
          detail: { exitIndex: idx, x: wx, y: wy },
        })
      );
      const { cx, cy } = this.clientCoords(pointer);
      this.pending = {
        kind: "exit",
        index: idx,
        hitRect: exitHit,
        startCx: cx,
        startCy: cy,
      };
      return;
    }

    if (grassHit && tool === "select") {
      const index = grassHit.getData("mapEditorGrassIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-grass-click", {
          detail: { index, x: wx, y: wy },
        })
      );
      const { cx, cy } = this.clientCoords(pointer);
      this.pending = {
        kind: "grass",
        index,
        sprite: grassHit,
        startCx: cx,
        startCy: cy,
      };
      return;
    }

    if (pathHit && tool === "select") {
      const idx = pathHit.getData("mapEditorPathIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-path-click", {
          detail: { segmentIndex: idx, x: wx, y: wy },
        })
      );
      const dirts = this.pathDirtByIndex.get(idx) ?? [];
      const { cx, cy } = this.clientCoords(pointer);
      this.pending = {
        kind: "path",
        segmentIndex: idx,
        dirtSprites: dirts,
        hitRect: pathHit,
        startCx: cx,
        startCy: cy,
      };
      return;
    }

    if (tool === "select") {
      this.dispatchWorldLayerSelect(top, wx, wy);
    }
  }

  private dispatchWorldLayerSelect(
    top: Phaser.GameObjects.GameObject | undefined,
    wx: number,
    wy: number
  ): void {
    const kind = top?.getData?.("mapEditorKind") as string | undefined;
    if (kind === "animStation") {
      if (!top) return;
      const stationIndex = top.getData("mapEditorAnimIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-anim-click", {
          detail: { stationIndex, x: wx, y: wy },
        })
      );
      return;
    }
    if (kind === "grass") {
      if (!top) return;
      const index = top.getData("mapEditorGrassIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-grass-click", {
          detail: { index, x: wx, y: wy },
        })
      );
      return;
    }
    if (kind === "exit") {
      if (!top) return;
      const exitIndex = top.getData("mapEditorExitIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-exit-click", {
          detail: { exitIndex, x: wx, y: wy },
        })
      );
      return;
    }
    if (kind === "path") {
      if (!top) return;
      const segmentIndex = top.getData("mapEditorPathIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-path-click", {
          detail: { segmentIndex, x: wx, y: wy },
        })
      );
      return;
    }
    if (kind === "ground") {
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-ground-click", {
          detail: { x: wx, y: wy },
        })
      );
      return;
    }
    window.dispatchEvent(new CustomEvent("last-summon-map-editor-clear-selection"));
  }

  private dispatchWorldLayerRmb(
    top: Phaser.GameObjects.GameObject | undefined,
    wx: number,
    wy: number,
    clientX: number,
    clientY: number
  ): void {
    const kind = top?.getData?.("mapEditorKind") as string | undefined;
    if (kind === "animStation") {
      if (!top) return;
      const stationIndex = top.getData("mapEditorAnimIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-anim-click", {
          detail: { stationIndex, x: wx, y: wy },
        })
      );
      return;
    }
    if (kind === "grass") {
      if (!top) return;
      const index = top.getData("mapEditorGrassIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-grass-click", {
          detail: { index, x: wx, y: wy },
        })
      );
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-grass-menu", {
          detail: { clientX, clientY },
        })
      );
      return;
    }
    if (kind === "exit") {
      if (!top) return;
      const exitIndex = top.getData("mapEditorExitIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-exit-click", {
          detail: { exitIndex, x: wx, y: wy },
        })
      );
      return;
    }
    if (kind === "path") {
      if (!top) return;
      const segmentIndex = top.getData("mapEditorPathIndex") as number;
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-path-click", {
          detail: { segmentIndex, x: wx, y: wy },
        })
      );
      return;
    }
    if (kind === "ground") {
      window.dispatchEvent(
        new CustomEvent("last-summon-map-editor-ground-click", {
          detail: { x: wx, y: wy },
        })
      );
    }
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const cam = this.cameras.main;
    cam.getWorldPoint(pointer.x, pointer.y, this.worldPointScratch);
    const wpx = this.worldPointScratch.x;
    const wpy = this.worldPointScratch.y;

    if (this.cameraPan) {
      const dx = pointer.x - this.cameraPan.startPointerX;
      const dy = pointer.y - this.cameraPan.startPointerY;
      cam.scrollX = this.cameraPan.startScrollX - dx / cam.zoom;
      cam.scrollY = this.cameraPan.startScrollY - dy / cam.zoom;
      return;
    }

    if (this.pending && !this.drag) {
      const { cx, cy } = this.clientCoords(pointer);
      const ddx = cx - this.pending.startCx;
      const ddy = cy - this.pending.startCy;
      if (Math.hypot(ddx, ddy) > this.dragSlopPx) {
        const pend = this.pending;
        this.pending = null;
        if (pend.kind === "prop") {
          this.drag = {
            kind: "prop",
            index: pend.index,
            grabDx: wpx - pend.sprite.x,
            grabDy: wpy - pend.sprite.y,
            sprite: pend.sprite,
          };
        } else if (pend.kind === "spawn") {
          this.drag = {
            kind: "spawn",
            key: pend.key,
            grabDx: wpx - pend.marker.x,
            grabDy: wpy - pend.marker.y,
            marker: pend.marker,
          };
        } else if (pend.kind === "npc") {
          this.drag = {
            kind: "npc",
            npcId: pend.npcId,
            grabDx: wpx - pend.marker.x,
            grabDy: wpy - pend.marker.y,
            marker: pend.marker,
          };
        } else if (pend.kind === "mob") {
          this.drag = {
            kind: "mob",
            index: pend.index,
            grabDx: wpx - pend.marker.x,
            grabDy: wpy - pend.marker.y,
            marker: pend.marker,
          };
        } else if (pend.kind === "grass") {
          this.drag = {
            kind: "grass",
            index: pend.index,
            grabDx: wpx - pend.sprite.x,
            grabDy: wpy - pend.sprite.y,
            sprite: pend.sprite,
          };
        } else if (pend.kind === "exit") {
          this.drag = {
            kind: "exit",
            index: pend.index,
            grabDx: wpx - pend.hitRect.x,
            grabDy: wpy - pend.hitRect.y,
            hitRect: pend.hitRect,
          };
        } else {
          this.drag = {
            kind: "path",
            segmentIndex: pend.segmentIndex,
            grabDx: wpx - pend.hitRect.x,
            grabDy: wpy - pend.hitRect.y,
            dirtSprites: pend.dirtSprites,
            hitRect: pend.hitRect,
          };
        }
      }
    }

    if (!this.drag) return;
    if (this.drag.kind === "prop") {
      const d = this.drag;
      const nx = wpx - d.grabDx;
      const ny = wpy - d.grabDy;
      d.sprite.setPosition(nx, ny);
      d.sprite.setDepth(ny);
      this.refreshSelectionHighlight();
      return;
    }
    if (this.drag.kind === "grass") {
      const d = this.drag;
      const nx = wpx - d.grabDx;
      const ny = wpy - d.grabDy;
      d.sprite.setPosition(nx, ny);
      d.sprite.setDepth(ny - 0.15);
      this.refreshSelectionHighlight();
      return;
    }
    if (this.drag.kind === "path") {
      const d = this.drag;
      const centerX = wpx - d.grabDx;
      const centerY = wpy - d.grabDy;
      const w = d.hitRect.width;
      const h = d.hitRect.height;
      d.hitRect.setPosition(centerX, centerY);
      const topLeftX = centerX - w / 2;
      const topLeftY = centerY - h / 2;
      for (const o of d.dirtSprites) {
        const ts = o as Phaser.GameObjects.TileSprite;
        ts.setPosition(topLeftX, topLeftY);
      }
      this.refreshSelectionHighlight();
      return;
    }
    if (this.drag.kind === "pathDraw") {
      const d = this.drag;
      const x = Math.min(d.startX, wpx);
      const y = Math.min(d.startY, wpy);
      const w = Math.abs(wpx - d.startX);
      const h = Math.abs(wpy - d.startY);
      d.preview.setPosition(x, y);
      d.preview.setSize(Math.max(1, w), Math.max(1, h));
      return;
    }
    if (this.drag.kind === "exitDraw") {
      const d = this.drag;
      const x = Math.min(d.startX, wpx);
      const y = Math.min(d.startY, wpy);
      const w = Math.abs(wpx - d.startX);
      const h = Math.abs(wpy - d.startY);
      d.preview.setPosition(x, y);
      d.preview.setSize(Math.max(1, w), Math.max(1, h));
      return;
    }
    if (this.drag.kind === "exit") {
      const d = this.drag;
      const centerX = wpx - d.grabDx;
      const centerY = wpy - d.grabDy;
      const w = d.hitRect.width;
      const h = d.hitRect.height;
      d.hitRect.setPosition(centerX, centerY);
      this.refreshSelectionHighlight();
      return;
    }
    const d = this.drag;
    const nx = wpx - d.grabDx;
    const ny = wpy - d.grabDy;
    d.marker.setPosition(nx, ny);
    if (d.kind === "mob" && d.marker instanceof Phaser.GameObjects.Sprite) {
      d.marker.setDepth(ny);
    }
    this.refreshSelectionHighlight();
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    try {
      if (this.cameraPan) {
        this.cameraPan = null;
        return;
      }

      if (this.drag) {
        if (this.drag.kind === "prop") {
          const d = this.drag;
          window.dispatchEvent(
            new CustomEvent("last-summon-map-editor-prop-moved", {
              detail: {
                index: d.index,
                x: d.sprite.x,
                y: d.sprite.y,
              },
            })
          );
        } else if (this.drag.kind === "spawn") {
          const d = this.drag;
          window.dispatchEvent(
            new CustomEvent("last-summon-map-editor-spawn-moved", {
              detail: {
                key: d.key,
                x: d.marker.x,
                y: d.marker.y,
              },
            })
          );
        } else if (this.drag.kind === "npc") {
          const d = this.drag;
          window.dispatchEvent(
            new CustomEvent("last-summon-map-editor-npc-moved", {
              detail: {
                npcId: d.npcId,
                x: d.marker.x,
                y: d.marker.y,
              },
            })
          );
        } else if (this.drag.kind === "mob") {
          const d = this.drag;
          window.dispatchEvent(
            new CustomEvent("last-summon-map-editor-mob-moved", {
              detail: {
                index: d.index,
                x: d.marker.x,
                y: d.marker.y,
              },
            })
          );
        } else if (this.drag.kind === "grass") {
          const d = this.drag;
          window.dispatchEvent(
            new CustomEvent("last-summon-map-editor-grass-moved", {
              detail: {
                index: d.index,
                x: d.sprite.x,
                y: d.sprite.y,
              },
            })
          );
        } else if (this.drag.kind === "path") {
          const d = this.drag;
          const w = d.hitRect.width;
          const h = d.hitRect.height;
          window.dispatchEvent(
            new CustomEvent("last-summon-map-editor-path-moved", {
              detail: {
                segmentIndex: d.segmentIndex,
                x: d.hitRect.x - w / 2,
                y: d.hitRect.y - h / 2,
              },
            })
          );
        } else if (this.drag.kind === "exit") {
          const d = this.drag;
          const w = d.hitRect.width;
          const h = d.hitRect.height;
          window.dispatchEvent(
            new CustomEvent("last-summon-map-editor-exit-moved", {
              detail: {
                exitIndex: d.index,
                x: d.hitRect.x - w / 2,
                y: d.hitRect.y - h / 2,
              },
            })
          );
        } else if (this.drag.kind === "pathDraw") {
          const d = this.drag;
          const x = Math.min(d.startX, d.preview.x + d.preview.width);
          const y = Math.min(d.startY, d.preview.y + d.preview.height);
          const w = d.preview.width;
          const h = d.preview.height;
          d.preview.destroy();
          if (w >= 8 && h >= 8) {
            window.dispatchEvent(
              new CustomEvent("last-summon-map-editor-path-create", {
                detail: { x, y, w, h },
              })
            );
          }
        } else if (this.drag.kind === "exitDraw") {
          const d = this.drag;
          const x = Math.min(d.startX, d.preview.x + d.preview.width);
          const y = Math.min(d.startY, d.preview.y + d.preview.height);
          const w = d.preview.width;
          const h = d.preview.height;
          d.preview.destroy();
          if (w >= 8 && h >= 8) {
            window.dispatchEvent(
              new CustomEvent("last-summon-map-editor-exit-create", {
                detail: { x, y, w, h },
              })
            );
          }
        }
        this.drag = null;
        this.pending = null;
        return;
      }

      if (this.pending) {
        const pend = this.pending;
        this.pending = null;
        const { cx, cy } = this.clientCoords(pointer);
        if (pend.kind === "prop") {
          window.dispatchEvent(
            new CustomEvent("last-summon-map-editor-prop-menu", {
              detail: { propIndex: pend.index, clientX: cx, clientY: cy },
            })
          );
        } else if (pend.kind === "spawn") {
          window.dispatchEvent(
            new CustomEvent("last-summon-map-editor-spawn-menu", {
              detail: { spawnKey: pend.key, clientX: cx, clientY: cy },
            })
          );
        }
      }
    } finally {
      this.flushPendingApply();
    }
  }

  private refreshSelectionHighlight(): void {
    this.selectionG.clear();

    if (this.drag?.kind === "prop") {
      const b = this.drag.sprite.getBounds();
      this.selectionG.lineStyle(2, 0xfbbf24, 1);
      this.selectionG.strokeRect(b.x, b.y, b.width, b.height);
      return;
    }
    if (this.drag?.kind === "spawn") {
      const m = this.drag.marker;
      this.selectionG.lineStyle(2, 0xfacc15, 1);
      this.selectionG.strokeCircle(m.x, m.y, 18);
      return;
    }
    if (this.drag?.kind === "npc") {
      const m = this.drag.marker;
      this.selectionG.lineStyle(2, 0xa78bfa, 1);
      this.selectionG.strokeCircle(m.x, m.y, 18);
      return;
    }
    if (this.drag?.kind === "mob") {
      const m = this.drag.marker;
      this.selectionG.lineStyle(2, 0xfb923c, 1);
      if (m instanceof Phaser.GameObjects.Sprite) {
        const b = m.getBounds();
        this.selectionG.strokeRect(b.x, b.y, b.width, b.height);
      } else {
        this.selectionG.strokeCircle(m.x, m.y, 18);
      }
      return;
    }
    if (this.drag?.kind === "grass") {
      const b = this.drag.sprite.getBounds();
      this.selectionG.lineStyle(2, 0x84cc16, 1);
      this.selectionG.strokeRect(b.x, b.y, b.width, b.height);
      return;
    }
    if (this.drag?.kind === "path") {
      const r = this.drag.hitRect;
      this.selectionG.lineStyle(2, 0x22c55e, 0.95);
      this.selectionG.strokeRect(
        r.x - r.width / 2,
        r.y - r.height / 2,
        r.width,
        r.height
      );
      return;
    }
    if (this.drag?.kind === "exit") {
      const r = this.drag.hitRect;
      this.selectionG.lineStyle(2, 0x60a5fa, 0.95);
      this.selectionG.strokeRect(
        r.x - r.width / 2,
        r.y - r.height / 2,
        r.width,
        r.height
      );
      return;
    }
    if (this.drag?.kind === "pathDraw" || this.drag?.kind === "exitDraw") return;

    const last = this.registry.get("mapEditorLastPayload") as
      | { loc: GameLocation; locId: LocationId }
      | undefined;
    if (!last) return;

    const loc = last.loc;
    const {
      selectedPropIndex,
      selectedSpawnKey,
      selectedNpcId,
      selectedMobIndex,
      worldPick,
    } = this.bridge;

    if (selectedPropIndex !== null) {
      const p = loc.imageProps[selectedPropIndex];
      if (p && this.textures.exists(p.texture)) {
        const fr =
          p.frame !== undefined
            ? this.textures.getFrame(p.texture, p.frame)
            : this.textures.getFrame(p.texture);
        const w = fr.width;
        const h = fr.height;
        const bx = p.x - w / 2;
        const by = p.y - h;
        this.selectionG.lineStyle(2, 0xfbbf24, 1);
        this.selectionG.strokeRect(bx, by, w, h);
      }
    }

    if (selectedSpawnKey) {
      const sp = loc.spawns[selectedSpawnKey as keyof typeof loc.spawns];
      if (sp) {
        this.selectionG.lineStyle(2, 0xfacc15, 1);
        this.selectionG.strokeCircle(sp.x, sp.y, 18);
      }
    }

    if (selectedNpcId && last.locId === "town") {
      const pos = loc.npcSpawnOverrides?.[selectedNpcId];
      if (pos) {
        this.selectionG.lineStyle(2, 0xa78bfa, 1);
        this.selectionG.strokeCircle(pos.x, pos.y, 18);
      }
    }
    if (selectedMobIndex !== null) {
      const mobs = loc.enemySpawns ?? ENEMY_SPAWNS;
      const mob = mobs[selectedMobIndex];
      if (mob) {
        this.selectionG.lineStyle(2, 0xfb923c, 1);
        const manifest = this.registry.get("assetManifest") as
          | AssetManifest
          | undefined;
        const def = manifest?.mobs?.[mob.mobVisualId];
        const tk = def?.textureKeyIdle;
        if (tk && this.textures.exists(tk)) {
          const fr = this.textures.getFrame(tk);
          const bx = mob.x - fr.width / 2;
          const by = mob.y - fr.height;
          this.selectionG.strokeRect(bx, by, fr.width, fr.height);
        } else {
          this.selectionG.strokeCircle(mob.x, mob.y, 18);
        }
      }
    }

    if (!worldPick) return;

    if (worldPick.kind === "ground") {
      this.selectionG.lineStyle(2, 0x64748b, 0.85);
      this.selectionG.strokeRect(2, 2, loc.world.width - 4, loc.world.height - 4);
      return;
    }

    if (worldPick.kind === "path") {
      const seg = loc.pathSegments[worldPick.segmentIndex];
      if (seg) {
        this.selectionG.lineStyle(2, 0x22c55e, 0.95);
        this.selectionG.strokeRect(seg.x, seg.y, seg.w, seg.h);
      }
      return;
    }

    if (worldPick.kind === "exit") {
      const ex = loc.exits[worldPick.index];
      if (ex) {
        this.selectionG.lineStyle(2, 0x60a5fa, 0.95);
        this.selectionG.strokeRect(ex.x, ex.y, ex.w, ex.h);
      }
      return;
    }

    if (worldPick.kind === "anim") {
      const st = loc.animStations[worldPick.stationIndex];
      if (st) {
        const c = st.collider;
        this.selectionG.lineStyle(2, 0xf97316, 1);
        this.selectionG.strokeRect(
          c.x - c.w / 2,
          c.y - c.h / 2,
          c.w,
          c.h
        );
      }
      return;
    }

    if (worldPick.kind === "grass") {
      const list = getGrassDecor(last.locId);
      const d = list[worldPick.index];
      if (d && this.textures.exists("grass_decor")) {
        const fr = this.textures.getFrame("grass_decor", d.variant);
        const fw = fr.width;
        const fh = fr.height;
        const bx = d.x - fw / 2;
        const by = d.y - fh;
        this.selectionG.lineStyle(2, 0x84cc16, 1);
        this.selectionG.strokeRect(bx, by, fw, fh);
      }
    }
  }

  private drawOverlays(loc: GameLocation): void {
    const g = this.overlayG;
    g.clear();

    for (const seg of loc.pathSegments) {
      g.fillStyle(0x22c55e, 0.25);
      g.fillRect(seg.x, seg.y, seg.w, seg.h);
      g.lineStyle(2, 0x16a34a, 0.9);
      g.strokeRect(seg.x, seg.y, seg.w, seg.h);
    }

    for (const ex of loc.exits) {
      g.fillStyle(0x3b82f6, 0.22);
      g.fillRect(ex.x, ex.y, ex.w, ex.h);
      g.lineStyle(2, 0x2563eb, 0.85);
      g.strokeRect(ex.x, ex.y, ex.w, ex.h);
    }

    for (const p of loc.imageProps) {
      if (!p.collider) continue;
      if (
        p.collider.fit !== "frame" &&
        (p.collider.w <= 0 || p.collider.h <= 0)
      )
        continue;
      const texKey =
        p.textureCrop !== undefined
          ? `${p.texture}__crop_${p.textureCrop.x}_${p.textureCrop.y}_${p.textureCrop.w}_${p.textureCrop.h}`
          : p.texture;
      const ec = getEffectivePropCollider(this, texKey, p.frame, p.collider);
      if (!ec || ec.w <= 0 || ec.h <= 0) continue;
      const oy = ec.oy ?? ec.h / 2;
      const cx = p.x;
      const cy = p.y - oy;
      g.lineStyle(1, 0xef4444, 0.85);
      g.strokeRect(cx - ec.w / 2, cy - ec.h / 2, ec.w, ec.h);
    }

    for (const s of loc.animStations) {
      const c = s.collider;
      g.lineStyle(1, 0xf97316, 0.9);
      g.strokeRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    }

    if (loc.pondCollider) {
      const c = loc.pondCollider;
      g.lineStyle(1, 0x06b6d4, 0.85);
      g.strokeRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h);
    }
  }
}
