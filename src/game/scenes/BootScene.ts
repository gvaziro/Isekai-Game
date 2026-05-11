import * as Phaser from "phaser";
import { fantasySfxLoadPairs } from "@/src/game/audio/fantasySfx";
import { ITEM_ATLAS } from "@/src/game/data/items.generated";
import {
  applySliceOverrideTextures,
  queueSliceOverrideParentTextures,
  readSliceOverridesMap,
} from "@/src/game/load/assetSliceOverridesRuntime";
import {
  mergeAssetManifestWithExtras,
  type CharacterPackJson,
} from "@/src/game/load/mergeAssetManifestExtras";
import {
  getTownNpcFullSizeLoadEntries,
  getTownNpcUnitsOverride,
  registerTownNpcFullSizeAnimations,
} from "@/src/game/load/townNpcFullSize";
import type { AssetManifest } from "@/src/game/types";
import { TOWN_TILESET_LOAD } from "@/src/game/maps/townTilesetPreload.gen";

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  /** Фаза 1: manifest + опциональные листы редактора (pc_env / слайсы). */
  preload(): void {
    this.load.json("assetManifest", "/assets/world/manifest.json");
    this.load.json(
      "pcEnvLoad",
      "/assets/world/pixel-crawler-environment.load.json"
    );
    this.load.json(
      "pcSlicesLoad",
      "/assets/world/pixel-crawler-slices.load.json"
    );
    this.load.json(
      "pcAutoSlicesLoad",
      "/assets/world/pixel-crawler-autoslices.load.json"
    );
    this.load.json("characterPack", "/assets/world/character-pack.json");
    this.load.json("sliceOverrides", "/asset-slice-overrides.json");
    this.load.tilemapTiledJSON(
      "townMapJson",
      "/assets/world/maps/town/town.tmj"
    );
    for (const e of TOWN_TILESET_LOAD) {
      this.load.image(e.key, e.url);
    }
  }

  create(): void {
    const data = this.cache.json.get("assetManifest") as AssetManifest | undefined;
    if (!data?.load?.length) {
      throw new Error(
        "Не найден /assets/world/manifest.json — выполните: npm run gen-assets"
      );
    }

    const extra = this.cache.json.get("pcEnvLoad") as
      | { load?: AssetManifest["load"] }
      | undefined;
    const slices = this.cache.json.get("pcSlicesLoad") as
      | { load?: AssetManifest["load"] }
      | undefined;
    const autoSlices = this.cache.json.get("pcAutoSlicesLoad") as
      | { load?: AssetManifest["load"] }
      | undefined;
    const characterPackRaw = this.cache.json.get("characterPack") as
      | CharacterPackJson
      | undefined;
    const characterPackMerged: CharacterPackJson = {
      ...(characterPackRaw ?? {}),
      load: [
        ...(characterPackRaw?.load ?? []),
        ...getTownNpcFullSizeLoadEntries(),
      ],
      units: {
        ...(characterPackRaw?.units ?? {}),
        ...getTownNpcUnitsOverride(),
      },
    };
    const merged = mergeAssetManifestWithExtras(data, {
      pcEnvLoad: extra,
      pcSlicesLoad: slices,
      pcAutoSlicesLoad: autoSlices,
      characterPack: characterPackMerged,
    });

    if (ITEM_ATLAS.available) {
      this.load.atlas(
        ITEM_ATLAS.textureKey,
        ITEM_ATLAS.pngUrl,
        ITEM_ATLAS.jsonUrl
      );
    }

    const sliceOverrides = readSliceOverridesMap(this);
    const sliceOverrideKeys = queueSliceOverrideParentTextures(
      this,
      sliceOverrides
    );

    for (const e of merged.load) {
      if (e.type === "image" && sliceOverrideKeys.has(e.key)) {
        continue;
      }
      if (e.type === "image") {
        this.load.image(e.key, e.url);
      } else {
        this.load.spritesheet(e.key, e.url, {
          frameWidth: e.frameWidth,
          frameHeight: e.frameHeight,
        });
      }
    }

    for (const [key, url] of fantasySfxLoadPairs()) {
      this.load.audio(key, url);
    }

    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      applySliceOverrideTextures(this, sliceOverrides, sliceOverrideKeys);
      for (const a of merged.animations) {
        if (this.anims.exists(a.key)) continue;
        this.anims.create({
          key: a.key,
          frames: this.anims.generateFrameNumbers(a.textureKey, {
            start: a.start,
            end: a.end,
          }),
          frameRate: a.frameRate,
          repeat: a.repeat,
        });
      }
      registerTownNpcFullSizeAnimations(this);
      this.registry.set("assetManifest", merged);
      this.scene.start("MainScene");
    });

    this.load.start();
  }
}
