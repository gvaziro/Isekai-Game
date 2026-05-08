import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  LORE_FACTS_BY_ID,
  isKnownLoreFactId,
} from "@/src/game/data/loreJournal";

/** Версия формата persist дневника знаний (не путать с SAVE_VERSION игры). */
export const LORE_JOURNAL_PERSIST_SCHEMA_VERSION = 1;

export type LoreJournalEntryMeta = {
  discoveredAt: number;
  /** Откуда открыли: dialogue, book, quest, … */
  source?: string;
};

export type LoreJournalStoreState = {
  lorePersistVersion: number;
  /** Порядок открытия — как в списке UI */
  unlockedFactIds: string[];
  entriesById: Record<string, LoreJournalEntryMeta>;
  readFactIds: Record<string, true>;

  unlockLoreFact: (
    id: string,
    meta?: { source?: string }
  ) => { added: boolean };
  unlockLoreFacts: (
    ids: readonly string[],
    meta?: { source?: string }
  ) => { added: string[] };
  markLoreFactRead: (id: string) => void;
};

function sanitizeUnlockedChain(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const id = x.trim();
    if (!id || !isKnownLoreFactId(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function sanitizeEntries(raw: unknown): Record<string, LoreJournalEntryMeta> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, LoreJournalEntryMeta> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isKnownLoreFactId(k)) continue;
    if (!v || typeof v !== "object") continue;
    const vo = v as { discoveredAt?: unknown; source?: unknown };
    const t =
      typeof vo.discoveredAt === "number" && Number.isFinite(vo.discoveredAt)
        ? vo.discoveredAt
        : Date.now();
    const source =
      typeof vo.source === "string" && vo.source.trim()
        ? vo.source.trim().slice(0, 120)
        : undefined;
    out[k] = {
      discoveredAt: t,
      ...(source !== undefined ? { source } : {}),
    };
  }
  return out;
}

function sanitizeRead(raw: unknown): Record<string, true> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, true> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isKnownLoreFactId(k) && v === true) out[k] = true;
  }
  return out;
}

/** Согласовать unlockedFactIds и entriesById после загрузки из storage */
function reconcile(
  unlocked: string[],
  entries: Record<string, LoreJournalEntryMeta>
): { unlockedFactIds: string[]; entriesById: Record<string, LoreJournalEntryMeta> } {
  const entriesOut: Record<string, LoreJournalEntryMeta> = {};
  const chain: string[] = [];
  const seen = new Set<string>();

  for (const id of unlocked) {
    if (!isKnownLoreFactId(id) || seen.has(id)) continue;
    seen.add(id);
    chain.push(id);
    entriesOut[id] = entries[id] ?? { discoveredAt: Date.now() };
  }

  for (const id of Object.keys(entries)) {
    if (!isKnownLoreFactId(id) || seen.has(id)) continue;
    seen.add(id);
    chain.push(id);
    entriesOut[id] = entries[id]!;
  }

  return { unlockedFactIds: chain, entriesById: entriesOut };
}

export const useLoreJournalStore = create<LoreJournalStoreState>()(
  persist(
    (set, get) => ({
      lorePersistVersion: LORE_JOURNAL_PERSIST_SCHEMA_VERSION,
      unlockedFactIds: [],
      entriesById: {},
      readFactIds: {},

      unlockLoreFact: (id, meta) => {
        const rid = id.trim();
        if (!isKnownLoreFactId(rid)) return { added: false };
        const st = get();
        if (st.entriesById[rid]) return { added: false };
        const now = Date.now();
        const source = meta?.source?.trim().slice(0, 120);
        set({
          unlockedFactIds: [...st.unlockedFactIds, rid],
          entriesById: {
            ...st.entriesById,
            [rid]: {
              discoveredAt: now,
              ...(source ? { source } : {}),
            },
          },
        });
        return { added: true };
      },

      unlockLoreFacts: (ids, meta) => {
        const added: string[] = [];
        let unlockedFactIds = get().unlockedFactIds;
        let entriesById = get().entriesById;
        const source = meta?.source?.trim().slice(0, 120);
        const now = Date.now();

        for (const raw of ids) {
          const rid = typeof raw === "string" ? raw.trim() : "";
          if (!rid || !isKnownLoreFactId(rid)) continue;
          if (entriesById[rid]) continue;
          unlockedFactIds = [...unlockedFactIds, rid];
          entriesById = {
            ...entriesById,
            [rid]: {
              discoveredAt: now,
              ...(source ? { source } : {}),
            },
          };
          added.push(rid);
        }

        if (added.length > 0) {
          set({ unlockedFactIds, entriesById });
        }
        return { added };
      },

      markLoreFactRead: (id) => {
        const rid = id.trim();
        if (!isKnownLoreFactId(rid)) return;
        set((s) => ({
          readFactIds: { ...s.readFactIds, [rid]: true },
        }));
      },
    }),
    {
      name: "nagibatop-lore-journal-v1",
      version: LORE_JOURNAL_PERSIST_SCHEMA_VERSION,
      partialize: (s) => ({
        lorePersistVersion: s.lorePersistVersion,
        unlockedFactIds: s.unlockedFactIds,
        entriesById: s.entriesById,
        readFactIds: s.readFactIds,
      }),
      merge: (persisted, current) => {
        type P = Partial<
          Pick<
            LoreJournalStoreState,
            | "unlockedFactIds"
            | "entriesById"
            | "readFactIds"
            | "lorePersistVersion"
          >
        >;
        const p = persisted as P | undefined;
        const unlockedRaw = sanitizeUnlockedChain(p?.unlockedFactIds);
        const entriesRaw = sanitizeEntries(p?.entriesById);
        const readRaw = sanitizeRead(p?.readFactIds);
        const rec = reconcile(unlockedRaw, entriesRaw);
        return {
          ...current,
          lorePersistVersion: LORE_JOURNAL_PERSIST_SCHEMA_VERSION,
          unlockedFactIds: rec.unlockedFactIds,
          entriesById: rec.entriesById,
          readFactIds: readRaw,
        };
      },
    }
  )
);

/** Стереть сейв дневника (новая игра). */
export function resetLoreJournalToNewGame(): void {
  try {
    useLoreJournalStore.persist?.clearStorage?.();
  } catch {
    /* storage может быть недоступен */
  }
  useLoreJournalStore.setState({
    lorePersistVersion: LORE_JOURNAL_PERSIST_SCHEMA_VERSION,
    unlockedFactIds: [],
    entriesById: {},
    readFactIds: {},
  });
}

export function waitForLoreJournalHydration(): Promise<void> {
  return new Promise((resolve) => {
    const p = useLoreJournalStore.persist;
    if (p.hasHydrated()) {
      resolve();
      return;
    }
    const unsub = p.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}
