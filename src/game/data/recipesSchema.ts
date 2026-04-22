import { z } from "zod";
import { CRAFT_STATION_IDS } from "@/src/game/data/stations";

const stationIdSet = new Set(CRAFT_STATION_IDS);

const ioLineSchema = z.object({
  curatedId: z.string().min(1).max(120),
  qty: z.number().int().min(1).max(9999),
});

export const recipeSchema = z.object({
  id: z.string().min(1).max(120),
  stationId: z.string().refine((id) => stationIdSet.has(id), {
    message: "Неизвестная станция",
  }),
  label: z.string().max(200).optional(),
  inputs: z.array(ioLineSchema).min(1).max(12),
  outputs: z.array(ioLineSchema).min(1).max(12),
  goldCost: z.number().int().min(0).max(1_000_000).optional(),
});

export const recipesFileSchema = z.object({
  $schema: z.string().optional(),
  updatedAt: z.string().optional(),
  recipes: z.array(recipeSchema),
});

export type RecipeIoLine = z.infer<typeof ioLineSchema>;
export type RecipeDef = z.infer<typeof recipeSchema>;
export type RecipesFile = z.infer<typeof recipesFileSchema>;
