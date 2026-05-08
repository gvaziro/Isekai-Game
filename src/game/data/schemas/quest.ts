import { z } from "zod";

const objectiveTalkTo = z.object({
  kind: z.literal("talk_to"),
  npcId: z.string(),
});

const objectiveBringItem = z.object({
  kind: z.literal("bring_item"),
  curatedId: z.string(),
  qty: z.number().int().positive().default(1),
});

const objectiveOpenChest = z.object({
  kind: z.literal("open_chest"),
  chestId: z.string(),
});

const objectiveKill = z.object({
  kind: z.literal("kill"),
  /** Id экземпляра врага (`EnemySpawnDef.id`), см. combatWorld */
  enemyId: z.string(),
});

const objectiveReachPoint = z.object({
  kind: z.literal("reach_point"),
  x: z.number(),
  y: z.number(),
  radius: z.number().positive(),
});

const objectiveDungeonClearedToFloor = z.object({
  kind: z.literal("dungeon_cleared_to_floor"),
  floor: z.number().int().positive(),
});

export const questObjectiveSchema = z.discriminatedUnion("kind", [
  objectiveTalkTo,
  objectiveBringItem,
  objectiveOpenChest,
  objectiveKill,
  objectiveReachPoint,
  objectiveDungeonClearedToFloor,
]);

export const questStageSchema = z.object({
  id: z.string(),
  summary: z.string(),
  objective: questObjectiveSchema,
});

export const questDefSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  stages: z.array(questStageSchema).min(1),
});

export type QuestObjective = z.infer<typeof questObjectiveSchema>;
export type QuestStageDef = z.infer<typeof questStageSchema>;
export type QuestDef = z.infer<typeof questDefSchema>;
