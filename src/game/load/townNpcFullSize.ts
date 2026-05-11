import type { Scene } from "phaser";
import type {
  AssetManifestLoadEntry,
  AssetManifestUnitEntry,
} from "@/src/game/types";

/**
 * Городские NPC: исходные PNG из `/assets/characters/<папка экспорта>/` (экспорт редактора),
 * без даунскейла до 43×43 из gen-assets. Папка может отличаться от игрового id (см. CHARACTER_EXPORT_DIR).
 */
const WALK_FRAMES = 8;

/** Игровой id → папка в `public/assets/characters/` (у Маркуса экспорт лежит в `markus`). */
const CHARACTER_EXPORT_DIR: Record<"elena" | "marcus" | "igor", string> = {
  elena: "elena",
  marcus: "markus",
  igor: "igor",
};

const WALK_CLIP_FOLDER: Record<string, string> = {
  elena: "Walking-ada10d9a",
  markus: "Walking-3023d24d",
  igor: "Walking-a8cde0dd",
};

const WALK_DIRS = ["south", "north", "east"] as const;
type WalkDir = (typeof WALK_DIRS)[number];

const DIR_SUFFIX: Record<WalkDir, string> = {
  south: "s",
  north: "n",
  east: "e",
};

export function getTownNpcFullSizeLoadEntries(): AssetManifestLoadEntry[] {
  const out: AssetManifestLoadEntry[] = [];
  for (const npcId of ["elena", "marcus", "igor"] as const) {
    const assetDir = CHARACTER_EXPORT_DIR[npcId];
    const walkFolder = WALK_CLIP_FOLDER[assetDir];
    if (!walkFolder) continue;

    out.push({
      type: "image",
      key: `npc_${npcId}_idle`,
      url: `/assets/characters/${assetDir}/rotations/south.png`,
    });

    for (const dir of WALK_DIRS) {
      const sfx = DIR_SUFFIX[dir];
      for (let i = 0; i < WALK_FRAMES; i++) {
        const idx = String(i).padStart(3, "0");
        out.push({
          type: "image",
          key: `npc_${npcId}_w${sfx}_${i}`,
          url: `/assets/characters/${assetDir}/animations/${walkFolder}/${dir}/frame_${idx}.png`,
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
      runAnim: "town-npc-elena-walk-s",
      walkNAnim: "town-npc-elena-walk-n",
      walkEAnim: "town-npc-elena-walk-e",
    },
    marcus: {
      idleAnim: "town-npc-marcus-idle",
      runAnim: "town-npc-marcus-walk-s",
      walkNAnim: "town-npc-marcus-walk-n",
      walkEAnim: "town-npc-marcus-walk-e",
    },
    igor: {
      idleAnim: "town-npc-igor-idle",
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
    const idleKey = `npc_${npcId}_idle`;
    const idleAnim = `town-npc-${npcId}-idle`;

    if (!scene.anims.exists(idleAnim)) {
      scene.anims.create({
        key: idleAnim,
        frames: [{ key: idleKey, frame: 0 }],
        frameRate: 8,
        repeat: -1,
      });
    }

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
  }
}
