/**
 * Звуки из `public/assets/Free Fantasy SFX Pack By TomMusic/.../OGG Files/SFX`
 * и при необходимости `.../WAV Files/SFX` (рубка — WAV из `Chopping and Mining`).
 * Сегменты пути кодируются для пробелов и спецсимволов в URL.
 */

const FANTASY_SFX_REL_PARTS = [
  "assets",
  "Free Fantasy SFX Pack By TomMusic",
  "Free Fantasy SFX Pack By TomMusic",
  "OGG Files",
  "SFX",
] as const;

const FANTASY_SFX_WAV_PARTS = [
  "assets",
  "Free Fantasy SFX Pack By TomMusic",
  "Free Fantasy SFX Pack By TomMusic",
  "WAV Files",
  "SFX",
] as const;

function encodePathUrl(segments: readonly string[]): string {
  return (
    "/" +
    segments
      .flatMap((s) => s.split("/"))
      .filter(Boolean)
      .map((seg) => encodeURIComponent(seg))
      .join("/")
  );
}

function sfxUrl(...pathWithinSfx: string[]): string {
  return encodePathUrl([...FANTASY_SFX_REL_PARTS, ...pathWithinSfx]);
}

function sfxWavUrl(...pathWithinSfx: string[]): string {
  return encodePathUrl([...FANTASY_SFX_WAV_PARTS, ...pathWithinSfx]);
}

/** Ключи Phaser `load.audio` / `sound.play` — префикс, чтобы не пересечься с другими ассетами. */
export const FANTASY_SFX = {
  meleeSwing: "nagibatop_sfx_melee_swing",
  meleeHit: "nagibatop_sfx_melee_hit",
  enemyDeath: "nagibatop_sfx_enemy_death",
  playerHurt: "nagibatop_sfx_player_hurt",
  chestOpen: "nagibatop_sfx_chest_open",
  pickup: "nagibatop_sfx_pickup",
  levelUp: "nagibatop_sfx_level_up",
  woodChop1: "nagibatop_sfx_wood_chop_1",
  woodChop2: "nagibatop_sfx_wood_chop_2",
  woodChop3: "nagibatop_sfx_wood_chop_3",
  woodChop4: "nagibatop_sfx_wood_chop_4",
  mine1: "nagibatop_sfx_mine_1",
  mine2: "nagibatop_sfx_mine_2",
  mine3: "nagibatop_sfx_mine_3",
  mine4: "nagibatop_sfx_mine_4",
  footstepDirtWalk1: "nagibatop_sfx_fs_dirt_w1",
  footstepDirtWalk2: "nagibatop_sfx_fs_dirt_w2",
  footstepDirtWalk3: "nagibatop_sfx_fs_dirt_w3",
  footstepDirtWalk4: "nagibatop_sfx_fs_dirt_w4",
  footstepDirtWalk5: "nagibatop_sfx_fs_dirt_w5",
  footstepDirtRun1: "nagibatop_sfx_fs_dirt_r1",
  footstepDirtRun2: "nagibatop_sfx_fs_dirt_r2",
  footstepDirtRun3: "nagibatop_sfx_fs_dirt_r3",
  footstepDirtRun4: "nagibatop_sfx_fs_dirt_r4",
  footstepDirtRun5: "nagibatop_sfx_fs_dirt_r5",
} as const;

export type FantasySfxId = (typeof FANTASY_SFX)[keyof typeof FANTASY_SFX];

/** Четыре варианта удара по дереву (`Chopping and Mining/chop N.wav`). */
export const WOOD_CHOP_SFX_IDS: readonly FantasySfxId[] = [
  FANTASY_SFX.woodChop1,
  FANTASY_SFX.woodChop2,
  FANTASY_SFX.woodChop3,
  FANTASY_SFX.woodChop4,
];

/** Случайный звук рубки; `rng` — [0, 1). */
export function pickRandomWoodChopSfxId(rng: () => number): FantasySfxId {
  const a = WOOD_CHOP_SFX_IDS;
  const i = Math.floor(rng() * a.length) % a.length;
  return a[i]!;
}

/** Четыре варианта добычи камня (`Chopping and Mining/mine N.wav`). */
export const MINE_SFX_IDS: readonly FantasySfxId[] = [
  FANTASY_SFX.mine1,
  FANTASY_SFX.mine2,
  FANTASY_SFX.mine3,
  FANTASY_SFX.mine4,
];

/** Случайный звук копания; `rng` — [0, 1). */
export function pickRandomMineSfxId(rng: () => number): FantasySfxId {
  const a = MINE_SFX_IDS;
  const i = Math.floor(rng() * a.length) % a.length;
  return a[i]!;
}

export const FOOTSTEP_DIRT_WALK_IDS: readonly FantasySfxId[] = [
  FANTASY_SFX.footstepDirtWalk1,
  FANTASY_SFX.footstepDirtWalk2,
  FANTASY_SFX.footstepDirtWalk3,
  FANTASY_SFX.footstepDirtWalk4,
  FANTASY_SFX.footstepDirtWalk5,
];

export const FOOTSTEP_DIRT_RUN_IDS: readonly FantasySfxId[] = [
  FANTASY_SFX.footstepDirtRun1,
  FANTASY_SFX.footstepDirtRun2,
  FANTASY_SFX.footstepDirtRun3,
  FANTASY_SFX.footstepDirtRun4,
  FANTASY_SFX.footstepDirtRun5,
];

export function pickRandomFootstepWalkSfxId(rng: () => number): FantasySfxId {
  const a = FOOTSTEP_DIRT_WALK_IDS;
  const i = Math.floor(rng() * a.length) % a.length;
  return a[i]!;
}

export function pickRandomFootstepRunSfxId(rng: () => number): FantasySfxId {
  const a = FOOTSTEP_DIRT_RUN_IDS;
  const i = Math.floor(rng() * a.length) % a.length;
  return a[i]!;
}

/** Пары [ключ кэша Phaser, абсолютный URL от корня сайта]. */
export function fantasySfxLoadPairs(): ReadonlyArray<readonly [FantasySfxId, string]> {
  return [
    [
      FANTASY_SFX.meleeSwing,
      sfxUrl("Attacks", "Sword Attacks Hits and Blocks", "Sword Attack 2.ogg"),
    ],
    [
      FANTASY_SFX.meleeHit,
      sfxUrl("Attacks", "Sword Attacks Hits and Blocks", "Sword Impact Hit 2.ogg"),
    ],
    [FANTASY_SFX.enemyDeath, sfxUrl("Spells", "Spell Impact 3.ogg")],
    [
      FANTASY_SFX.playerHurt,
      sfxUrl("Attacks", "Bow Attacks Hits and Blocks", "Bow Impact Hit 2.ogg"),
    ],
    [FANTASY_SFX.chestOpen, sfxUrl("Doors Gates and Chests", "Chest Open 2.ogg")],
    [FANTASY_SFX.pickup, sfxUrl("Doors Gates and Chests", "Lock Unlock.ogg")],
    [FANTASY_SFX.levelUp, sfxUrl("Spells", "Firebuff 2.ogg")],
    [
      FANTASY_SFX.woodChop1,
      sfxWavUrl("Chopping and Mining", "chop 1.wav"),
    ],
    [
      FANTASY_SFX.woodChop2,
      sfxWavUrl("Chopping and Mining", "chop 2.wav"),
    ],
    [
      FANTASY_SFX.woodChop3,
      sfxWavUrl("Chopping and Mining", "chop 3.wav"),
    ],
    [
      FANTASY_SFX.woodChop4,
      sfxWavUrl("Chopping and Mining", "chop 4.wav"),
    ],
    [FANTASY_SFX.mine1, sfxWavUrl("Chopping and Mining", "mine 1.wav")],
    [FANTASY_SFX.mine2, sfxWavUrl("Chopping and Mining", "mine 2.wav")],
    [FANTASY_SFX.mine3, sfxWavUrl("Chopping and Mining", "mine 3.wav")],
    [FANTASY_SFX.mine4, sfxWavUrl("Chopping and Mining", "mine 4.wav")],
    [
      FANTASY_SFX.footstepDirtWalk1,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Walk 1.wav"),
    ],
    [
      FANTASY_SFX.footstepDirtWalk2,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Walk 2.wav"),
    ],
    [
      FANTASY_SFX.footstepDirtWalk3,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Walk 3.wav"),
    ],
    [
      FANTASY_SFX.footstepDirtWalk4,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Walk 4.wav"),
    ],
    [
      FANTASY_SFX.footstepDirtWalk5,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Walk 5.wav"),
    ],
    [
      FANTASY_SFX.footstepDirtRun1,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Run 1.wav"),
    ],
    [
      FANTASY_SFX.footstepDirtRun2,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Run 2.wav"),
    ],
    [
      FANTASY_SFX.footstepDirtRun3,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Run 3.wav"),
    ],
    [
      FANTASY_SFX.footstepDirtRun4,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Run 4.wav"),
    ],
    [
      FANTASY_SFX.footstepDirtRun5,
      sfxWavUrl("Footsteps", "Dirt", "Dirt Run 5.wav"),
    ],
  ];
}
