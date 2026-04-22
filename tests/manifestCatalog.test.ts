import { describe, expect, it } from "vitest";
import {
  buildCatalogFromManifestLoad,
  categorizeManifestEntry,
  PLACEABLE_IMAGE_DENY_KEYS,
} from "@/src/game/mapEditor/manifestCatalog";

describe("manifestCatalog", () => {
  it("denylist contains expected ground keys", () => {
    expect(PLACEABLE_IMAGE_DENY_KEYS.has("world_ground")).toBe(true);
    expect(PLACEABLE_IMAGE_DENY_KEYS.has("dungeon_void")).toBe(true);
    expect(PLACEABLE_IMAGE_DENY_KEYS.has("tree1")).toBe(false);
  });

  it("categorizeManifestEntry by url", () => {
    expect(
      categorizeManifestEntry({
        type: "image",
        url: "/assets/world/decor/bench.png",
      })
    ).toBe("Декор");
    expect(
      categorizeManifestEntry({
        type: "image",
        url: "/assets/world/buildings/house.png",
      })
    ).toBe("Здания");
    expect(
      categorizeManifestEntry({
        type: "spritesheet",
        url: "/assets/world/units/npc_knight_idle.png",
      })
    ).toBe("Юниты");
    expect(
      categorizeManifestEntry({
        type: "spritesheet",
        url: "/assets/world/decor/bonfire_sheet.png",
      })
    ).toBe("Анимации / станции");
  });

  it("buildCatalogFromManifestLoad filters ground and grass_decor", () => {
    const { images, spritesheets } = buildCatalogFromManifestLoad([
      { key: "world_ground", type: "image", url: "/assets/world/world_ground.png" },
      { key: "tree1", type: "image", url: "/assets/world/decor/tree1.png" },
      { key: "grass_decor", type: "spritesheet", url: "/assets/world/decor/grass_decor.png", frameWidth: 32, frameHeight: 32 },
      { key: "bonfire_sheet", type: "spritesheet", url: "/assets/world/decor/bonfire.png", frameWidth: 64, frameHeight: 64 },
    ]);
    expect(images.map((i) => i.key)).toEqual(["tree1"]);
    expect(spritesheets.map((i) => i.key)).toEqual(["bonfire_sheet"]);
  });
});
