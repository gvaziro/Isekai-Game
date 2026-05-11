export const STARTER_NPC_AI_LORE_FACT_IDS = [
  "places.village",
  "misc.journal",
  "world.forest_and_fog",
] as const;

export type CompletedNpcIntroRecord = {
  version: number;
  completedAt: number;
};

export type CompletedNpcIntroById = Record<string, CompletedNpcIntroRecord>;

export function hasStarterNpcAiLoreAccess(
  unlockedFactIds: readonly string[]
): boolean {
  const unlocked = new Set(unlockedFactIds);
  return STARTER_NPC_AI_LORE_FACT_IDS.every((id) => unlocked.has(id));
}

export function isNpcIntroCompleted(
  completedIntroByNpcId: CompletedNpcIntroById,
  npcId: string,
  introVersion: number | undefined
): boolean {
  if (introVersion === undefined) return true;
  const record = completedIntroByNpcId[npcId];
  return record?.version === introVersion;
}
