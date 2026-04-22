import {
  buildGrassDecorList,
  type GrassDecorDef,
} from "@/src/game/locations/types";
import { parseLocationJson } from "@/src/game/locations/locationSchema";
import forestJson from "@/src/game/locations/data/forest.json";
import { generateForestTreeProps } from "@/src/game/locations/forestTreeGen";

const FOREST_BASE = parseLocationJson(forestJson);
const FOREST_TREE_PROPS = generateForestTreeProps(FOREST_BASE);

export const FOREST_LOCATION = {
  ...FOREST_BASE,
  imageProps: [...FOREST_BASE.imageProps, ...FOREST_TREE_PROPS],
};

export const FOREST_GRASS_DECOR: GrassDecorDef[] = buildGrassDecorList(
  FOREST_LOCATION.world,
  FOREST_LOCATION.pathSegments,
  FOREST_LOCATION.imageProps,
  FOREST_LOCATION.animStations,
  FOREST_LOCATION.spawns.default,
  FOREST_LOCATION.grassDecorSeed,
  FOREST_LOCATION.grassDecorCount
);
