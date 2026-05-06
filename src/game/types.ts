export type NpcRoute = {
  spawn: { x: number; y: number };
  speed: number;
  idleMs: [number, number];
  waypoints: { x: number; y: number }[];
};

export type NpcDialogueOpener = {
  label: string;
  prompt: string;
};

export type NpcPublic = {
  id: string;
  route: NpcRoute;
  /** Имя из traits.json (`name`), если есть */
  displayName?: string;
  /** Из `npcs/<id>/barks.json` — случайные реплики при приближении. */
  barks?: string[];
  /** Из `npcs/<id>/dialogue_scripts.json` — кнопки быстрого старта в диалоге. */
  dialogueScripts?: { openers: NpcDialogueOpener[] };
};

export type AssetManifestLoadImage = {
  key: string;
  type: "image";
  url: string;
};

export type AssetManifestLoadSpritesheet = {
  key: string;
  type: "spritesheet";
  url: string;
  frameWidth: number;
  frameHeight: number;
  /** Опционально: для UI редактора карт (генератор pc-env). */
  frameCount?: number;
};

export type AssetManifestLoadEntry =
  | AssetManifestLoadImage
  | AssetManifestLoadSpritesheet;

export type AssetManifestAnimEntry = {
  key: string;
  textureKey: string;
  start: number;
  end: number;
  frameRate: number;
  repeat: number;
};

export type AssetManifestUnitEntry = {
  idleAnim: string;
  runAnim: string;
};

/**
 * Враг — Orc / Skeleton (idle 32×32, run 64×64 как у NPC Knight);
 * опционально направленный моб (например слайм 64×64) с отдельными клипами
 * idle/walk по сторонам и одноразовой атакой (`repeat: 0` в манифесте).
 */
export type MobUnitManifest = {
  idleAnim: string;
  runAnim: string;
  textureKeyIdle: string;
  idleAnimUp?: string;
  idleAnimDown?: string;
  idleAnimSide?: string;
  runAnimUp?: string;
  runAnimDown?: string;
  runAnimSide?: string;
  attackAnimUp?: string;
  attackAnimDown?: string;
  attackAnimSide?: string;
  /** Задержка нанесения урона после старта attack-клипа (мс). */
  attackStrikeDelayMs?: number;
};

/**
 * Герой — Pixel Crawler Body_A (`src/game/data/heroAnimSheets.json` + gen-assets).
 * Значения — ключи записей в `manifest.animations`.
 */
export type PixelCrawlerHeroManifest = {
  frameSize: number;
  idleSide: string;
  idleUp: string;
  idleDown: string;
  walkSide: string;
  walkUp: string;
  walkDown: string;
  runSide: string;
  runUp: string;
  runDown: string;
  hitSide: string;
  hitUp: string;
  hitDown: string;
  deathSide: string;
  deathUp: string;
  deathDown: string;
  sliceSide: string;
  sliceUp: string;
  sliceDown: string;
  pierceSide: string;
  pierceUp: string;
  pierceDown: string;
  crushSide: string;
  crushUp: string;
  crushDown: string;
  collectSide: string;
  collectUp: string;
  collectDown: string;
  fishingSide: string;
  fishingUp: string;
  fishingDown: string;
  wateringSide: string;
  wateringUp: string;
  wateringDown: string;
  carryIdleSide: string;
  carryIdleUp: string;
  carryIdleDown: string;
  carryWalkSide: string;
  carryWalkUp: string;
  carryWalkDown: string;
  carryRunSide: string;
  carryRunUp: string;
  carryRunDown: string;
};

export type AssetManifest = {
  world: { width: number; height: number };
  load: AssetManifestLoadEntry[];
  animations: AssetManifestAnimEntry[];
  hero: PixelCrawlerHeroManifest;
  /** Только NPC (elena/marcus/igor) — спрайты Knight/Rogue/Wizzard. */
  units: Record<string, AssetManifestUnitEntry>;
  /** Враги — Orc Crew / Skeleton Crew (`mobAnimSheets.json` + gen-assets). */
  mobs: Record<string, MobUnitManifest>;
};
