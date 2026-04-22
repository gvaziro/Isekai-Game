import { clampDungeonFloor } from "@/src/game/data/dungeonFloorScaling";

/** Текущий этаж подземелья для `getLocation("dungeon")` (синхронизировать с gameStore). */
let runtimeDungeonFloor = 1;

export function setRuntimeDungeonFloor(floor: number): void {
  runtimeDungeonFloor = clampDungeonFloor(floor);
}

export function getRuntimeDungeonFloor(): number {
  return runtimeDungeonFloor;
}
