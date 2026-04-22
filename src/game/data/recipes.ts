import recipesRaw from "./recipes.json";
import {
  type RecipeDef,
  recipesFileSchema,
} from "@/src/game/data/recipesSchema";

function loadRecipes(): RecipeDef[] {
  const parsed = recipesFileSchema.safeParse(recipesRaw);
  if (!parsed.success) {
    console.warn("[recipes] invalid recipes.json:", parsed.error.flatten());
    return [];
  }
  const seen = new Set<string>();
  const out: RecipeDef[] = [];
  for (const r of parsed.data.recipes) {
    if (seen.has(r.id)) {
      console.warn(`[recipes] duplicate recipe id skipped: ${r.id}`);
      continue;
    }
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

const RECIPES: RecipeDef[] = loadRecipes();

export function getAllRecipes(): readonly RecipeDef[] {
  return RECIPES;
}

export function getRecipeById(id: string): RecipeDef | undefined {
  return RECIPES.find((r) => r.id === id);
}

export function getRecipesForStation(stationId: string): RecipeDef[] {
  return RECIPES.filter((r) => r.stationId === stationId);
}

export type { RecipeDef };
