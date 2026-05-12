import { describe, expect, it } from "vitest";
import {
  parseTownInteractZones,
  type TownTmjJson,
} from "@/src/game/maps/townTilemapRuntime";

describe("parseTownInteractZones", () => {
  it("reads Interact layer, normalizes values, and ignores unknown kinds", () => {
    const tmj: TownTmjJson = {
      width: 10,
      height: 10,
      tilewidth: 16,
      tileheight: 16,
      tilesets: [],
      layers: [
        {
          type: "objectgroup",
          name: "Above_Interact_id50",
          objects: [
            {
              id: 1,
              x: 10.2,
              y: 20.7,
              width: 32.4,
              height: 16.2,
              properties: [
                { name: "interact", type: "string", value: "Well" },
              ],
            },
            {
              id: 2,
              x: 50,
              y: 60,
              width: 8,
              height: 8,
              properties: [
                { name: "Interact", type: "string", value: "fishing" },
              ],
            },
            {
              id: 3,
              x: 70,
              y: 80,
              width: 8,
              height: 8,
              properties: [
                { name: "Interact", type: "string", value: "unknown" },
              ],
            },
          ],
        },
      ],
    };

    expect(parseTownInteractZones(tmj)).toEqual([
      { id: "town_interact_1", kind: "well", x: 10, y: 21, w: 32, h: 16 },
      { id: "town_interact_2", kind: "fishing", x: 50, y: 60, w: 8, h: 8 },
    ]);
  });
});
