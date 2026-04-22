import { describe, expect, it } from "vitest";
import {
  parseLocationJson,
  serializeLocationToJsonObject,
} from "@/src/game/locations/locationSchema";
import forestJson from "@/src/game/locations/data/forest.json";
import { generateCatacombs } from "@/src/game/locations/dungeonGen";
import { TOWN_LOCATION } from "@/src/game/locations/town";

describe("parseLocationJson", () => {
  it("parses generated dungeon (catacombs)", () => {
    const loc = parseLocationJson(generateCatacombs(0xca7ac0));
    expect(loc.id).toBe("dungeon");
    expect(loc.world.width).toBeGreaterThanOrEqual(1600);
    expect(loc.world.height).toBeGreaterThanOrEqual(1200);
    expect(loc.enemySpawns).toEqual([]);
    expect(loc.exits[0]?.targetLocationId).toBe("town");
    expect(loc.exits[1]?.id).toBe("dungeon_change_floor");
    expect(loc.exits[1]?.targetLocationId).toBe("dungeon");
  });

  it("parses forest.json to stable GameLocation", () => {
    const loc = parseLocationJson(forestJson);
    expect(loc.id).toBe("forest");
    expect(loc.world).toEqual({ width: 1280, height: 960 });
    expect(loc.backgroundFill).toBe(0x2a4a22);
    expect(loc.groundTextureKey).toBe("forest_ground");
    expect(loc.pathSegments).toHaveLength(1);
    expect(loc.imageProps.length).toBeGreaterThan(0);
    expect(
      loc.imageProps.filter((p) => p.texture.toLowerCase().startsWith("tree"))
    ).toHaveLength(0);
    expect(loc.spawns.default).toEqual({ x: 640, y: 800 });
    expect(loc.exits[0]?.targetLocationId).toBe("town");
    expect(loc.grassDecorSeed).toBe(0x51b2a3);
  });

  it("round-trips serialize → parse for town", () => {
    const raw = serializeLocationToJsonObject(TOWN_LOCATION);
    const back = parseLocationJson(raw);
    expect(back.id).toBe(TOWN_LOCATION.id);
    expect(back.backgroundFill).toBe(TOWN_LOCATION.backgroundFill);
    expect(back.grassDecorSeed).toBe(TOWN_LOCATION.grassDecorSeed);
    expect(back.imageProps.length).toBe(TOWN_LOCATION.imageProps.length);
    expect(back.exits).toEqual(TOWN_LOCATION.exits);
  });
});
