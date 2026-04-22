/**
 * Фаза 4: спавны врагов (пиксели мира, origin сущностей — 0.5, 1 у ног).
 * Агро — по дистанции к мобу (`balance` + опциональные поля спавна), не по прямоугольникам.
 */

export type EnemySpawnDef = {
  /** Уникальный id для сейва и таймера респавна (`enemyRespawnNotBeforeMs`). */
  id: string;
  zoneId: string;
  x: number;
  y: number;
  lootTable: string;
  /** Ключ в `manifest.mobs` (спрайты Orc / Skeleton). */
  mobVisualId: string;
  /** Уровень моба; если не задан — 1. */
  level?: number;
  aggroRadius?: number;
  loseAggroRadius?: number;
  leashRadius?: number;
};

export const ENEMY_SPAWNS: readonly EnemySpawnDef[] = [
  /**
   * Бандит у южного перекрёстка: игрок должен пройти несколько экранов
   * от спавна героя, чтобы наткнуться на него.
   */
  {
    id: "grunt_crossroads",
    zoneId: "crossroads",
    x: 520,
    y: 680,
    lootTable: "grunt",
    mobVisualId: "orc_warrior",
  },
  {
    id: "grunt_se_1",
    zoneId: "se_woods",
    x: 980,
    y: 720,
    lootTable: "grunt",
    mobVisualId: "skeleton_rogue",
  },
  {
    id: "grunt_se_2",
    zoneId: "se_woods",
    x: 1060,
    y: 780,
    lootTable: "grunt",
    mobVisualId: "orc_shaman",
  },
  {
    id: "grunt_se_3",
    zoneId: "se_woods",
    x: 920,
    y: 840,
    lootTable: "grunt",
    mobVisualId: "skeleton_warrior",
    /** Пример: без `enemySpawns` в JSON леса используются эти записи. */
    level: 2,
  },
];
