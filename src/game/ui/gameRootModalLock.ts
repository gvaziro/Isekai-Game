/**
 * Единая логика «модалок» GameRoot: и `last-summon-modal-open`, и блокировка хоткеев I/J/…
 * должны опираться на один и тот же набор флагов.
 */

export type GameRootModalLikeInput = {
  inventoryOpen: boolean;
  chestOpen: boolean;
  craftOpen: boolean;
  journalOpen: boolean;
  loreJournalOpen: boolean;
  readableBookOpen: boolean;
  achievementsOpen: boolean;
  settingsOpen: boolean;
  npcInteract: boolean;
  heroThoughtOpen: boolean;
  shopOpen: boolean;
  isekaiOpen: boolean;
  openingCutsceneOpen: boolean;
  dungeonPickerOpen: boolean;
  levelStatAllocOpen: boolean;
  sleepOpen: boolean;
  dungeonMapOpen: boolean;
  forestMapOpen: boolean;
  deathModalOpen: boolean;
  /** Нижнее каскадное меню «?» (инвентарь, настройки, …). */
  worldQuickMenuOpen: boolean;
  /** Окно выбора слота загрузки. */
  loadGameOverlayOpen: boolean;
  /** Окно ручного сохранения в слоты 1–4. */
  saveGameOverlayOpen: boolean;
};

/** Соответствует `modalLike` в GameRoot (без LLM-диалога). */
export function computeGameRootModalLike(i: GameRootModalLikeInput): boolean {
  return (
    i.inventoryOpen ||
    i.chestOpen ||
    i.craftOpen ||
    i.journalOpen ||
    i.loreJournalOpen ||
    i.readableBookOpen ||
    i.achievementsOpen ||
    i.settingsOpen ||
    i.npcInteract ||
    i.heroThoughtOpen ||
    i.shopOpen ||
    i.isekaiOpen ||
    i.openingCutsceneOpen ||
    i.dungeonPickerOpen ||
    i.levelStatAllocOpen ||
    i.sleepOpen ||
    i.dungeonMapOpen ||
    i.forestMapOpen ||
    i.deathModalOpen ||
    i.worldQuickMenuOpen ||
    i.loadGameOverlayOpen ||
    i.saveGameOverlayOpen
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
