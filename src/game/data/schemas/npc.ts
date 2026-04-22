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

const npcDialogueScriptOpenerSchema = z
  .object({
    label: z.string().min(1).max(80),
    prompt: z.string().min(1).max(600),
  })
  .strict();

/** `npcs/<id>/dialogue_scripts.json` — кнопки быстрого старта диалога. */
export const npcDialogueScriptsFileSchema = z
  .object({
    openers: z.array(npcDialogueScriptOpenerSchema).min(1).max(12),
  })
  .strict();

export type NpcRouteValidated = z.infer<typeof npcRouteSchema>;
export type NpcTraitsValidated = z.infer<typeof npcTraitsSchema>;
export type NpcEventLine = z.infer<typeof npcEventLineSchema>;
export type NpcBarksFile = z.infer<typeof npcBarksFileSchema>;
export type NpcDialogueScriptsFile = z.infer<typeof npcDialogueScriptsFileSchema>;
