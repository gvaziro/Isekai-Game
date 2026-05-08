/**
 * Единая логика «модалок» GameRoot: и `nagibatop-modal-open`, и блокировка хоткеев I/J/…
 * должны опираться на один и тот же набор флагов.
 */

export type GameRootModalLikeInput = {
  inventoryOpen: boolean;
  chestOpen: boolean;
  craftOpen: boolean;
  journalOpen: boolean;
  loreJournalOpen: boolean;
  achievementsOpen: boolean;
  settingsOpen: boolean;
  npcInteract: boolean;
  shopOpen: boolean;
  isekaiOpen: boolean;
  openingCutsceneOpen: boolean;
  dungeonPickerOpen: boolean;
  levelStatAllocOpen: boolean;
  sleepOpen: boolean;
  dungeonMapOpen: boolean;
  forestMapOpen: boolean;
  deathModalOpen: boolean;
};

/** Соответствует `modalLike` в GameRoot (без LLM-диалога). */
export function computeGameRootModalLike(i: GameRootModalLikeInput): boolean {
  return (
    i.inventoryOpen ||
    i.chestOpen ||
    i.craftOpen ||
    i.journalOpen ||
    i.loreJournalOpen ||
    i.achievementsOpen ||
    i.settingsOpen ||
    i.npcInteract ||
    i.shopOpen ||
    i.isekaiOpen ||
    i.openingCutsceneOpen ||
    i.dungeonPickerOpen ||
    i.levelStatAllocOpen ||
    i.sleepOpen ||
    i.dungeonMapOpen ||
    i.forestMapOpen ||
    i.deathModalOpen
  );
}

/**
 * Блокирует хоткеи инвентаря/журнала/настроек/отдыха/миникарты (первый keydown-обработчик).
 * Миникарта перехватывается отдельной веткой до остальных модалок.
 */
export function gameRootBlocksWorldMenuHotkeys(
  i: GameRootModalLikeInput,
  dialogueOpen: boolean
): boolean {
  if (i.dungeonMapOpen || i.forestMapOpen) return true;
  return dialogueOpen || computeGameRootModalLike(i);
}
