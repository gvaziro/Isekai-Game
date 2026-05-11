import { LORE_FACTS_BY_ID } from "@/src/game/data/loreJournal";
import { useLoreJournalStore } from "@/src/game/state/loreJournalStore";

export type LoreUnlockEventDetail = {
  /** Одна запись */
  factId?: string;
  /** Несколько записей */
  factIds?: readonly string[];
  /** Происхождение для метаданных (dialogue, book, …) */
  source?: string;
};

/**
 * Слушает `last-summon:lore-unlock` и добавляет только известные каталогу id.
 * При появлении новых записей — короткий toast с названием.
 */
export function mountLoreJournalEventBridge(): () => void {
  const onUnlock = (e: Event) => {
    const ce = e as CustomEvent<LoreUnlockEventDetail>;
    const d = ce.detail;
    if (!d) return;

    const ids: string[] = [];
    if (typeof d.factId === "string" && d.factId.trim()) {
      ids.push(d.factId.trim());
    }
    if (Array.isArray(d.factIds)) {
      for (const x of d.factIds) {
        if (typeof x === "string" && x.trim()) ids.push(x.trim());
      }
    }
    if (ids.length === 0) return;

    const { added } = useLoreJournalStore
      .getState()
      .unlockLoreFacts(ids, { source: d.source });

    if (typeof window !== "undefined" && added.length > 0) {
      const msg =
        added.length === 1
          ? `Дневник: «${LORE_FACTS_BY_ID[added[0]!]?.title ?? added[0]}»`
          : `Дневник: открыто записей — ${added.length}`;
      window.dispatchEvent(
        new CustomEvent("last-summon-toast", { detail: { message: msg } })
      );
    }
  };

  window.addEventListener("last-summon:lore-unlock", onUnlock);
  return () => window.removeEventListener("last-summon:lore-unlock", onUnlock);
}
