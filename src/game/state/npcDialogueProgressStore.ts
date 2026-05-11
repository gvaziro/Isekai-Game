import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getClientPersistJsonStorage } from "@/src/game/saves/electronProfileStateStorage";
import type {
  CompletedNpcIntroById,
  CompletedNpcIntroRecord,
} from "@/src/game/data/npcDialogueProgress";

export const NPC_DIALOGUE_PROGRESS_PERSIST_SCHEMA_VERSION = 1;

export type NpcDialogueProgressStoreState = {
  npcDialogueProgressPersistVersion: number;
  completedIntroByNpcId: CompletedNpcIntroById;
  markNpcIntroCompleted: (npcId: string, version: number) => void;
};

function sanitizeCompletedIntroByNpcId(raw: unknown): CompletedNpcIntroById {
  if (!raw || typeof raw !== "object") return {};
  const out: CompletedNpcIntroById = {};
  for (const [npcIdRaw, value] of Object.entries(raw)) {
    const npcId = npcIdRaw.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(npcId)) continue;
    if (!value || typeof value !== "object") continue;
    const record = value as Partial<CompletedNpcIntroRecord>;
    if (
      typeof record.version !== "number" ||
      !Number.isInteger(record.version) ||
      record.version < 1
    ) {
      continue;
    }
    out[npcId] = {
      version: record.version,
      completedAt:
        typeof record.completedAt === "number" &&
        Number.isFinite(record.completedAt)
          ? record.completedAt
          : Date.now(),
    };
  }
  return out;
}

export const useNpcDialogueProgressStore =
  create<NpcDialogueProgressStoreState>()(
    persist(
      (set, get) => ({
        npcDialogueProgressPersistVersion:
          NPC_DIALOGUE_PROGRESS_PERSIST_SCHEMA_VERSION,
        completedIntroByNpcId: {},

        markNpcIntroCompleted: (npcId, version) => {
          const rid = npcId.trim();
          if (!rid || !Number.isInteger(version) || version < 1) return;
          const current = get().completedIntroByNpcId;
          if (current[rid]?.version === version) return;
          set({
            completedIntroByNpcId: {
              ...current,
              [rid]: { version, completedAt: Date.now() },
            },
          });
        },
      }),
      {
        name: "last-summon-npc-dialogue-progress-v1",
        storage: getClientPersistJsonStorage(),
        version: NPC_DIALOGUE_PROGRESS_PERSIST_SCHEMA_VERSION,
        partialize: (s) => ({
          npcDialogueProgressPersistVersion:
            s.npcDialogueProgressPersistVersion,
          completedIntroByNpcId: s.completedIntroByNpcId,
        }),
        merge: (persisted, current) => {
          type P = Partial<
            Pick<
              NpcDialogueProgressStoreState,
              | "npcDialogueProgressPersistVersion"
              | "completedIntroByNpcId"
            >
          >;
          const p = persisted as P | undefined;
          return {
            ...current,
            npcDialogueProgressPersistVersion:
              NPC_DIALOGUE_PROGRESS_PERSIST_SCHEMA_VERSION,
            completedIntroByNpcId: sanitizeCompletedIntroByNpcId(
              p?.completedIntroByNpcId
            ),
          };
        },
      }
    )
  );

export function resetNpcDialogueProgressToNewGame(): void {
  try {
    useNpcDialogueProgressStore.persist?.clearStorage?.();
  } catch {
    /* storage can be unavailable in tests or private browsing */
  }
  useNpcDialogueProgressStore.setState({
    npcDialogueProgressPersistVersion:
      NPC_DIALOGUE_PROGRESS_PERSIST_SCHEMA_VERSION,
    completedIntroByNpcId: {},
  });
}

export function waitForNpcDialogueProgressHydration(): Promise<void> {
  return new Promise((resolve) => {
    const p = useNpcDialogueProgressStore.persist;
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
