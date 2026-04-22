import type { NpcRoute } from "@/src/game/types";

/**
 * Сдвигает весь маршрут NPC так, чтобы новая точка спавна совпадала с override.
 * Без override возвращается исходный route.
 */
export function applyNpcSpawnOverride(
  route: NpcRoute,
  override?: { x: number; y: number }
): NpcRoute {
  if (!override) return route;
  const dx = override.x - route.spawn.x;
  const dy = override.y - route.spawn.y;
  return {
    ...route,
    spawn: { x: override.x, y: override.y },
    waypoints: (route.waypoints ?? []).map((wp) => ({
      x: wp.x + dx,
      y: wp.y + dy,
    })),
  };
}
