import type { Scene } from "phaser";
import type {
  AssetManifestLoadEntry,
  AssetManifestUnitEntry,
} from "@/src/game/types";

/**
 * Городские NPC: PNG из `/assets/characters/<папка>/` (экспорт v3: `states/<…>/`).
 */
const WALK_FRAMES = 6;
const IDLE_FRAMES = 4;

/** Игровой id → папка в `public/assets/characters/` (у Маркуса экспорт в `markus`). */
const CHARACTER_EXPORT_DIR: Record<"elena" | "marcus" | "igor", string> = {
  elena: "elena",
  marcus: "markus",
  igor: "igor",
};

/** Корень state внутри папки персонажа (как в `metadata.json`). */
const STATE_ROOT: Record<string, string> = {
  elena: "states/fantasy_village_headwoman_practical_woman_around_t",
  markus: "states/fantasy_village_watchman_sturdy_broad-shouldered_m",
  igor: "states/fantasy_village_gear_merchant_slim_agile_man_aroun",
};

const WALK_CLIP_FOLDER: Record<string, string> = {
  elena: "Walking-4f41dd5b",
  markus: "Walking-caaf13ec",
  igor: "Walking-9ce4090b",
};

const IDLE_CLIP_FOLDER: Record<string, string> = {
  elena: "Breathing_Idle-399c1beb",
  markus: "Breathing_Idle-d2b803f1",
  igor: "Breathing_Idle-e36757e5",
};

const WALK_DIRS = ["south", "north", "east"] as const;
type WalkDir = (typeof WALK_DIRS)[number];

const DIR_SUFFIX: Record<WalkDir, string> = {
  south: "s",
  north: "n",
  east: "e",
};

function charBase(npcId: "elena" | "marcus" | "igor"): string {
  const assetDir = CHARACTER_EXPORT_DIR[npcId];
  const root = STATE_ROOT[assetDir];
  return `/assets/characters/${assetDir}/${root}`;
}

export function getTownNpcFullSizeLoadEntries(): AssetManifestLoadEntry[] {
  const out: AssetManifestLoadEntry[] = [];
  for (const npcId of ["elena", "marcus", "igor"] as const) {
    const assetDir = CHARACTER_EXPORT_DIR[npcId];
    const walkFolder = WALK_CLIP_FOLDER[assetDir];
    const idleFolder = IDLE_CLIP_FOLDER[assetDir];
    const base = charBase(npcId);
    if (!walkFolder || !idleFolder) continue;

    out.push({
      type: "image",
      key: `npc_${npcId}_idle`,
      url: `${base}/rotations/south.png`,
    });

    for (const dir of WALK_DIRS) {
      const sfx = DIR_SUFFIX[dir];
      for (let i = 0; i < WALK_FRAMES; i++) {
        const idx = String(i).padStart(3, "0");
        out.push({
          type: "image",
          key: `npc_${npcId}_w${sfx}_${i}`,
          url: `${base}/animations/${walkFolder}/${dir}/frame_${idx}.png`,
        });
      }
    }

    for (const dir of WALK_DIRS) {
      const sfx = DIR_SUFFIX[dir];
      for (let i = 0; i < IDLE_FRAMES; i++) {
        const idx = String(i).padStart(3, "0");
        out.push({
          type: "image",
          key: `npc_${npcId}_i${sfx}_${i}`,
          url: `${base}/animations/${idleFolder}/${dir}/frame_${idx}.png`,
        });
      }
    }
  }
  return out;
}

export function getTownNpcUnitsOverride(): Record<string, AssetManifestUnitEntry> {
  return {
    elena: {
      idleAnim: "town-npc-elena-idle",
      idleNAnim: "town-npc-elena-idle-n",
      idleEAnim: "town-npc-elena-idle-e",
      runAnim: "town-npc-elena-walk-s",
      walkNAnim: "town-npc-elena-walk-n",
      walkEAnim: "town-npc-elena-walk-e",
    },
    marcus: {
      idleAnim: "town-npc-marcus-idle",
      idleNAnim: "town-npc-marcus-idle-n",
      idleEAnim: "town-npc-marcus-idle-e",
      runAnim: "town-npc-marcus-walk-s",
      walkNAnim: "town-npc-marcus-walk-n",
      walkEAnim: "town-npc-marcus-walk-e",
    },
    igor: {
      idleAnim: "town-npc-igor-idle",
      idleNAnim: "town-npc-igor-idle-n",
      idleEAnim: "town-npc-igor-idle-e",
      runAnim: "town-npc-igor-walk-s",
      walkNAnim: "town-npc-igor-walk-n",
      walkEAnim: "town-npc-igor-walk-e",
    },
  };
}

/** После загрузки текстур — клипы из отдельных PNG (каждый файл = один кадр). */
export function registerTownNpcFullSizeAnimations(scene: Scene): void {
  const npcIds = ["elena", "marcus", "igor"] as const;

  for (const npcId of npcIds) {
    for (const dir of WALK_DIRS) {
      const sfx = DIR_SUFFIX[dir];
      const animKey = `town-npc-${npcId}-walk-${sfx}`;
      if (scene.anims.exists(animKey)) continue;

      const frames = Array.from({ length: WALK_FRAMES }, (_, i) => ({
        key: `npc_${npcId}_w${sfx}_${i}`,
        frame: 0,
      }));

      scene.anims.create({
        key: animKey,
        frames,
        frameRate: 12,
        repeat: -1,
      });
    }

    const idleSouth = `town-npc-${npcId}-idle`;
    const idleNorth = `town-npc-${npcId}-idle-n`;
    const idleEast = `town-npc-${npcId}-idle-e`;

    for (const { key, sfx } of [
      { key: idleSouth, sfx: "s" as const },
      { key: idleNorth, sfx: "n" as const },
      { key: idleEast, sfx: "e" as const },
    ]) {
      if (scene.anims.exists(key)) continue;
      const frames = Array.from({ length: IDLE_FRAMES }, (_, i) => ({
        key: `npc_${npcId}_i${sfx}_${i}`,
        frame: 0,
      }));
      scene.anims.create({
        key,
        frames,
        frameRate: 6,
        repeat: -1,
      });
    }
  }
}
