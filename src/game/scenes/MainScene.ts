import * as Phaser from "phaser";
import {
  FANTASY_SFX,
  pickRandomFootstepRunSfxId,
  pickRandomFootstepWalkSfxId,
  pickRandomMineSfxId,
  pickRandomWoodChopSfxId,
  type FantasySfxId,
} from "@/src/game/audio/fantasySfx";
import type { AssetManifest, NpcPublic } from "@/src/game/types";
import {
  HeroAnimController,
  type HeroAttackStyle,
} from "@/src/game/entities/heroAnimations";
import {
  CAMERA_ZOOM_PLAY,
  getGrassDecor,
  getLocation,
  isLocationId,
  pointInExitZone,
  type GameLocation,
  type LocationId,
} from "@/src/game/locations";
import {
  addGroundDisplay,
  addPathDirtLayer,
} from "@/src/game/locations/groundDisplay";
import { applyNpcSpawnOverride } from "@/src/game/locations/npcSpawnOverride";
import {
  ASSET_SLICE_OVERRIDES_TEXTURES_APPLIED,
  getEffectivePropCollider,
} from "@/src/game/load/assetSliceOverridesRuntime";
import { ensureCroppedPropTexture } from "@/src/game/load/croppedPropTexture";
import { EnemyMob } from "@/src/game/entities/EnemyMob";
import { PatrolNpc } from "@/src/game/entities/NPC";
import { applyPixelCrawlerFeetHitbox } from "@/src/game/entities/Player";
import {
  DUNGEON_BOSS_ATK_MULT,
  DUNGEON_BOSS_HP_MULT,
  DUNGEON_BOSS_INSTANCE_ID,
  getDungeonBossSpawnForFloor,
  getDungeonGruntRoomCentersForFloor,
  DUNGEON_GRUNT_VISUAL_IDS,
  DUNGEON_SPAWN_MIN_DIST_FROM_PLAYER,
  isDungeonBossChestId,
} from "@/src/game/data/dungeonBoss";
import {
  clampDungeonFloor,
  getBossLevel,
  getDungeonSpawnIntervalMs,
  getDungeonSpawnMaxAlive,
  getGruntLevelRange,
} from "@/src/game/data/dungeonFloorScaling";
import {
  resolveCraftStations,
  type ResolvedCraftStation,
} from "@/src/game/data/stations";
import { WORLD_PICKUPS } from "@/src/game/data/worldPickups";
import {
  getChestsForLocation,
  rollEnemyGold,
  rollEnemyLoot,
} from "@/src/game/data/loot";
import { ITEM_ATLAS } from "@/src/game/data/items.generated";
import { getCuratedItem } from "@/src/game/data/itemRegistry";
import {
  XP_PROFESSION_LUMBER_PER_TREE,
  XP_PROFESSION_MINING_PER_ROCK,
} from "@/src/game/data/professions";
import {
  INTERACT_RADIUS_NPC,
  NPC_BARK_COOLDOWN_MS_MAX,
  NPC_BARK_COOLDOWN_MS_MIN,
  PICKUP_RADIUS,
  SPAWN_WORLD_PICKUP_EVENT,
  TREE_CHOP_RADIUS,
} from "@/src/game/constants/gameplay";
import {
  CHOP_TREE_CHANNEL_MS,
  CHOP_TREE_STRIKE_COUNT,
  CHOP_TREE_STRIKE_SPACING_MS,
  FOREST_TREE_STUMP_VISIBLE_MS,
  rollStoneDropQty,
  STONE_MATERIAL_CURATED_ID,
  PLAYER_ARCADE_MOVE_SPEED,
  PLAYER_ATTACK_HIT_RADIUS,
  PLAYER_ATTACK_LEAD_PX,
  PLAYER_SPRINT_GAIT_MULT,
  PLAYER_WALK_GAIT_MULT,
  rollWoodDropQty,
  STA_WINDED_MOVE_SPEED_MULT,
  WOOD_MATERIAL_CURATED_ID,
  XP_WORLD_PICKUP,
  damageEnemyDealsToPlayer,
  damagePlayerDealsToEnemy,
  getEnemyGruntStatsForLevel,
  getPlayerAttackCooldownMs,
  resolveMobAggroRadii,
  rollPlayerEvadesMobHit,
  xpEnemyKillForPlayer,
} from "@/src/game/data/balance";
import {
  TAG_AXE,
  TAG_PICKAXE,
  playerHasInstrumentRole,
} from "@/src/game/data/instruments";
import { ENEMY_SPAWNS, type EnemySpawnDef } from "@/src/game/data/combatWorld";
import { getEnemyRespawnDelayMs } from "@/src/game/data/enemyRespawn";
import {
  forestMobLevelFromTemplate,
  forestRespawnDelayMultiplier,
  forestSpawnPresenceChance,
} from "@/src/game/data/forestMobGradient";
import type {
  LayoutImageProp,
  LocationEnemySpawn,
  LocationExit,
} from "@/src/game/locations/types";
import { ForestChunkManager } from "@/src/game/locations/forestChunkManager";
import { TREE_TEXTURE_KEYS } from "@/src/game/locations/forestChunkGen";
import { forestStumpTextureKey } from "@/src/game/locations/forestTreeStump";
import {
  createForestWildMobSpawn,
  isForestWildDynamicMobId,
  parseWildForestMobChunkKey,
  wildMobSlotsForChunk,
} from "@/src/game/locations/forestWildEncounters";

/** Цвета подсветки зон перехода между локациями (см. `LocationExit`). */
function exitZoneHighlightColors(
  locId: LocationId,
  ex: LocationExit
): { fill: number; stroke: number } {
  if (locId === "dungeon" && ex.targetLocationId !== "dungeon") {
    return { fill: 0x16a34a, stroke: 0x86efac };
  }
  if (ex.targetLocationId === "dungeon") {
    return { fill: 0x6d28d9, stroke: 0xc4b5fd };
  }
  return { fill: 0xd97706, stroke: 0xfde047 };
}
import {
  buffNumericProduct,
  getDerivedCombatStats,
  getMoveSpeedMultiplier,
} from "@/src/game/rpg/derivedStats";
import { setRuntimeDungeonFloor } from "@/src/game/locations/dungeonFloorContext";
import {
  forestTreePersistKey,
  useGameStore,
  waitForGameStoreHydration,
} from "@/src/game/state/gameStore";
import { useUiSettingsStore } from "@/src/game/state/uiSettingsStore";

const TREE_TEXTURE_KEY_SET = new Set<string>(
  TREE_TEXTURE_KEYS as unknown as string[]
);

const CHEST_RADIUS = INTERACT_RADIUS_NPC;
const STATION_RADIUS = INTERACT_RADIUS_NPC;

/**
 * Должно совпадать с `kb.addCapture` ниже. На время диалога с NPC снимается через
 * `removeCapture`: иначе глобальный `KeyboardManager` Phaser вызывает
 * `preventDefault` для этих клавиш даже при `keyboard.enabled = false`, и поле ввода
 * не получает WASD и т.д. Пробел в список не включаем — ближний бой только по ЛКМ.
 */
const PHASER_KEYBOARD_CAPTURE_KEYS =
  "UP,DOWN,LEFT,RIGHT,W,A,S,D,E";
/** Проверка респавна мобов без перезагрузки сцены (мс, Phaser time). */
const ENEMY_RESPAWN_CHECK_INTERVAL_MS = 750;

declare global {
  interface Window {
    __NAGIBATOP_READY__?: boolean;
    /** Отладочный урон игроку (нет боя во Фазе 3). */
    __NAGIBATOP_HURT__?: (amount?: number) => void;
    /** Вкл/выкл анимации ношения (Carry_*), пока нет квестового флага. */
    __NAGIBATOP_SET_CARRY__?: (value: boolean) => void;
    /** Полный кадр карты (весь мир в канвасе) → PNG в буфер обмена. */
    __NAGIBATOP_CAPTURE_FULL_MAP__?: () => Promise<{
      ok: boolean;
      error?: string;
    }>;
    /** Сбросить таймеры респавна мобов в сейве и перезагрузить страницу (отладка). */
    __NAGIBATOP_RESET_MOBS__?: () => void;
  }
}

export class MainScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyE!: Phaser.Input.Keyboard.Key;
  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyEsc!: Phaser.Input.Keyboard.Key;
  private npcs: PatrolNpc[] = [];
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private manifest!: AssetManifest;
  private heroAnim!: HeroAnimController;
  private lastHp = 0;
  /** Накопленный путь для шагов (px), сбрасывается при остановке. */
  private footstepDistanceCarry = 0;
  private booted = false;
  private dialogueOpen = false;
  /** Реплики «рядом» и скрипты диалога из GET /api/npcs (только town). */
  private npcBarksById: Record<string, string[]> = {};
  private npcDialogueScriptsById: Record<
    string,
    { openers: { label: string; prompt: string }[] }
  > = {};
  private npcBarkNextAt: Record<string, number> = {};
  private lastNearNpcIdForBark: string | null = null;
  private hintText!: Phaser.GameObjects.Text;
  private previewMode = false;
  private onWindowBlur!: () => void;
  private lastPosPersist = 0;
  /** Троттлинг обновления разведки мини-карты подземелья (Zustand). */
  private lastDungeonMapRevealAt = 0;
  private lastForestMapRevealAt = 0;
  /** Бесконечный лес: подгрузка чанков. */
  private forestChunkMgr: ForestChunkManager | null = null;
  /** Соль захода в лес: новые id `forest_w_*` и новые позиции диких мобов. */
  private forestVisitSalt = 0;
  private readonly forestWildSpawnById = new Map<string, LocationEnemySpawn>();
  private readonly forestWildSpawnedChunkKeys = new Set<string>();
  private lastForestBoundsKey = "";
  /** Деревья чанка леса: взаимодействие и удаление при рубке. */
  private forestTrees: Array<{
    img: Phaser.GameObjects.Image;
    collider: Phaser.GameObjects.Rectangle;
    key: string;
  }> = [];
  /** Крупные добываемые валуны чанка леса. */
  private forestRocks: Array<{
    img: Phaser.GameObjects.Image;
    collider: Phaser.GameObjects.Rectangle;
    key: string;
  }> = [];
  /** Пни после рубки: ключ дерева → спрайт (снять по таймеру или при выгрузке чанка). */
  private forestStumpSprites = new Map<
    string,
    Phaser.GameObjects.Image
  >();
  private lastForestStumpExpireCheckMs = 0;
  /** Канал добычи (дерево / валун): прогресс, удары, UI. */
  private gatherChannel: {
    kind: "tree" | "rock";
    key: string;
    img: Phaser.GameObjects.Image;
    collider: Phaser.GameObjects.Rectangle;
    anchorX: number;
    anchorY: number;
    elapsedMs: number;
  } | null = null;
  private gatherStrikeTimers: Phaser.Time.TimerEvent[] = [];
  private gatherProgressGfx: Phaser.GameObjects.Graphics | null = null;
  private modalBlocked = false;
  private pickups: Array<{
    id: string;
    sprite: Phaser.GameObjects.Image;
    curatedId: string;
    qty: number;
  }> = [];
  private enemies: EnemyMob[] = [];
  private lastEnemyRespawnCheckMs = 0;
  /** Спавнер подземелья (Phaser `time`). */
  private dungeonNextSpawnAt = 0;
  private dungeonMobSeq = 0;
  /**
   * Короткое окно неуязвимости после респавна, чтобы враг, уже находившийся
   * в зоне удара, не зациклил цикл смертей.
   */
  private postRespawnInvulUntil = 0;
  private lastPlayerAttackTime = -1_000_000;
  private pointerAttackQueued = false;
  /** Активная локация (контент и коллизии пересобираются при переходе). */
  private locationDef!: GameLocation;
  private currentLocationId!: LocationId;
  private worldDisposables: Phaser.GameObjects.GameObject[] = [];
  /** Прямоугольники коллизий только от `imageProps` (пересборка после hot-reload вырезов). */
  private propObstacleRects: Phaser.GameObjects.Rectangle[] = [];
  private locationTransition = false;
  /** Станции крафта — позиции из актуального layout (после правок карты). */
  private craftStationsResolved: ResolvedCraftStation[] = [];
  /** Удержание Shift — спринт (быстрее, тратит стамину; после нуля стамины — «перегруз» без спринта) */
  private keyShiftSprint!: Phaser.Input.Keyboard.Key;
  private sfxVolUnsub: (() => void) | undefined;

  private readonly boundOnSliceTexturesApplied = (): void => {
    this.rebuildImagePropObstacleRects();
  };

  constructor() {
    super({ key: "MainScene" });
  }

  /** Повторно подтягиваем `asset-slice-overrides.json` в кэш до `create` (после остановки BootScene). */
  preload(): void {
    this.load.json("sliceOverrides", "/asset-slice-overrides.json");
  }

  create(): void {
    void this.bootstrap();
  }

  private addStaticRect(
    x: number,
    y: number,
    w: number,
    h: number
  ): Phaser.GameObjects.Rectangle {
    const r = this.add.rectangle(x, y, w, h, 0x000000, 0);
    r.setVisible(false);
    this.physics.add.existing(r, true);
    this.obstacles.add(r);
    return r;
  }

  private placePropImage(
    x: number,
    y: number,
    key: string,
    collider?: { w: number; h: number; oy?: number },
    frame?: number
  ): Phaser.GameObjects.Image {
    const img =
      frame !== undefined
        ? this.add.image(x, y, key, frame).setOrigin(0.5, 1)
        : this.add.image(x, y, key).setOrigin(0.5, 1);
    img.setDepth(y);
    const coll = getEffectivePropCollider(this, key, frame, collider);
    if (coll) {
      const oy = coll.oy ?? coll.h / 2;
      const r = this.addStaticRect(x, y - oy, coll.w, coll.h);
      this.propObstacleRects.push(r);
    }
    this.pushWorldObject(img);
    return img;
  }

  /**
   * Проп чанка леса: спрайт в `worldDisposables`, коллайдер только в `obstacles`
   * (очистка через `obstacles.clear` / destroy чанка).
   */
  private placeChunkLayoutProp(
    _chunkKey: string,
    p: LayoutImageProp
  ): Phaser.GameObjects.GameObject[] {
    const seed = useGameStore.getState().forestWorldSeed;
    if (TREE_TEXTURE_KEY_SET.has(p.texture)) {
      const treeKey = forestTreePersistKey(seed, p.x, p.y);
      if (useGameStore.getState().isForestTreeChopped(treeKey)) {
        return [];
      }
      const stumpUntil =
        useGameStore.getState().forestTreeStumps[treeKey];
      if (
        typeof stumpUntil === "number" &&
        stumpUntil > Date.now()
      ) {
        const stumpTex = forestStumpTextureKey(p.texture);
        if (!this.textures.exists(stumpTex)) {
          return [];
        }
        const stumpImg = this.add
          .image(p.x, p.y, stumpTex)
          .setOrigin(0.5, 1);
        stumpImg.setDepth(p.y);
        this.pushWorldObject(stumpImg);
        this.registerForestStumpSprite(treeKey, stumpImg);
        return [stumpImg];
      }
    }

    if (p.mineableRock === true) {
      const rockKey = forestTreePersistKey(seed, p.x, p.y);
      if (useGameStore.getState().isForestRockMined(rockKey)) {
        return [];
      }
    }

    if (
      p.mineableRock &&
      p.textureCrop &&
      !this.textures.exists(p.texture)
    ) {
      return [];
    }

    let img: Phaser.GameObjects.Image;
    if (p.mineableRock === true && p.textureCrop) {
      const croppedKey = ensureCroppedPropTexture(this, p.texture, p.textureCrop);
      if (!croppedKey) return [];
      img = this.add.image(p.x, p.y, croppedKey).setOrigin(0.5, 1);
    } else {
      img =
        p.frame !== undefined
          ? this.add.image(p.x, p.y, p.texture, p.frame).setOrigin(0.5, 1)
          : this.add.image(p.x, p.y, p.texture).setOrigin(0.5, 1);
    }
    img.setDepth(p.y);
    const coll =
      p.textureCrop && p.collider
        ? p.collider
        : getEffectivePropCollider(this, p.texture, p.frame, p.collider);
    const out: Phaser.GameObjects.GameObject[] = [img];
    if (coll) {
      const oy = coll.oy ?? coll.h / 2;
      const r = this.addStaticRect(p.x, p.y - oy, coll.w, coll.h);
      out.push(r);
      if (TREE_TEXTURE_KEY_SET.has(p.texture)) {
        const treeKey = forestTreePersistKey(seed, p.x, p.y);
        this.forestTrees.push({ img, collider: r, key: treeKey });
      } else if (p.mineableRock === true) {
        const rockKey = forestTreePersistKey(seed, p.x, p.y);
        this.forestRocks.push({ img, collider: r, key: rockKey });
      }
    }
    this.pushWorldObject(img);
    return out;
  }

  private applyForestWorldBounds(): void {
    if (!this.forestChunkMgr) return;
    const b = this.forestChunkMgr.computeWorldBounds();
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    this.physics.world.setBounds(b.minX, b.minY, w, h);
    if (!this.previewMode) {
      this.cameras.main.setBounds(b.minX, b.minY, w, h);
    }
  }

  /** Пересобирает только коллайдеры `imageProps` после hot-reload вырезов (текстуры уже обновлены). */
  private rebuildImagePropObstacleRects(): void {
    if (!this.obstacles || !this.locationDef) return;
    for (const r of this.propObstacleRects) {
      if (r?.active) {
        this.obstacles.remove(r, true, true);
      }
    }
    this.propObstacleRects = [];
    for (const p of this.locationDef.imageProps) {
      if (!p.collider) continue;
      const texKey =
        p.textureCrop !== undefined
          ? `${p.texture}__crop_${p.textureCrop.x}_${p.textureCrop.y}_${p.textureCrop.w}_${p.textureCrop.h}`
          : p.texture;
      const coll = getEffectivePropCollider(this, texKey, p.frame, p.collider);
      if (!coll) continue;
      const oy = coll.oy ?? coll.h / 2;
      const r = this.addStaticRect(p.x, p.y - oy, coll.w, coll.h);
      this.propObstacleRects.push(r);
    }
  }

  private pushWorldObject(obj: Phaser.GameObjects.GameObject): void {
    this.worldDisposables.push(obj);
  }

  /** Пульсирующая подсветка прямоугольников `exits` (выход из данжа / вход / прочие). */
  private addExitZoneHighlights(locId: LocationId, exits: LocationExit[]): void {
    if (!exits.length) return;
    for (const ex of exits) {
      const { fill, stroke } = exitZoneHighlightColors(locId, ex);
      const cx = ex.x + ex.w / 2;
      const cy = ex.y + ex.h / 2;
      const r = this.add
        .rectangle(cx, cy, ex.w, ex.h, fill, 0.24)
        .setStrokeStyle(2, stroke, 0.92)
        .setDepth(0.35);
      this.tweens.add({
        targets: r,
        alpha: { from: 0.5, to: 1 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
      this.pushWorldObject(r);
    }
  }

  private clearWorldEntities(): void {
    this.cancelForestGather();
    this.forestTrees = [];
    this.forestRocks = [];
    this.forestStumpSprites.clear();
    this.lastForestBoundsKey = "";
    this.forestChunkMgr?.destroy();
    this.forestChunkMgr = null;
    for (const n of this.npcs) {
      n.destroy();
    }
    this.npcs = [];
    for (const e of this.enemies) {
      e.destroy();
    }
    this.enemies = [];
    for (const p of this.pickups) {
      p.sprite.destroy();
    }
    this.pickups = [];
    this.propObstacleRects = [];
    this.obstacles?.clear(true, true);
    for (const o of this.worldDisposables) {
      o.destroy();
    }
    this.worldDisposables = [];
    this.npcBarksById = {};
    this.npcDialogueScriptsById = {};
    this.npcBarkNextAt = {};
    this.lastNearNpcIdForBark = null;
    this.dungeonNextSpawnAt = 0;
    this.dungeonMobSeq = 0;
    this.forestVisitSalt = 0;
    this.forestWildSpawnById.clear();
    this.forestWildSpawnedChunkKeys.clear();
  }

  private spawnEnemyFromSpawnDef(
    sp: EnemySpawnDef | LocationEnemySpawn,
    statMult?: { hpMult?: number; atkMult?: number }
  ): void {
    const mobCat = this.manifest.mobs;
    if (!mobCat) return;
    if (
      this.enemies.some(
        (e) => e.instanceId === sp.id && e.state !== "dead"
      )
    ) {
      return;
    }
    const mobDef = mobCat[sp.mobVisualId];
    if (!mobDef) {
      console.warn("[MainScene] manifest.mobs: нет ключа", sp.mobVisualId);
      return;
    }
    if (!this.anims.exists(mobDef.idleAnim)) return;
    let mobStats = getEnemyGruntStatsForLevel(this.resolveGruntSpawnLevel(sp));
    if (statMult?.hpMult) {
      mobStats = {
        ...mobStats,
        hp: Math.max(1, Math.floor(mobStats.hp * statMult.hpMult)),
      };
    }
    if (statMult?.atkMult) {
      mobStats = {
        ...mobStats,
        atk: Math.max(1, Math.floor(mobStats.atk * statMult.atkMult)),
      };
    }
    const radii = resolveMobAggroRadii(sp);
    const mob = new EnemyMob(this, sp.x, sp.y, {
      instanceId: sp.id,
      mobVisualId: sp.mobVisualId,
      zoneId: sp.zoneId,
      lootTableId: sp.lootTable,
      spawnX: sp.x,
      spawnY: sp.y,
      hp: mobStats.hp,
      armor: mobStats.armor,
      level: mobStats.level,
      speed: mobStats.speed,
      attackRange: mobStats.attackRange,
      attackDamage: mobStats.atk,
      attackCooldownMs: mobStats.attackCooldownMs,
      aggroRadius: radii.aggroRadius,
      loseAggroRadius: radii.loseAggroRadius,
      leashRadius: radii.leashRadius,
      idleAnim: mobDef.idleAnim,
      runAnim: mobDef.runAnim,
      textureKey: mobDef.textureKeyIdle,
    });
    mob.setDepth(sp.y);
    this.physics.add.collider(mob, this.obstacles);
    this.enemies.push(mob);
  }

  private resolveGruntSpawnLevel(sp: EnemySpawnDef | LocationEnemySpawn): number {
    if (this.currentLocationId === "forest") {
      return forestMobLevelFromTemplate(sp.level, sp.x, sp.y);
    }
    return sp.level ?? 1;
  }

  private currentMobSpawnList(): readonly (LocationEnemySpawn | EnemySpawnDef)[] {
    const base = this.locationDef.enemySpawns ?? ENEMY_SPAWNS;
    if (this.currentLocationId !== "forest") return base;
    return [...base, ...this.forestWildSpawnById.values()];
  }

  /**
   * Процедурные мобы по загруженным чанкам (не только хаб 0,0).
   * При выгрузке чанка сущности удаляются; при повторном входе — новые позиции.
   */
  private syncForestWildEncounters(): void {
    if (this.previewMode || !this.forestChunkMgr || !this.manifest.mobs) return;
    if (this.currentLocationId !== "forest" || this.forestVisitSalt === 0) return;

    const loaded = new Set(this.forestChunkMgr.getLoadedChunkKeys());
    const prefix = `forest_w_${this.forestVisitSalt}_`;

    for (const e of [...this.enemies]) {
      if (!e.instanceId.startsWith(prefix)) continue;
      const ck = parseWildForestMobChunkKey(e.instanceId);
      if (!ck || loaded.has(ck)) continue;
      useGameStore.getState().clearEnemyRespawnAfterSpawn(e.instanceId);
      this.forestWildSpawnById.delete(e.instanceId);
      this.forestWildSpawnedChunkKeys.delete(ck);
      e.destroy();
      this.enemies = this.enemies.filter((x) => x !== e);
    }

    const worldSeed = useGameStore.getState().forestWorldSeed;

    for (const ck of loaded) {
      if (this.forestWildSpawnedChunkKeys.has(ck)) continue;
      this.forestWildSpawnedChunkKeys.add(ck);

      const parts = ck.split(",");
      const cx = Number(parts[0]);
      const cy = Number(parts[1]);
      if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
      if (cx === 0 && cy === 0) continue;

      for (const slot of wildMobSlotsForChunk(cy)) {
        const sp = createForestWildMobSpawn(cx, cy, slot, this.forestVisitSalt, worldSeed);
        if (!sp) continue;
        this.forestWildSpawnById.set(sp.id, sp);
        this.spawnEnemyFromSpawnDef(sp);
        if (!this.enemies.some((x) => x.instanceId === sp.id)) {
          this.forestWildSpawnById.delete(sp.id);
        }
      }
    }
  }

  /** Респавн на текущей локации: реанимация трупа или новый экземпляр. */
  private tickEnemyRespawns(): void {
    const now = Date.now();
    const mobSpawns = this.currentMobSpawnList();
    const store = useGameStore.getState();
    const map = store.enemyRespawnNotBeforeMs;

    for (const sp of mobSpawns) {
      const notBefore = map[sp.id];
      if (notBefore === undefined || now < notBefore) continue;

      const deadMob = this.enemies.find(
        (e) => e.instanceId === sp.id && e.state === "dead"
      );
      if (deadMob) {
        const stats = getEnemyGruntStatsForLevel(this.resolveGruntSpawnLevel(sp));
        deadMob.reviveAtSpawn(stats);
        store.clearEnemyRespawnAfterSpawn(sp.id);
        continue;
      }

      const alive = this.enemies.some(
        (e) => e.instanceId === sp.id && e.state !== "dead"
      );
      if (alive) {
        store.clearEnemyRespawnAfterSpawn(sp.id);
        continue;
      }

      if (
        this.currentLocationId === "forest" &&
        !isForestWildDynamicMobId(sp.id)
      ) {
        const p = forestSpawnPresenceChance(sp.x, sp.y);
        if (Math.random() > p) {
          store.scheduleEnemyRespawn(sp.id, sp.mobVisualId, {
            delayMs: Phaser.Math.Between(2200, 5200),
          });
          continue;
        }
      }

      this.spawnEnemyFromSpawnDef(sp);
      store.clearEnemyRespawnAfterSpawn(sp.id);
    }
  }

  private tickNpcProximityBarks(
    time: number,
    nearNpc: PatrolNpc | undefined
  ): void {
    if (this.dialogueOpen || this.modalBlocked) return;

    if (!nearNpc) {
      if (this.lastNearNpcIdForBark) {
        delete this.npcBarkNextAt[this.lastNearNpcIdForBark];
        this.lastNearNpcIdForBark = null;
      }
      return;
    }

    const id = nearNpc.npcId;
    if (this.lastNearNpcIdForBark !== id) {
      if (this.lastNearNpcIdForBark) {
        delete this.npcBarkNextAt[this.lastNearNpcIdForBark];
      }
      this.lastNearNpcIdForBark = id;
    }

    const lines = this.npcBarksById[id];
    if (!lines?.length) return;

    if (this.npcBarkNextAt[id] === undefined) {
      this.npcBarkNextAt[id] =
        time +
        Phaser.Math.Between(NPC_BARK_COOLDOWN_MS_MIN, NPC_BARK_COOLDOWN_MS_MAX);
    }

    if (time < this.npcBarkNextAt[id]!) return;

    const text = lines[Phaser.Math.Between(0, lines.length - 1)]!;
    window.dispatchEvent(
      new CustomEvent("nagibatop-npc-bark", {
        detail: {
          npcId: id,
          displayName: nearNpc.displayName,
          text,
        },
      })
    );
    this.npcBarkNextAt[id] =
      time +
      Phaser.Math.Between(NPC_BARK_COOLDOWN_MS_MIN, NPC_BARK_COOLDOWN_MS_MAX);
  }

  private async buildWorldContent(locId: LocationId): Promise<void> {
    this.clearWorldEntities();
    if (locId === "dungeon") {
      setRuntimeDungeonFloor(useGameStore.getState().dungeonCurrentFloor);
    }
    const loc = getLocation(locId);
    this.currentLocationId = locId;
    this.locationDef = loc;

    if (locId === "forest") {
      this.forestVisitSalt = Phaser.Math.Between(1, 0x7fffffff);
      useGameStore.getState().purgeForestWildEnemyTimers();
      useGameStore.getState().ensureForestWorldSeedIfUnset();
      this.forestChunkMgr = new ForestChunkManager({
        scene: this,
        getWorldSeed: () => useGameStore.getState().forestWorldSeed,
        pushWorldObject: (o) => this.pushWorldObject(o),
        placeChunkLayoutProp: (ck, p) => this.placeChunkLayoutProp(ck, p),
      });
      const sp0 = loc.spawns.default;
      this.forestChunkMgr.sync(sp0.x, sp0.y);
      this.lastForestBoundsKey = "";
      this.applyForestWorldBounds();
      useGameStore.getState().revealForestMapAtWorld(sp0.x, sp0.y);

      if (this.manifest.mobs) {
        this.syncForestWildEncounters();
        const now = Date.now();
        const respawn = useGameStore.getState().enemyRespawnNotBeforeMs;
        const mobSpawns = loc.enemySpawns ?? ENEMY_SPAWNS;
        for (const sp of mobSpawns) {
          const notBefore = respawn[sp.id];
          if (notBefore !== undefined && now < notBefore) continue;
          if (Math.random() > forestSpawnPresenceChance(sp.x, sp.y)) {
            useGameStore.getState().scheduleEnemyRespawn(sp.id, sp.mobVisualId, {
              delayMs: Phaser.Math.Between(3200, 7200),
            });
          } else {
            this.spawnEnemyFromSpawnDef(sp);
            if (notBefore !== undefined && now >= notBefore) {
              useGameStore.getState().clearEnemyRespawnAfterSpawn(sp.id);
            }
          }
        }
      }

      this.addExitZoneHighlights(locId, loc.exits);
      this.craftStationsResolved = resolveCraftStations(loc);
      return;
    }

    const W = loc.world.width;
    const H = loc.world.height;
    this.physics.world.setBounds(0, 0, W, H);

    this.pushWorldObject(
      this.add
        .rectangle(0, 0, W, H, loc.backgroundFill)
        .setOrigin(0, 0)
        .setDepth(-10)
    );

    const ground = addGroundDisplay(
      this,
      loc.groundTextureKey,
      W,
      H,
      0
    );
    this.pushWorldObject(ground);

    if (!loc.floorTiles || loc.floorTiles.length === 0) {
      for (const o of addPathDirtLayer(this, loc.pathSegments, 0.15)) {
        this.pushWorldObject(o);
      }
    }

    if (loc.floorTiles && loc.floorTiles.length > 0) {
      for (const t of loc.floorTiles) {
        if (!this.textures.exists(t.texture)) continue;
        const size = t.size ?? 16;
        const img = this.add
          .image(t.x, t.y, t.texture, t.frame)
          .setOrigin(0, 0);
        img.setDisplaySize(size, size);
        img.setDepth(0.2);
        this.pushWorldObject(img);
      }
    }

    const decorList = getGrassDecor(locId);
    for (const d of decorList) {
      const spr = this.add
        .image(d.x, d.y, "grass_decor", d.variant)
        .setOrigin(0.5, 1);
      spr.setDepth(d.y - 0.15);
      this.pushWorldObject(spr);
    }

    for (const p of loc.imageProps) {
      if (p.textureCrop) {
        const ck = ensureCroppedPropTexture(this, p.texture, p.textureCrop);
        if (ck) {
          this.placePropImage(p.x, p.y, ck, p.collider, undefined);
        }
      } else {
        this.placePropImage(p.x, p.y, p.texture, p.collider, p.frame);
      }
      if (p.texture === "pond" && loc.pondCollider) {
        const pc = loc.pondCollider;
        this.addStaticRect(pc.x, pc.y, pc.w, pc.h);
      }
    }

    for (const s of loc.animStations) {
      const spr = this.add
        .sprite(s.x, s.y, s.texture, 0)
        .setOrigin(0.5, 1);
      spr.setDepth(s.y);
      if (this.anims.exists(s.animKey)) {
        spr.play(s.animKey);
      }
      this.pushWorldObject(spr);
      this.addStaticRect(
        s.collider.x,
        s.collider.y,
        s.collider.w,
        s.collider.h
      );
    }

    if (locId === "town") {
    this.npcBarksById = {};
    this.npcDialogueScriptsById = {};
    this.npcBarkNextAt = {};
    this.lastNearNpcIdForBark = null;

    let list: NpcPublic[] = [];
    try {
      const res = await fetch("/api/npcs");
      if (!res.ok) {
        console.warn("[MainScene] /api/npcs:", res.status, res.statusText);
      } else {
        const raw = (await res.json()) as unknown;
        list = Array.isArray(raw) ? (raw as NpcPublic[]) : [];
      }
    } catch (e) {
      console.warn("[MainScene] /api/npcs недоступен", e);
    }

    for (const n of list) {
      if (!n?.id) continue;
      if (n.barks?.length) this.npcBarksById[n.id] = n.barks;
      if (n.dialogueScripts?.openers?.length) {
        this.npcDialogueScriptsById[n.id] = {
          openers: n.dialogueScripts.openers,
        };
      }
      if (!n.route?.spawn) continue;
      const idleTex = loc.npcIdleTexture[n.id];
      const unitDef = this.manifest.units[n.id];
      if (!idleTex || !unitDef) continue;

      const route = applyNpcSpawnOverride(
        n.route,
        loc.npcSpawnOverrides?.[n.id]
      );
      const npc = new PatrolNpc(this, {
        id: n.id,
        idleTextureKey: idleTex,
        idleAnim: unitDef.idleAnim,
        runAnim: unitDef.runAnim,
        route,
        displayName: n.displayName,
      });
      this.physics.add.collider(npc, this.obstacles);
      this.npcs.push(npc);
    }

    const taken = useGameStore.getState().pickedWorldItemIds;
    if (ITEM_ATLAS.available && this.textures.exists(ITEM_ATLAS.textureKey)) {
      for (const wp of WORLD_PICKUPS) {
        if (taken[wp.id]) continue;
        const cdef = getCuratedItem(wp.curatedId);
        if (!cdef) continue;
        const spr = this.add
          .image(wp.x, wp.y, ITEM_ATLAS.textureKey, cdef.atlasFrame)
          .setOrigin(0.5, 1);
        spr.setDepth(wp.y + 0.5);
        this.pickups.push({
          id: wp.id,
          sprite: spr,
          curatedId: wp.curatedId,
          qty: wp.qty,
        });
      }
    }
    }

    if (this.manifest.mobs) {
      if (locId === "town") {
        const now = Date.now();
        const respawn = useGameStore.getState().enemyRespawnNotBeforeMs;
        const mobSpawns = loc.enemySpawns ?? ENEMY_SPAWNS;
        for (const sp of mobSpawns) {
          const notBefore = respawn[sp.id];
          if (notBefore !== undefined && now < notBefore) continue;
          this.spawnEnemyFromSpawnDef(sp);
          if (notBefore !== undefined && now >= notBefore) {
            useGameStore.getState().clearEnemyRespawnAfterSpawn(sp.id);
          }
        }
      }
      if (locId === "dungeon") {
        this.setupDungeonCombat();
      }
    }

    this.addExitZoneHighlights(locId, loc.exits);
    this.craftStationsResolved = resolveCraftStations(loc);
  }

  private isDungeonBossAlive(): boolean {
    const b = this.enemies.find(
      (e) => e.instanceId === DUNGEON_BOSS_INSTANCE_ID
    );
    return !!b && b.state !== "dead";
  }

  /** Сундук босса недоступен только пока жив страж (после убийства можно сразу открыть). */
  private isDungeonBossChestBlocked(): boolean {
    return this.isDungeonBossAlive();
  }

  private setupDungeonCombat(): void {
    const now = Date.now();
    const respawn = useGameStore.getState().enemyRespawnNotBeforeMs;
    const bossId = DUNGEON_BOSS_INSTANCE_ID;
    const notBefore = respawn[bossId];
    if (notBefore === undefined || now >= notBefore) {
      const stBoss = useGameStore.getState();
      const playerLv = Math.max(1, stBoss.character.level);
      const floor = clampDungeonFloor(stBoss.dungeonCurrentFloor);
      const bossSpawn = getDungeonBossSpawnForFloor(floor);
      const bossLevel = getBossLevel(floor, playerLv);
      this.spawnEnemyFromSpawnDef(
        {
          id: bossId,
          zoneId: "boss_room",
          x: bossSpawn.x,
          y: bossSpawn.y,
          lootTable: bossSpawn.lootTable,
          mobVisualId: bossSpawn.mobVisualId,
          level: bossLevel,
          aggroRadius: 280,
          leashRadius: 560,
        },
        { hpMult: DUNGEON_BOSS_HP_MULT, atkMult: DUNGEON_BOSS_ATK_MULT }
      );
      if (notBefore !== undefined && now >= notBefore) {
        useGameStore.getState().clearEnemyRespawnAfterSpawn(bossId);
      }
    }
    this.dungeonMobSeq = 0;
    this.dungeonNextSpawnAt = this.time.now + 2500;
  }

  private tickDungeonSpawner(time: number): void {
    if (this.currentLocationId !== "dungeon") return;
    if (!this.manifest.mobs || !this.player) return;
    if (time < this.dungeonNextSpawnAt) return;
    const stSpawn = useGameStore.getState();
    const floor = clampDungeonFloor(stSpawn.dungeonCurrentFloor);
    this.dungeonNextSpawnAt = time + getDungeonSpawnIntervalMs(floor);

    const aliveGrunts = this.enemies.filter(
      (e) => e.instanceId.startsWith("dungeon_m_") && e.state !== "dead"
    ).length;
    if (aliveGrunts >= getDungeonSpawnMaxAlive(floor)) return;

    const px = this.player.x;
    const py = this.player.y;
    const gruntCenters = [...getDungeonGruntRoomCentersForFloor(floor)];
    const far = gruntCenters.filter(
      (c) =>
        Phaser.Math.Distance.Between(px, py, c.x, c.y) >=
        DUNGEON_SPAWN_MIN_DIST_FROM_PLAYER
    );
    const pool = far.length ? far : gruntCenters;
    const room = pool[Phaser.Math.Between(0, pool.length - 1)]!;
    const L = Math.max(1, stSpawn.character.level);
    const range = getGruntLevelRange(floor, L);
    const lvl = Phaser.Math.Between(range.min, range.max);
    const vid = Phaser.Math.RND.pick([...DUNGEON_GRUNT_VISUAL_IDS]);
    this.dungeonMobSeq += 1;
    this.spawnEnemyFromSpawnDef({
      id: `dungeon_m_${this.dungeonMobSeq}`,
      zoneId: "dungeon_hall",
      x: room.x + Phaser.Math.Between(-28, 28),
      y: room.y + Phaser.Math.Between(-20, 20),
      lootTable: "grunt",
      mobVisualId: vid,
      level: lvl,
    });
  }

  /**
   * Смена локации: затемнение, пересборка мира, позиция из spawns[spawnId].
   */
  private gotoLocation(
    targetId: LocationId,
    spawnId: string,
    opts?: { afterFadeIn?: () => void; postSpawnInvulMs?: number }
  ): void {
    if (this.previewMode || this.locationTransition) return;
    this.locationTransition = true;
    if (targetId === "dungeon") {
      setRuntimeDungeonFloor(useGameStore.getState().dungeonCurrentFloor);
    }
    const targetLoc = getLocation(targetId);
    const sp =
      targetLoc.spawns[spawnId as keyof typeof targetLoc.spawns] ??
      targetLoc.spawns.default;

    this.cameras.main.fadeOut(200, 0, 0, 0);
    this.time.delayedCall(210, () => {
      void (async () => {
        try {
          this.clearWorldEntities();
          await this.buildWorldContent(targetId);
          if (!this.player?.body) {
            console.warn("[MainScene] gotoLocation: нет тела игрока после сборки мира");
            if (this.sys?.isActive()) {
              this.cameras.main.fadeIn(220, 0, 0, 0);
            }
            return;
          }
          this.player.setPosition(sp.x, sp.y);
          this.player.setVelocity(0, 0);
          useGameStore.getState().setLocationAndPosition(targetId, sp.x, sp.y);
          if (targetId === "forest" && this.forestChunkMgr) {
            this.forestChunkMgr.sync(sp.x, sp.y);
            this.applyForestWorldBounds();
          } else {
            const W = this.locationDef.world.width;
            const H = this.locationDef.world.height;
            this.cameras.main.setBounds(0, 0, W, H);
          }
          if (!this.previewMode) {
            this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
            this.cameras.main.setZoom(CAMERA_ZOOM_PLAY);
          }
          this.cameras.main.fadeIn(220, 0, 0, 0);
          const tNow = this.time.now;
          if (opts?.postSpawnInvulMs) {
            this.postRespawnInvulUntil = tNow + opts.postSpawnInvulMs;
          }
          opts?.afterFadeIn?.();
        } catch (e) {
          console.error("[MainScene] gotoLocation", e);
          if (this.sys?.isActive()) {
            this.cameras.main.fadeIn(220, 0, 0, 0);
          }
        } finally {
          this.locationTransition = false;
        }
      })();
    });
  }

  /** Сброс залипания WASD/стрелок после диалога или потери фокуса окна. */
  private resetMovementKeys(): void {
    this.input.keyboard?.resetKeys();

    const maybe = (
      k: Phaser.Input.Keyboard.Key | undefined
    ): k is Phaser.Input.Keyboard.Key => !!k;

    const keys = [
      this.keyW,
      this.keyA,
      this.keyS,
      this.keyD,
      this.keyShiftSprint,
    ] as Phaser.Input.Keyboard.Key[];

    for (const k of keys) {
      if (!maybe(k)) continue;
      k.reset();
      k.isDown = false;
    }

    const c = this.cursors;
    if (c) {
      for (const dir of ["up", "down", "left", "right"] as const) {
        const kk = c[dir];
        if (kk) {
          kk.reset();
          kk.isDown = false;
        }
      }
    }
  }

  private async bootstrap(): Promise<void> {
    this.previewMode =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("preview") === "1";

    if (typeof window !== "undefined") {
      await waitForGameStoreHydration();
    }

    const manifest = this.registry.get("assetManifest") as AssetManifest | undefined;
    if (!manifest?.world) {
      throw new Error("assetManifest не загружен в registry");
    }
    this.manifest = manifest;

    const W = manifest.world.width;
    const H = manifest.world.height;

    const heroCfg = manifest.hero;
    if (!heroCfg) throw new Error("manifest.hero отсутствует");

    this.obstacles = this.physics.add.staticGroup();

    const storeState =
      typeof window !== "undefined" ? useGameStore.getState() : null;
    const startLoc: LocationId = storeState?.currentLocationId ?? "town";
    await this.buildWorldContent(startLoc);

    if (typeof window !== "undefined") {
      window.addEventListener(
        ASSET_SLICE_OVERRIDES_TEXTURES_APPLIED,
        this.boundOnSliceTexturesApplied
      );
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          ASSET_SLICE_OVERRIDES_TEXTURES_APPLIED,
          this.boundOnSliceTexturesApplied
        );
      }
    });

    const lw = this.locationDef.world.width;
    const lh = this.locationDef.world.height;
    if (
      (W !== lw || H !== lh) &&
      this.locationDef.id !== "dungeon" &&
      this.locationDef.id !== "forest"
    ) {
      console.warn(
        "[MainScene] manifest.world не совпадает с локацией:",
        manifest.world,
        this.locationDef.world
      );
    }

    const defSpawn = getLocation(startLoc).spawns.default;
    const savedPos =
      typeof window !== "undefined"
        ? useGameStore.getState().player
        : defSpawn;
    const spawnX = savedPos?.x ?? defSpawn.x;
    const spawnY = savedPos?.y ?? defSpawn.y;

    this.player = this.physics.add.sprite(
      spawnX,
      spawnY,
      "pc_idle_down",
      0
    );
    this.player.setOrigin(0.5, 1);
    this.player.setCollideWorldBounds(true);
    applyPixelCrawlerFeetHitbox(this.player);
    if (this.anims.exists(heroCfg.idleDown)) {
      this.player.anims.play(heroCfg.idleDown, true);
    }

    this.heroAnim = new HeroAnimController(this.player, heroCfg);
    this.lastHp =
      typeof window !== "undefined"
        ? useGameStore.getState().character.hp
        : 100;

    this.physics.add.collider(this.player, this.obstacles);

    const kb = this.input.keyboard;
    if (!kb) throw new Error("keyboard");
    this.cursors = kb.createCursorKeys();
    this.keyE = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.keyEsc = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.keyW = kb.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keyA = kb.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyS = kb.addKey(Phaser.Input.Keyboard.KeyCodes.S);
    this.keyD = kb.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyShiftSprint = kb.addKey(
      Phaser.Input.Keyboard.KeyCodes.SHIFT
    );

    kb.addCapture(PHASER_KEYBOARD_CAPTURE_KEYS);

    this.input.on(
      "pointerdown",
      (pointer: Phaser.Input.Pointer) => {
        if (this.previewMode || this.dialogueOpen || this.modalBlocked) return;
        if (!pointer.leftButtonDown()) return;
        const el = pointer.event?.target as HTMLElement | undefined;
        if (
          el?.closest?.(
            "button,a,[role='dialog'],input,textarea,select,[contenteditable=true]"
          )
        ) {
          return;
        }
        this.pointerAttackQueued = true;
      }
    );

    if (startLoc === "forest" && this.forestChunkMgr) {
      this.forestChunkMgr.sync(spawnX, spawnY);
      this.applyForestWorldBounds();
    } else {
      this.cameras.main.setBounds(0, 0, lw, lh);
    }

    if (this.previewMode) {
      this.cameras.main.stopFollow();
      this.cameras.main.setZoom(1);
      const cx = startLoc === "forest" ? spawnX : lw / 2;
      const cy = startLoc === "forest" ? spawnY : lh / 2;
      this.cameras.main.centerOn(cx, cy);
    } else {
      this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
      this.cameras.main.setZoom(CAMERA_ZOOM_PLAY);
    }

    this.hintText = this.add.text(0, 0, "[ E ] Поговорить", {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#fef3c7",
      stroke: "#1c1917",
      strokeThickness: 4,
    });
    this.hintText.setOrigin(0.5, 1);
    this.hintText.setDepth(100000);
    this.hintText.setVisible(false);
    if (this.previewMode) {
      this.hintText.setVisible(false);
    }

    const onDialogueOpen = () => {
      if (!this.sys?.isActive()) return;
      this.resetMovementKeys();
      this.dialogueOpen = true;
      this.input.keyboard?.removeCapture(PHASER_KEYBOARD_CAPTURE_KEYS);
      if (this.input.keyboard) this.input.keyboard.enabled = false;
      if (this.player?.body) {
        this.player.setVelocity(0, 0);
        this.heroAnim.forceIdle();
      }
    };

    const onDialogueClose = (ev: Event) => {
      if (!this.sys?.isActive()) return;
      const ce = ev as CustomEvent<{ npcId: string }>;
      const id = ce.detail?.npcId;
      if (id) this.npcs.find((x) => x.npcId === id)?.endTalk();
      this.dialogueOpen = false;
      this.input.keyboard?.addCapture(PHASER_KEYBOARD_CAPTURE_KEYS);
      if (this.input.keyboard && !this.modalBlocked) {
        this.input.keyboard.enabled = true;
      }
      this.resetMovementKeys();
    };

    const onModalOpen = () => {
      if (!this.sys?.isActive()) return;
      this.modalBlocked = true;
      this.resetMovementKeys();
      if (this.player?.body) {
        this.player.setVelocity(0, 0);
      }
      if (this.input.keyboard) this.input.keyboard.enabled = false;
    };

    const onModalClose = () => {
      if (!this.sys?.isActive()) return;
      this.modalBlocked = false;
      if (this.input.keyboard && !this.dialogueOpen) {
        this.input.keyboard.enabled = true;
      }
      this.resetMovementKeys();
    };

    this.onWindowBlur = () => {
      this.resetMovementKeys();
    };

    window.addEventListener("npc-dialogue-open", onDialogueOpen);
    window.addEventListener("npc-dialogue-close", onDialogueClose);
    window.addEventListener("nagibatop-modal-open", onModalOpen);
    window.addEventListener("nagibatop-modal-close", onModalClose);
    window.addEventListener("blur", this.onWindowBlur);

    this.sound.volume = useUiSettingsStore.getState().sfxVolume;
    this.sfxVolUnsub = useUiSettingsStore.subscribe((state, prev) => {
      if (state.sfxVolume !== prev.sfxVolume) {
        this.sound.volume = state.sfxVolume;
      }
    });

    const onRespawnPlayer = (ev: Event) => {
      const ce = ev as CustomEvent<{ x?: number; y?: number }>;
      const x = ce.detail?.x;
      const y = ce.detail?.y;
      if (
        typeof x !== "number" ||
        typeof y !== "number" ||
        !this.player?.body
      ) {
        return;
      }
      this.player.setPosition(x, y);
      this.player.setVelocity(0, 0);
      this.heroAnim.resetAfterRespawn();
      this.lastHp = useGameStore.getState().character.hp;

      /**
       * Иначе враг, преследовавший героя до момента смерти, остаётся рядом с
       * точкой респавна и мгновенно бьёт снова, создавая цикл смертей.
       * `this.time.now` использует ту же ось времени, что и аргумент `time`
       * в update() и `attackCooldownUntil` у мобов.
       */
      const tNow = this.time.now;
      for (const e of this.enemies) {
        if (e.state === "dead") continue;
        e.setPosition(e.spawnX, e.spawnY);
        e.setVelocity(0, 0);
        e.attackCooldownUntil = tNow + 800;
        e.state = "idle";
      }

      this.postRespawnInvulUntil = tNow + 1200;
    };

    window.addEventListener("nagibatop-respawn-player", onRespawnPlayer);

    const onRequestGotoLocation = (ev: Event) => {
      if (this.previewMode || !this.sys?.isActive()) return;
      const ce = ev as CustomEvent<{
        locationId?: unknown;
        spawnId?: unknown;
        reviveIfDead?: unknown;
        deathWarp?: unknown;
      }>;
      const lidRaw = ce.detail?.locationId;
      if (typeof lidRaw !== "string" || !isLocationId(lidRaw)) return;
      const spawnRaw = ce.detail?.spawnId;
      const spawnId =
        typeof spawnRaw === "string" && spawnRaw.trim().length > 0
          ? spawnRaw.trim()
          : "default";
      const revive =
        ce.detail?.reviveIfDead === undefined ? true : !!ce.detail?.reviveIfDead;
      const deathWarp = ce.detail?.deathWarp === true;
      if (revive && this.player?.body) {
        const st = useGameStore.getState();
        if (st.character.hp <= 0) {
          const origin =
            st.isekaiOrigin?.completed === true ? st.isekaiOrigin.bonus : undefined;
          const d = getDerivedCombatStats(
            st.character.level,
            st.equipped,
            origin,
            st.character.attrs
          );
          useGameStore.setState({
            character: {
              ...st.character,
              hp: d.maxHp,
              sta: d.maxSta,
            },
            staWindedUntilMs: 0,
          });
          this.heroAnim.resetAfterRespawn();
          if (this.anims.exists(heroCfg.idleDown)) {
            this.player.anims.play(heroCfg.idleDown, true);
          }
          this.lastHp = d.maxHp;
        }
      }
      const gotoOpts =
        deathWarp && this.player?.body
          ? {
              postSpawnInvulMs: 1200,
              afterFadeIn: () => {
                this.heroAnim.resetAfterRespawn();
                if (this.anims.exists(heroCfg.idleDown)) {
                  this.player!.anims.play(heroCfg.idleDown, true);
                }
                this.lastHp = useGameStore.getState().character.hp;
              },
            }
          : undefined;
      this.gotoLocation(lidRaw, spawnId, gotoOpts);
    };

    window.addEventListener(
      "nagibatop-request-goto-location",
      onRequestGotoLocation
    );

    const onDungeonEnter = (ev: Event) => {
      if (this.previewMode || !this.sys?.isActive()) return;
      const ce = ev as CustomEvent<{ spawnId?: unknown }>;
      const spawnRaw = ce.detail?.spawnId;
      const spawnId =
        typeof spawnRaw === "string" && spawnRaw.trim().length > 0
          ? spawnRaw.trim()
          : "from_town";
      this.gotoLocation("dungeon", spawnId);
    };
    window.addEventListener("nagibatop-dungeon-enter", onDungeonEnter);

    const onSpawnWorldPickup = (ev: Event) => {
      if (this.previewMode || !this.sys?.isActive() || !this.player) return;
      const ce = ev as CustomEvent<{
        curatedId?: unknown;
        qty?: unknown;
        worldX?: unknown;
        worldY?: unknown;
      }>;
      const idRaw = ce.detail?.curatedId;
      const qtyRaw = ce.detail?.qty;
      if (typeof idRaw !== "string" || !idRaw.trim()) return;
      const curatedId = idRaw.trim();
      const qty =
        typeof qtyRaw === "number" &&
        Number.isFinite(qtyRaw) &&
        qtyRaw >= 1
          ? Math.min(9999, Math.floor(qtyRaw))
          : 1;
      const wx = ce.detail?.worldX;
      const wy = ce.detail?.worldY;
      if (
        typeof wx === "number" &&
        Number.isFinite(wx) &&
        typeof wy === "number" &&
        Number.isFinite(wy)
      ) {
        const ox = Phaser.Math.Between(-10, 10);
        const oy = Phaser.Math.Between(-4, 8);
        this.spawnDroppedPickup(curatedId, qty, wx + ox, wy + oy);
        return;
      }
      const px = this.player.x;
      const py = this.player.y;
      const ox = Phaser.Math.Between(-22, 22);
      const oy = Phaser.Math.Between(-6, 18);
      this.spawnDroppedPickup(curatedId, qty, px + ox, py + oy);
    };

    window.addEventListener(SPAWN_WORLD_PICKUP_EVENT, onSpawnWorldPickup);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.sfxVolUnsub?.();
      this.sfxVolUnsub = undefined;
      window.removeEventListener("npc-dialogue-open", onDialogueOpen);
      window.removeEventListener("npc-dialogue-close", onDialogueClose);
      window.removeEventListener("nagibatop-modal-open", onModalOpen);
      window.removeEventListener("nagibatop-modal-close", onModalClose);
      window.removeEventListener("blur", this.onWindowBlur);
      window.removeEventListener(
        "nagibatop-respawn-player",
        onRespawnPlayer
      );
      window.removeEventListener(
        "nagibatop-request-goto-location",
        onRequestGotoLocation
      );
      window.removeEventListener("nagibatop-dungeon-enter", onDungeonEnter);
      window.removeEventListener(SPAWN_WORLD_PICKUP_EVENT, onSpawnWorldPickup);
      window.__NAGIBATOP_READY__ = false;
      delete window.__NAGIBATOP_CAPTURE_FULL_MAP__;
      delete window.__NAGIBATOP_HURT__;
      delete window.__NAGIBATOP_RESET_MOBS__;
      delete window.__NAGIBATOP_SET_CARRY__;
      this.heroAnim?.destroy();
    });

    window.__NAGIBATOP_CAPTURE_FULL_MAP__ = async () => {
      if (!this.booted || !this.sys?.isActive()) {
        return { ok: false, error: "Сцена не готова" };
      }

      const cam = this.cameras.main;
      const hintWasVisible = this.hintText.visible;
      this.hintText.setVisible(false);

      cam.stopFollow();

      const Ww = this.locationDef.world.width;
      const Hw = this.locationDef.world.height;

      const canvas = this.game.canvas as HTMLCanvasElement;
      const zoomFit = Math.min(canvas.width / Ww, canvas.height / Hw);
      cam.setZoom(zoomFit);
      cam.centerOn(Ww / 2, Hw / 2);

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });

      try {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/png");
        });
        if (!blob) {
          return { ok: false, error: "Не удалось получить изображение" };
        }
        if (!navigator.clipboard?.write) {
          return { ok: false, error: "Буфер обмена недоступен в этом браузере" };
        }
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        return { ok: true };
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Не удалось скопировать в буфер";
        return { ok: false, error: msg };
      } finally {
        if (this.previewMode) {
          cam.stopFollow();
          cam.setZoom(1);
          cam.centerOn(Ww / 2, Hw / 2);
        } else {
          cam.setZoom(CAMERA_ZOOM_PLAY);
          cam.startFollow(this.player, true, 0.14, 0.14);
        }
        this.hintText.setVisible(hintWasVisible);
      }
    };

    this.booted = true;
    if (typeof window !== "undefined") {
      window.__NAGIBATOP_READY__ = true;
      window.__NAGIBATOP_HURT__ = (amt = 12) =>
        useGameStore.getState().takeDamage(Math.max(1, Math.floor(amt)));
      window.__NAGIBATOP_RESET_MOBS__ = () => {
        useGameStore.setState({ enemyRespawnNotBeforeMs: {} });
        window.location.reload();
      };
      window.__NAGIBATOP_SET_CARRY__ = (value: boolean) => {
        this.heroAnim.setCarrying(!!value);
      };
    }
  }

  private rewardXp(amount: number): void {
    if (typeof window === "undefined") return;
    const r = useGameStore.getState().grantXp(amount);
    if (r.leveled) {
      this.playSfx(FANTASY_SFX.levelUp);
      const lv = useGameStore.getState().character.level;
      window.dispatchEvent(
        new CustomEvent("nagibatop-toast", {
          detail: { message: `Новый уровень: ${lv}!` },
        })
      );
    }
  }

  private computeMeleeHit(
    px: number,
    py: number,
    ex: number,
    ey: number
  ): boolean {
    const feetDist = Phaser.Math.Distance.Between(px, py, ex, ey);
    if (feetDist <= 40) return true;

    const reach = PLAYER_ATTACK_LEAD_PX;
    let ox = 0;
    let oy = 0;
    const face = this.heroAnim.getFacing();
    if (face === "side") {
      ox = this.player.flipX ? -reach : reach;
    } else if (face === "up") {
      oy = -reach;
    } else {
      oy = reach;
    }
    const hx = px + ox;
    const hy = py + oy;
    return (
      Phaser.Math.Distance.Between(hx, hy, ex, ey) <= PLAYER_ATTACK_HIT_RADIUS
    );
  }

  private spawnDamageNumber(
    x: number,
    y: number,
    value: number,
    color: string
  ): void {
    const t = this.add.text(x, y, String(value), {
      fontFamily: "monospace",
      fontSize: "13px",
      color,
      stroke: "#1c1917",
      strokeThickness: 3,
    });
    t.setOrigin(0.5, 1);
    t.setDepth(100002);
    this.tweens.add({
      targets: t,
      y: y - 44,
      alpha: 0,
      duration: 640,
      ease: "Quad.easeOut",
      onComplete: () => t.destroy(),
    });
  }

  private spawnDroppedPickup(
    curatedId: string,
    qty: number,
    x: number,
    y: number
  ): void {
    if (!ITEM_ATLAS.available || !this.textures.exists(ITEM_ATLAS.textureKey)) {
      return;
    }
    const cdef = getCuratedItem(curatedId);
    if (!cdef) return;
    const id = `drop_${curatedId}_${Math.floor(x)}_${Date.now()}`;
    const spr = this.add
      .image(x, y, ITEM_ATLAS.textureKey, cdef.atlasFrame)
      .setOrigin(0.5, 1);
    spr.setDepth(y + 0.5);
    this.pickups.push({ id, sprite: spr, curatedId, qty });
  }

  private playSfx(id: FantasySfxId, volume = 1): void {
    if (this.previewMode) return;
    if (!this.cache.audio.exists(id)) return;
    this.sound.play(id, { volume: Math.min(1, Math.max(0, volume)) });
  }

  /** Шаги по WAV из `Footsteps/Dirt` (Walk / Run). Интервал от скорости (px/с). */
  private tickFootsteps(
    moving: boolean,
    sprintingMove: boolean,
    chopping: boolean
  ): void {
    if (chopping || !moving || !this.player?.body) {
      this.footstepDistanceCarry = 0;
      return;
    }
    const b = this.player.body as Phaser.Physics.Arcade.Body;
    const speed = Math.hypot(b.velocity.x, b.velocity.y);
    if (speed < 6) {
      this.footstepDistanceCarry = 0;
      return;
    }
    const dist = Math.hypot(b.deltaX(), b.deltaY());
    if (dist < 0.02) return;

    const targetHz = sprintingMove ? 2.82 : 1.95;
    const minStride = sprintingMove ? 50 : 46;
    const maxStride = 108;
    const stepPx = Phaser.Math.Clamp(speed / targetHz, minStride, maxStride);

    this.footstepDistanceCarry += dist;
    const footMul = useUiSettingsStore.getState().footstepVolume;
    while (this.footstepDistanceCarry >= stepPx) {
      this.footstepDistanceCarry -= stepPx;
      const id = sprintingMove
        ? pickRandomFootstepRunSfxId(Math.random)
        : pickRandomFootstepWalkSfxId(Math.random);
      if (footMul > 0) {
        this.playSfx(id, Math.min(1, 0.38 * footMul));
      }
    }
  }

  private heroAttackStyleFromWeapon(): HeroAttackStyle {
    const wid = useGameStore.getState().equipped.weapon;
    if (wid === "spear_short" || wid === "bow_small") return "pierce";
    if (wid === "mace") {
      return "crush";
    }
    return "slice";
  }

  private tryPlayerMeleeAttack(
    time: number,
    px: number,
    py: number,
    moveVx: number,
    moveVy: number
  ): void {
    const wantMelee = this.pointerAttackQueued;
    this.pointerAttackQueued = false;

    if (!wantMelee) return;

    const st = useGameStore.getState();
    const atkCd = Math.max(
      1,
      Math.floor(
        getPlayerAttackCooldownMs(st.character.attrs) *
          buffNumericProduct(st.character.buffs, "attackCooldownMult")
      )
    );
    if (time - this.lastPlayerAttackTime < atkCd) return;

    const cam = this.cameras.main;
    const ptr = this.input.activePointer;
    const aim = cam.getWorldPoint(ptr.x, ptr.y);
    this.heroAnim.setMeleeFacingFromAim(
      aim.x - px,
      aim.y - py,
      moveVx,
      moveVy
    );

    this.heroAnim.setAttackStyle(this.heroAttackStyleFromWeapon());
    const playedMelee = this.heroAnim.tryPlayMeleeAttack();
    if (!playedMelee) return;

    this.lastPlayerAttackTime = time;
    this.playSfx(FANTASY_SFX.meleeSwing);

    this.cameras.main.shake(44, 0.002);
    const origin =
      st.isekaiOrigin?.completed === true ? st.isekaiOrigin.bonus : undefined;
    const derived = getDerivedCombatStats(
      st.character.level,
      st.equipped,
      origin,
      st.character.attrs
    );
    const atkOut =
      derived.atk * buffNumericProduct(st.character.buffs, "atkMult");

    let hitAny = false;
    let playedMeleeHit = false;
    for (const e of this.enemies) {
      if (e.state === "dead") continue;
      if (!this.computeMeleeHit(px, py, e.x, e.y)) continue;

      hitAny = true;
      if (!playedMeleeHit) {
        this.playSfx(FANTASY_SFX.meleeHit);
        playedMeleeHit = true;
      }
      const dmg = damagePlayerDealsToEnemy(atkOut, e.armor);
      const dead = e.applyDamage(dmg);
      this.spawnDamageNumber(e.x, e.y - 26, dmg, "#fdba74");

      if (dead) {
        this.playSfx(FANTASY_SFX.enemyDeath);
        e.markDead();
        useGameStore.getState().recordEnemyKill({
          mobVisualId: e.mobVisualId,
          instanceId: e.instanceId,
        });
        if (e.instanceId === DUNGEON_BOSS_INSTANCE_ID) {
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("nagibatop:enemy-defeated", {
                detail: { enemyId: e.instanceId },
              })
            );
          }
        }
        if (e.instanceId !== DUNGEON_BOSS_INSTANCE_ID) {
          if (this.currentLocationId === "forest") {
            const base = getEnemyRespawnDelayMs(e.mobVisualId);
            const delayMs = Math.round(
              base * forestRespawnDelayMultiplier(e.spawnX, e.spawnY)
            );
            useGameStore
              .getState()
              .scheduleEnemyRespawn(e.instanceId, e.mobVisualId, { delayMs });
          } else {
            useGameStore
              .getState()
              .scheduleEnemyRespawn(e.instanceId, e.mobVisualId);
          }
        } else {
          useGameStore
            .getState()
            .clearEnemyRespawnAfterSpawn(DUNGEON_BOSS_INSTANCE_ID);
        }
        if (
          this.currentLocationId === "dungeon" &&
          e.instanceId === DUNGEON_BOSS_INSTANCE_ID
        ) {
          const F = useGameStore.getState().dungeonCurrentFloor;
          if (useGameStore.getState().registerDungeonBossCleared(F)) {
            window.dispatchEvent(
              new CustomEvent("nagibatop-toast", {
                detail: {
                  message: `Этаж ${F} зачищен! Доступен следующий этаж.`,
                },
              })
            );
          }
        }
        this.rewardXp(xpEnemyKillForPlayer(e.level, st.character.level));
        const goldAmt = rollEnemyGold(e.lootTableId);
        if (goldAmt > 0) {
          const gMult = buffNumericProduct(
            st.character.buffs,
            "goldGainMult"
          );
          useGameStore.getState().addGold(Math.floor(goldAmt * gMult));
          window.dispatchEvent(
            new CustomEvent("nagibatop-toast", {
              detail: { message: `+${goldAmt} золота` },
            })
          );
        }
        const loot = rollEnemyLoot(e.lootTableId);
        if (loot) {
          const res = useGameStore.getState().tryAddItem(
            loot.curatedId,
            loot.qty
          );
          const name = getCuratedItem(loot.curatedId)?.name ?? loot.curatedId;
          if (res.ok) {
            window.dispatchEvent(
              new CustomEvent("nagibatop-toast", {
                detail: { message: `Добыча: ${name} ×${loot.qty}` },
              })
            );
          } else {
            this.spawnDroppedPickup(loot.curatedId, loot.qty, e.x, e.y);
            window.dispatchEvent(
              new CustomEvent("nagibatop-toast", {
                detail: {
                  message: `${res.reason ?? "Нет места"} — лут у трупа.`,
                },
              })
            );
          }
        }
      } else {
        e.setTint(0xff8888);
        this.time.delayedCall(90, () => {
          if (e.active && e.state !== "dead") e.clearTint();
        });
      }
    }

    if (hitAny) {
      this.cameras.main.shake(115, 0.0045);
    }
  }

  private inputBlocked(): boolean {
    return this.dialogueOpen || this.modalBlocked || this.locationTransition;
  }

  update(time: number, delta: number): void {
    if (!this.booted || !this.player?.body) return;
    applyPixelCrawlerFeetHitbox(this.player);

    if (
      !this.previewMode &&
      this.currentLocationId === "forest" &&
      time - this.lastForestStumpExpireCheckMs >= 500
    ) {
      this.lastForestStumpExpireCheckMs = time;
      this.pruneExpiredForestStumps(Date.now());
    }

    const heroCfg = this.manifest.hero;
    if (!heroCfg) return;

    if (
      !this.previewMode &&
      !this.locationTransition &&
      time - this.lastEnemyRespawnCheckMs >= ENEMY_RESPAWN_CHECK_INTERVAL_MS
    ) {
      this.lastEnemyRespawnCheckMs = time;
      this.tickEnemyRespawns();
      this.tickDungeonSpawner(time);
    }

    const stHp = useGameStore.getState();
    const hp = stHp.character.hp;
    const prevHp = this.lastHp;

    if (typeof window !== "undefined" && !this.previewMode && hp <= 0) {
      if (!this.heroAnim.isDeathSequence()) {
        this.heroAnim.startDeath(() => {
          useGameStore.getState().respawnAfterDeath();
        });
      }
      this.player.setVelocity(0, 0);
      this.player.setDepth(this.player.y);
      this.lastHp = useGameStore.getState().character.hp;
      this.footstepDistanceCarry = 0;
      return;
    }

    if (
      typeof window !== "undefined" &&
      !this.previewMode &&
      hp < prevHp &&
      hp > 0
    ) {
      this.playSfx(FANTASY_SFX.playerHurt);
      this.heroAnim.tryPlayHit();
    }

    if (this.inputBlocked()) {
      this.footstepDistanceCarry = 0;
      if (this.player?.body) {
        this.player.setVelocity(0, 0);
        this.heroAnim.forceIdle();
      }
      this.hintText.setVisible(false);
      this.lastHp = useGameStore.getState().character.hp;
      return;
    }

    const speed = PLAYER_ARCADE_MOVE_SPEED;
    const stMove = useGameStore.getState();
    const originMove =
      stMove.isekaiOrigin?.completed === true
        ? stMove.isekaiOrigin.bonus
        : undefined;
    const moveMult = getMoveSpeedMultiplier(
      stMove.character.level,
      stMove.equipped,
      stMove.character.buffs,
      originMove,
      stMove.character.attrs
    );

    let vx = 0;
    let vy = 0;

    if (!this.gatherChannel) {
      if (this.cursors.left?.isDown || this.keyA.isDown) vx -= 1;
      if (this.cursors.right?.isDown || this.keyD.isDown) vx += 1;
      if (this.cursors.up?.isDown || this.keyW.isDown) vy -= 1;
      if (this.cursors.down?.isDown || this.keyS.isDown) vy += 1;
    }

    if (vx !== 0 && vy !== 0) {
      vx *= 0.70710678;
      vy *= 0.70710678;
    }

    if (this.gatherChannel) {
      if (Phaser.Input.Keyboard.JustDown(this.keyEsc)) {
        this.cancelForestGather();
      } else {
        this.tickForestGather(delta);
      }
    }

    const chopping = !!this.gatherChannel;
    const moving = !chopping && (vx !== 0 || vy !== 0);
    const shiftHeld = this.keyShiftSprint.isDown;
    const nowMs =
      typeof performance !== "undefined"
        ? performance.now()
        : Date.now();
    const windedUntil = stMove.staWindedUntilMs ?? 0;
    const isStaWinded = windedUntil > 0 && nowMs < windedUntil;
    const canSprintSta = stMove.character.sta > 0;
    const sprintingMove =
      moving && shiftHeld && canSprintSta && !isStaWinded;
    /** По умолчанию спокойный шаг; Shift — быстрый бег (тратит стамину в tickVitality). */
    const gaitMult = sprintingMove ? PLAYER_SPRINT_GAIT_MULT : PLAYER_WALK_GAIT_MULT;
    const windedSpeedMult = isStaWinded ? STA_WINDED_MOVE_SPEED_MULT : 1;

    if (chopping) {
      this.player.setVelocity(0, 0);
    } else {
      this.player.setVelocity(
        vx * speed * moveMult * gaitMult * windedSpeedMult,
        vy * speed * moveMult * gaitMult * windedSpeedMult
      );
    }

    this.tickFootsteps(moving, sprintingMove, chopping);

    this.heroAnim.updateLocomotion({
      moving,
      vx: chopping ? 0 : vx,
      vy: chopping ? 0 : vy,
      sprintingMove: chopping ? false : sprintingMove,
    });

    this.player.setDepth(this.player.y);

    if (typeof window !== "undefined" && !this.previewMode) {
      useGameStore.getState().tickVitality(delta, moving, sprintingMove);
    }

    this.lastHp = useGameStore.getState().character.hp;

    if (
      typeof window !== "undefined" &&
      !this.previewMode &&
      time - this.lastPosPersist >= 200
    ) {
      this.lastPosPersist = time;
      useGameStore.getState().setPlayerPosition(this.player.x, this.player.y);
    }

    if (
      typeof window !== "undefined" &&
      !this.previewMode &&
      this.currentLocationId === "dungeon" &&
      this.player &&
      time - this.lastDungeonMapRevealAt >= 175
    ) {
      this.lastDungeonMapRevealAt = time;
      const stMap = useGameStore.getState();
      stMap.revealDungeonMapAtWorld(
        stMap.dungeonCurrentFloor,
        this.player.x,
        this.player.y
      );
    }

    if (
      typeof window !== "undefined" &&
      !this.previewMode &&
      this.currentLocationId === "forest" &&
      this.player &&
      this.forestChunkMgr &&
      time - this.lastForestMapRevealAt >= 175
    ) {
      this.lastForestMapRevealAt = time;
      useGameStore
        .getState()
        .revealForestMapAtWorld(this.player.x, this.player.y);
    }

    if (
      this.currentLocationId === "forest" &&
      this.player &&
      this.forestChunkMgr
    ) {
      this.forestChunkMgr.sync(this.player.x, this.player.y);
      this.pruneForestTreeRegistry();
      this.pruneForestRockRegistry();
      if (!this.previewMode) {
        this.syncForestWildEncounters();
      }
      const b = this.forestChunkMgr.computeWorldBounds();
      const key = `${b.minX},${b.minY},${b.maxX},${b.maxY}`;
      if (key !== this.lastForestBoundsKey) {
        this.lastForestBoundsKey = key;
        this.applyForestWorldBounds();
      }
    }

    for (const n of this.npcs) {
      n.updatePatrol(time);
      n.setDepth(n.y);
    }

    if (!this.previewMode) {
      if (!this.inputBlocked() && !this.gatherChannel) {
        this.tryPlayerMeleeAttack(time, this.player.x, this.player.y, vx, vy);

        const stCombat = useGameStore.getState();
        const originCombat =
          stCombat.isekaiOrigin?.completed === true
            ? stCombat.isekaiOrigin.bonus
            : undefined;
        const derivedCombat = getDerivedCombatStats(
          stCombat.character.level,
          stCombat.equipped,
          originCombat,
          stCombat.character.attrs
        );

        for (const e of this.enemies) {
          if (e.state === "dead") continue;
          e.updateAi(time, {
            playerX: this.player.x,
            playerY: this.player.y,
            onStrikePlayer: (rawAtk) => {
              if (time < this.postRespawnInvulUntil) return;
              if (
                rollPlayerEvadesMobHit(
                  stCombat.character.attrs.agi,
                  e.level,
                  Math.random,
                  buffNumericProduct(stCombat.character.buffs, "evadeMult")
                )
              ) {
                const missLabel = this.add
                  .text(this.player.x, this.player.y - 52, "MISS", {
                    fontFamily: "monospace",
                    fontSize: "13px",
                    color: "#94a3b8",
                  })
                  .setOrigin(0.5, 0.5)
                  .setDepth(9999);
                this.time.delayedCall(420, () => {
                  missLabel.destroy();
                });
                return;
              }
              const amt = damageEnemyDealsToPlayer(
                rawAtk,
                derivedCombat.def *
                  buffNumericProduct(stCombat.character.buffs, "defMult")
              );
              useGameStore.getState().takeDamage(amt);
              this.player.setTint(0xff5555);
              this.time.delayedCall(110, () => {
                if (this.player.active) this.player.clearTint();
              });
              this.spawnDamageNumber(
                this.player.x,
                this.player.y - 36,
                amt,
                "#fca5a5"
              );
              this.cameras.main.shake(210, 0.006);
            },
          });
        }
      }

      for (const e of this.enemies) {
        e.setDepth(e.y);
        e.layoutHpBar();
      }
    }

    if (this.previewMode) {
      this.hintText.setVisible(false);
      return;
    }

    const px = this.player.x;
    const py = this.player.y;

    const nearNpc = this.npcs.find(
      (n) =>
        Phaser.Math.Distance.Between(px, py, n.x, n.y) < INTERACT_RADIUS_NPC
    );

    const chestPool = getChestsForLocation(this.locationDef);
    const nearChest = chestPool.find(
      (c) =>
        Phaser.Math.Distance.Between(px, py, c.x, c.y) < CHEST_RADIUS
    );

    const nearStation = this.craftStationsResolved.find(
      (s) =>
        Phaser.Math.Distance.Between(px, py, s.x, s.y) < STATION_RADIUS
    );

    const activePickups = this.pickups.filter((p) => p.sprite.active);
    const nearPickup = activePickups.find(
      (p) =>
        Phaser.Math.Distance.Between(
          px,
          py,
          p.sprite.x,
          p.sprite.y
        ) < PICKUP_RADIUS
    );

    const nearExit = this.locationDef.exits.find((ex) =>
      pointInExitZone(px, py, ex, 0)
    );

    const stTree = useGameStore.getState();
    const nearForestTreeChop =
      !this.gatherChannel &&
      this.currentLocationId === "forest" &&
      playerHasInstrumentRole(
        stTree.inventorySlots,
        stTree.equipped,
        TAG_AXE
      )
        ? this.findNearestForestTree(px, py)
        : null;

    const nearForestRockMine =
      !this.gatherChannel &&
      this.currentLocationId === "forest" &&
      playerHasInstrumentRole(
        stTree.inventorySlots,
        stTree.equipped,
        TAG_PICKAXE
      )
        ? this.findNearestForestRock(px, py)
        : null;

    const forestGatherTarget =
      nearForestTreeChop && nearForestRockMine
        ? Phaser.Math.Distance.Between(
              px,
              py,
              nearForestTreeChop.img.x,
              nearForestTreeChop.img.y
            ) <=
            Phaser.Math.Distance.Between(
              px,
              py,
              nearForestRockMine.img.x,
              nearForestRockMine.img.y
            )
          ? ({ kind: "tree" as const, entry: nearForestTreeChop })
          : ({ kind: "rock" as const, entry: nearForestRockMine })
        : nearForestTreeChop
          ? ({ kind: "tree" as const, entry: nearForestTreeChop })
          : nearForestRockMine
            ? ({ kind: "rock" as const, entry: nearForestRockMine })
            : null;

    const nearPond = this.playerNearPond(px, py);

    let hintX = px;
    let hintY = py - 36;
    let hintMsg = "";

    if (!this.gatherChannel) {
    if (nearNpc) {
      hintMsg = "[ E ] Поговорить";
      hintX = nearNpc.x;
      hintY = nearNpc.y - 36;
    } else if (nearChest) {
      hintMsg =
        isDungeonBossChestId(nearChest.id) &&
        this.isDungeonBossChestBlocked()
          ? "Сначала одолейте стража"
          : "[ E ] Открыть сундук";
      hintX = nearChest.x;
      hintY = nearChest.y - 36;
    } else if (nearStation) {
      hintMsg = `[ E ] ${nearStation.label}`;
      hintX = nearStation.x;
      hintY = nearStation.y - 36;
    } else if (nearPickup) {
      hintMsg = "[ E ] Подобрать";
      hintX = nearPickup.sprite.x;
      hintY = nearPickup.sprite.y - 36;
    } else if (forestGatherTarget) {
      hintMsg =
        forestGatherTarget.kind === "tree" ? "[ E ] Рубить" : "[ E ] Добыть";
      hintX = forestGatherTarget.entry.img.x;
      hintY = forestGatherTarget.entry.img.y - 36;
    } else if (nearPond) {
      hintMsg = "[ E ] Рыбалка";
      hintX = 1060;
      hintY = 660;
    } else if (nearExit) {
      hintMsg = `[ E ] ${nearExit.label ?? "Перейти"}`;
      hintX = px;
      hintY = py - 36;
    }
    }

    if (hintMsg) {
      this.hintText.setText(hintMsg);
      this.hintText.setVisible(true);
      this.hintText.setPosition(hintX, hintY);
    } else {
      this.hintText.setVisible(false);
    }

    this.tickNpcProximityBarks(time, nearNpc);

    if (!Phaser.Input.Keyboard.JustDown(this.keyE)) return;

    if (this.gatherChannel) {
      return;
    }

    if (nearNpc) {
      nearNpc.beginTalk();
      const scripted =
        this.npcDialogueScriptsById[nearNpc.npcId]?.openers ?? [];
      window.dispatchEvent(
        new CustomEvent("npc-interact-open", {
          detail: {
            npcId: nearNpc.npcId,
            displayName: nearNpc.displayName ?? nearNpc.npcId,
            ...(scripted.length > 0 ? { scriptedOpeners: scripted } : {}),
          },
        })
      );
      return;
    }

    if (nearChest) {
      if (
        isDungeonBossChestId(nearChest.id) &&
        this.isDungeonBossChestBlocked()
      ) {
        window.dispatchEvent(
          new CustomEvent("nagibatop-toast", {
            detail: { message: "Сундук сияет магией — сначала одолейте стража." },
          })
        );
        return;
      }

      this.heroAnim.tryPlayInteract("collect");
      this.playSfx(FANTASY_SFX.chestOpen);
      window.dispatchEvent(
        new CustomEvent("nagibatop-chest-open", {
          detail: {
            chestId: nearChest.id,
            chestX: nearChest.x,
            chestY: nearChest.y,
          },
        })
      );
      return;
    }

    if (nearStation) {
      window.dispatchEvent(
        new CustomEvent("nagibatop-craft-open", {
          detail: {
            stationId: nearStation.id,
            label: nearStation.label,
          },
        })
      );
      return;
    }

    if (nearPickup) {
      const res = useGameStore.getState().tryAddItem(
        nearPickup.curatedId,
        nearPickup.qty
      );
      if (res.ok) {
        if (WORLD_PICKUPS.some((w) => w.id === nearPickup.id)) {
          useGameStore.getState().markWorldPickupTaken(nearPickup.id);
        }
        this.heroAnim.tryPlayInteract("collect");
        this.playSfx(FANTASY_SFX.pickup);
        this.rewardXp(XP_WORLD_PICKUP);
        nearPickup.sprite.destroy();
        this.pickups = this.pickups.filter((x) => x.id !== nearPickup.id);
        window.dispatchEvent(
          new CustomEvent("nagibatop-toast", {
            detail: {
              message: `Подобрано: ${getCuratedItem(nearPickup.curatedId)?.name ?? nearPickup.curatedId} ×${nearPickup.qty}`,
            },
          })
        );
      } else {
        window.dispatchEvent(
          new CustomEvent("nagibatop-toast", {
            detail: { message: res.reason ?? "Инвентарь полон" },
          })
        );
      }
      return;
    }

    if (forestGatherTarget) {
      this.startForestGather(
        forestGatherTarget.kind,
        forestGatherTarget.entry
      );
      return;
    }

    if (nearPond) {
      this.heroAnim.tryPlayInteract("fishing");
      window.dispatchEvent(
        new CustomEvent("nagibatop-toast", {
          detail: { message: "Рыбалка: заброс удочки (пока без добычи)." },
        })
      );
      return;
    }

    if (nearExit) {
      const openDungeonFloorPicker =
        nearExit.targetLocationId === "dungeon" &&
        (this.currentLocationId === "town" ||
          this.currentLocationId === "dungeon");
      if (openDungeonFloorPicker) {
        window.dispatchEvent(
          new CustomEvent("nagibatop-dungeon-pick-request", {
            detail: { spawnId: nearExit.targetSpawnId },
          })
        );
      } else {
        this.gotoLocation(nearExit.targetLocationId, nearExit.targetSpawnId);
      }
    }
  }

  private pruneForestTreeRegistry(): void {
    this.forestTrees = this.forestTrees.filter((t) => t.img.active);
  }

  private pruneForestRockRegistry(): void {
    this.forestRocks = this.forestRocks.filter((r) => r.img.active);
  }

  private findNearestForestTree(
    px: number,
    py: number
  ): {
    img: Phaser.GameObjects.Image;
    collider: Phaser.GameObjects.Rectangle;
    key: string;
  } | null {
    let best: {
      img: Phaser.GameObjects.Image;
      collider: Phaser.GameObjects.Rectangle;
      key: string;
    } | null = null;
    let bestD = Infinity;
    for (const t of this.forestTrees) {
      if (!t.img.active) continue;
      const d = Phaser.Math.Distance.Between(px, py, t.img.x, t.img.y);
      if (d <= TREE_CHOP_RADIUS && d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private findNearestForestRock(
    px: number,
    py: number
  ): {
    img: Phaser.GameObjects.Image;
    collider: Phaser.GameObjects.Rectangle;
    key: string;
  } | null {
    let best: {
      img: Phaser.GameObjects.Image;
      collider: Phaser.GameObjects.Rectangle;
      key: string;
    } | null = null;
    let bestD = Infinity;
    for (const r of this.forestRocks) {
      if (!r.img.active) continue;
      const d = Phaser.Math.Distance.Between(px, py, r.img.x, r.img.y);
      if (d <= TREE_CHOP_RADIUS && d < bestD) {
        bestD = d;
        best = r;
      }
    }
    return best;
  }

  private redrawGatherProgress(
    t01: number,
    kind: "tree" | "rock"
  ): void {
    if (!this.gatherProgressGfx || !this.player) return;
    const w = 56;
    const h = 5;
    const x = this.player.x - w * 0.5;
    const y = this.player.y + 12;
    this.gatherProgressGfx.setDepth(this.player.y + 3);
    const g = this.gatherProgressGfx;
    g.clear();
    g.fillStyle(0x0f172a, 0.88);
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle(0x1e293b, 0.95);
    g.fillRect(x, y, w, h);
    const fill = kind === "tree" ? 0x22c55e : 0x64748b;
    g.fillStyle(fill, 1);
    g.fillRect(x, y, w * Math.max(0, Math.min(1, t01)), h);
  }

  private cancelForestGather(): void {
    for (const ev of this.gatherStrikeTimers) {
      ev.remove(false);
    }
    this.gatherStrikeTimers = [];
    const ch = this.gatherChannel;
    if (ch?.img.active) {
      this.tweens.killTweensOf(ch.img);
      ch.img.setPosition(ch.anchorX, ch.anchorY);
      ch.img.setAngle(0);
    }
    this.gatherChannel = null;
    this.gatherProgressGfx?.clear();
    this.heroAnim?.forceIdle();
  }

  private startForestGather(
    kind: "tree" | "rock",
    entry: {
      img: Phaser.GameObjects.Image;
      collider: Phaser.GameObjects.Rectangle;
      key: string;
    }
  ): void {
    if (this.gatherChannel) return;
    this.gatherChannel = {
      kind,
      key: entry.key,
      img: entry.img,
      collider: entry.collider,
      anchorX: entry.img.x,
      anchorY: entry.img.y,
      elapsedMs: 0,
    };
    if (!this.gatherProgressGfx) {
      this.gatherProgressGfx = this.add.graphics();
    }
    this.redrawGatherProgress(0, kind);
    this.gatherStrikeTimers = [];
    this.doForestGatherStrike();
    const spacing = CHOP_TREE_STRIKE_SPACING_MS;
    for (let i = 1; i < CHOP_TREE_STRIKE_COUNT; i++) {
      const ev = this.time.delayedCall(spacing * i, () => {
        if (!this.gatherChannel) return;
        this.doForestGatherStrike();
      });
      this.gatherStrikeTimers.push(ev);
    }
  }

  /** Один удар за канал: дерево — slice + топор; камень — crush + кирка. */
  private doForestGatherStrike(): void {
    if (!this.gatherChannel || !this.heroAnim) return;
    const ch = this.gatherChannel;
    this.heroAnim.forceIdle();
    if (ch.kind === "tree") {
      this.heroAnim.setAttackStyle("slice");
    } else {
      this.heroAnim.setAttackStyle("crush");
    }
    this.heroAnim.setMeleeFacingFromAim(
      ch.anchorX - this.player.x,
      ch.anchorY - this.player.y,
      0,
      1
    );
    const played = this.heroAnim.tryPlayMeleeAttack();
    if (ch.kind === "tree") {
      this.playSfx(pickRandomWoodChopSfxId(Math.random));
    } else {
      this.playSfx(pickRandomMineSfxId(Math.random));
    }
    if (played) {
      this.heroAnim.scheduleMeleeImpactOnce(() =>
        this.applyForestPropGatherShake()
      );
    }
  }

  /** Короткая тряска объекта в момент удара. */
  private applyForestPropGatherShake(): void {
    const ch = this.gatherChannel;
    if (!ch?.img.active) return;
    const { img, anchorX, anchorY } = ch;
    this.tweens.killTweensOf(img);
    img.setPosition(anchorX, anchorY);
    img.setAngle(0);
    const dx = Phaser.Math.Between(-3, 3);
    const dy = Phaser.Math.Between(-2, 0);
    const da = Phaser.Math.FloatBetween(-2.5, 2.5);
    this.tweens.add({
      targets: img,
      x: anchorX + dx,
      y: anchorY + dy,
      angle: da,
      duration: 22,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        if (img.active && this.gatherChannel?.img === img) {
          img.setPosition(anchorX, anchorY);
          img.setAngle(0);
        }
      },
    });
  }

  private tickForestGather(delta: number): void {
    const ch = this.gatherChannel;
    if (!ch) return;
    const d = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      ch.anchorX,
      ch.anchorY
    );
    if (d > TREE_CHOP_RADIUS * 1.12) {
      const msg =
        ch.kind === "tree"
          ? "Слишком далеко от дерева."
          : "Слишком далеко от камня.";
      this.cancelForestGather();
      window.dispatchEvent(
        new CustomEvent("nagibatop-toast", {
          detail: { message: msg },
        })
      );
      return;
    }
    ch.elapsedMs += delta;
    const t = Math.min(1, ch.elapsedMs / CHOP_TREE_CHANNEL_MS);
    this.redrawGatherProgress(t, ch.kind);
    if (ch.elapsedMs >= CHOP_TREE_CHANNEL_MS) {
      this.finishForestGather();
    }
  }

  private finishForestGather(): void {
    const ch = this.gatherChannel;
    if (!ch) return;
    for (const ev of this.gatherStrikeTimers) {
      ev.remove(false);
    }
    this.gatherStrikeTimers = [];
    this.gatherProgressGfx?.clear();
    this.gatherChannel = null;

    if (ch.kind === "tree") {
      this.finishForestTreeGather(ch);
    } else {
      this.finishForestRockGather(ch);
    }
  }

  private finishForestTreeGather(
    ch: {
      key: string;
      img: Phaser.GameObjects.Image;
      collider: Phaser.GameObjects.Rectangle;
      anchorX: number;
      anchorY: number;
    }
  ): void {
    const { key, img, collider, anchorX, anchorY } = ch;
    const fullTexKey = img.texture.key;
    this.tweens.killTweensOf(img);
    img.setPosition(anchorX, anchorY);
    img.setAngle(0);

    useGameStore.getState().markForestTreeStump(
      key,
      Date.now() + FOREST_TREE_STUMP_VISIBLE_MS
    );
    const lumberingLevel =
      useGameStore.getState().professions.lumbering.level;
    useGameStore.getState().grantProfessionXp(
      "lumbering",
      XP_PROFESSION_LUMBER_PER_TREE
    );
    const qty = rollWoodDropQty(Math.random, lumberingLevel);
    const res = useGameStore.getState().tryAddItem(
      WOOD_MATERIAL_CURATED_ID,
      qty
    );
    if (res.ok) {
      window.dispatchEvent(
        new CustomEvent("nagibatop-toast", {
          detail: {
            message: `Получено: ${getCuratedItem(WOOD_MATERIAL_CURATED_ID)?.name ?? "Древесина"} ×${qty}`,
          },
        })
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("nagibatop-toast", {
          detail: { message: res.reason ?? "Рюкзак полон" },
        })
      );
    }

    this.obstacles.remove(collider, true, true);
    this.forestTrees = this.forestTrees.filter((t) => t.key !== key);
    this.heroAnim?.forceIdle();

    const stumpTex = forestStumpTextureKey(fullTexKey);
    if (this.textures.exists(stumpTex)) {
      img.setTexture(stumpTex);
      img.setAlpha(1);
      this.registerForestStumpSprite(key, img);
    } else if (img.active) {
      img.destroy();
    }
  }

  private finishForestRockGather(
    ch: {
      key: string;
      img: Phaser.GameObjects.Image;
      collider: Phaser.GameObjects.Rectangle;
      anchorX: number;
      anchorY: number;
    }
  ): void {
    const { key, img, collider, anchorX, anchorY } = ch;
    this.tweens.killTweensOf(img);
    img.setPosition(anchorX, anchorY);
    img.setAngle(0);

    useGameStore.getState().markForestRockMined(key);
    const miningLevel = useGameStore.getState().professions.mining.level;
    useGameStore.getState().grantProfessionXp(
      "mining",
      XP_PROFESSION_MINING_PER_ROCK
    );
    const qty = rollStoneDropQty(Math.random, miningLevel);
    const res = useGameStore.getState().tryAddItem(
      STONE_MATERIAL_CURATED_ID,
      qty
    );
    if (res.ok) {
      window.dispatchEvent(
        new CustomEvent("nagibatop-toast", {
          detail: {
            message: `Получено: ${getCuratedItem(STONE_MATERIAL_CURATED_ID)?.name ?? "Камень"} ×${qty}`,
          },
        })
      );
    } else {
      window.dispatchEvent(
        new CustomEvent("nagibatop-toast", {
          detail: { message: res.reason ?? "Рюкзак полон" },
        })
      );
    }

    this.obstacles.remove(collider, true, true);
    this.forestRocks = this.forestRocks.filter((r) => r.key !== key);
    this.heroAnim?.forceIdle();
    if (img.active) {
      img.destroy();
    }
  }

  private registerForestStumpSprite(
    treeKey: string,
    img: Phaser.GameObjects.Image
  ): void {
    this.forestStumpSprites.set(treeKey, img);
    img.once("destroy", () => {
      if (this.forestStumpSprites.get(treeKey) === img) {
        this.forestStumpSprites.delete(treeKey);
      }
    });
  }

  private pruneExpiredForestStumps(nowMs: number): void {
    const keys = useGameStore.getState().expireForestStumpsBefore(nowMs);
    if (!keys.length) return;
    for (const k of keys) {
      const img = this.forestStumpSprites.get(k);
      this.forestStumpSprites.delete(k);
      if (img?.active) {
        this.tweens.add({
          targets: img,
          alpha: 0,
          duration: 420,
          ease: "Quad.easeIn",
          onComplete: () => {
            if (img.active) img.destroy();
          },
        });
      }
    }
  }

  /** Зона у пруда (town): подсказка и E → клип Fishing_Base. */
  private playerNearPond(px: number, py: number): boolean {
    const pc = this.locationDef.pondCollider;
    if (!pc) return false;
    const padX = 52;
    const padY = 56;
    return (
      px >= pc.x - padX &&
      px <= pc.x + pc.w + padX &&
      py >= pc.y - padY &&
      py <= pc.y + pc.h + 24
    );
  }
}
