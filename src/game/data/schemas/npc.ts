import { z } from "zod";

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/** `npcs/<id>/route.json` */
export const npcRouteSchema = z.object({
  spawn: pointSchema,
  speed: z.number().nonnegative(),
  idleMs: z.tuple([z.number(), z.number()]),
  waypoints: z.array(pointSchema),
});

/** `npcs/<id>/traits.json` — минимум проверки `name`, остальное сохраняется как есть */
export const npcTraitsSchema = z
  .object({
    name: z.string().optional(),
  })
  .passthrough();

/** Один рядок `npcs/<id>/events.jsonl` и тело append к `/api/npc/.../event`. */
export const npcEventLineSchema = z
  .object({
    ts: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
      message: "expected ISO-8601 timestamp",
    }),
    type: z.string().trim().min(1).max(80),
    summary: z.string().min(1).max(8000),
  })
  .strict();

/** `npcs/<id>/character.md` — сырой текст системного промпта. */
export const npcCharacterMdSchema = z
  .string()
  .min(1, "character.md must not be empty")
  .max(500_000)
  .refine((s) => !s.includes("\0"), { message: "null bytes are not allowed" });

/** `npcs/<id>/barks.json` — короткие реплики при приближении игрока. */
export const npcBarksFileSchema = z
  .object({
    lines: z.array(z.string().min(1).max(240)).min(1).max(40),
  })
  .strict();

const npcDialogueScriptGrantItemSchema = z
  .object({
    curatedId: z.string().min(1).max(120),
    qty: z.number().int().min(1).max(99),
  })
  .strict();

const npcDialogueScriptChoiceSchema = z
  .object({
    label: z.string().min(1).max(120),
    playerText: z.string().min(1).max(600).optional(),
    nextStepId: z.string().min(1).max(80).optional(),
    unlockLoreFactIds: z.array(z.string().min(1).max(120)).max(8).optional(),
    complete: z.boolean().optional(),
    grantItems: z.array(npcDialogueScriptGrantItemSchema).max(6).optional(),
    takeItems: z.array(npcDialogueScriptGrantItemSchema).max(6).optional(),
  })
  .strict();

const npcDialogueScriptIntroStepSchema = z
  .object({
    id: z.string().min(1).max(80),
    npcText: z.string().min(1).max(1200),
    choices: z.array(npcDialogueScriptChoiceSchema).min(1).max(3),
  })
  .strict();

const npcDialogueScriptSceneSchema = z
  .object({
    id: z.string().min(1).max(80),
    questId: z.string().min(1).max(120),
    stageId: z.string().min(1).max(120),
    version: z.number().int().positive(),
    steps: z.array(npcDialogueScriptIntroStepSchema).min(1).max(12),
  })
  .strict();

/** `npcs/<id>/dialogue_scripts.json` — квестовые scripted-сцены диалога. */
export const npcDialogueScriptsFileSchema = z
  .object({
    scenes: z.array(npcDialogueScriptSceneSchema).min(1).max(24),
  })
  .strict();

export type NpcRouteValidated = z.infer<typeof npcRouteSchema>;
export type NpcTraitsValidated = z.infer<typeof npcTraitsSchema>;
export type NpcEventLine = z.infer<typeof npcEventLineSchema>;
export type NpcBarksFile = z.infer<typeof npcBarksFileSchema>;
export type NpcDialogueScriptsFile = z.infer<typeof npcDialogueScriptsFileSchema>;
