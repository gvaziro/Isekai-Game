import type {
  AssetManifest,
  AssetManifestAnimEntry,
  AssetManifestLoadEntry,
  AssetManifestUnitEntry,
  MobUnitManifest,
} from "@/src/game/types";

/**
 * Дополнение к `manifest.json` от dev-редактора персонажей.
 * Файл: `public/assets/world/character-pack.json`.
 * Записи из пака перезаписывают совпадающие ключи анимаций и `load` (последний выигрывает).
 */
export type CharacterPackJson = {
  load?: AssetManifestLoadEntry[];
  animations?: AssetManifestAnimEntry[];
  units?: Record<string, AssetManifestUnitEntry>;
  mobs?: Record<string, MobUnitManifest>;
};

function dedupeLoadEntries(chunks: AssetManifestLoadEntry[][]): AssetManifestLoadEntry[] {
  const map = new Map<string, AssetManifestLoadEntry>();
  for (const chunk of chunks) {
    for (const e of chunk) {
      map.set(e.key, e);
    }
  }
  return [...map.values()];
}

function mergeAnimations(
  base: AssetManifestAnimEntry[],
  pack: AssetManifestAnimEntry[] | undefined
): AssetManifestAnimEntry[] {
  if (!pack?.length) return base;
  const packKeys = new Set(pack.map((a) => a.key));
  if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
    for (const k of packKeys) {
      if (base.some((a) => a.key === k)) {
        console.warn(`[character-pack] анимация «${k}» перезаписана паком`);
      }
    }
  }
  return [...base.filter((a) => !packKeys.has(a.key)), ...pack];
}

export type ManifestExtraLoads = {
  pcEnvLoad?: { load?: AssetManifest["load"] };
  pcSlicesLoad?: { load?: AssetManifest["load"] };
  pcAutoSlicesLoad?: { load?: AssetManifest["load"] };
  characterPack?: CharacterPackJson | null;
};

/**
 * Собирает финальный `AssetManifest` для игры и редактора карт:
 * объединяет `load`, подмешивает анимации / units / mobs из character-pack.
 */
export function mergeAssetManifestWithExtras(
  base: AssetManifest,
  extras: ManifestExtraLoads
): AssetManifest {
  const pack = extras.characterPack ?? undefined;
  const load = dedupeLoadEntries([
    base.load,
    extras.pcEnvLoad?.load ?? [],
    extras.pcSlicesLoad?.load ?? [],
    extras.pcAutoSlicesLoad?.load ?? [],
    pack?.load ?? [],
  ]);

  const animations = mergeAnimations(base.animations, pack?.animations);
  const units = { ...base.units, ...(pack?.units ?? {}) };
  const mobs = { ...base.mobs, ...(pack?.mobs ?? {}) };

  return {
    ...base,
    load,
    animations,
    units,
    mobs,
  };
}
