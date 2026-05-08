import { create } from "zustand";
import { persist } from "zustand/middleware";
import { QUEST_CHAIN_IDS, QUESTS_BY_ID } from "@/src/game/data/quests";
import {
  tickQuestState,
  sumInventoryQty,
  type ActiveQuestProgress,
  type QuestEvalContext,
  type QuestRuntimeEvent,
} from "@/src/game/systems/questEngine";
import { useGameStore } from "@/src/game/state/gameStore";

/** Версия формата отдельного стора квестов (не путать с SAVE_VERSION игры). */
export const QUEST_PERSIST_SCHEMA_VERSION = 1;

function pickNextActive(completedIds: readonly string[]): ActiveQuestProgress | null {
  for (const id of QUEST_CHAIN_IDS) {
    if (!completedIds.includes(id)) {
      return { questId: id, stageIndex: 0 };
    }
  }
  return null;
}

function sanitizeActive(
  a: ActiveQuestProgress | null | undefined
): ActiveQuestProgress | null {
  if (!a) return null;
  const q = QUESTS_BY_ID[a.questId];
  if (!a.questId || !q) return null;
  if (a.stageIndex < 0 || a.stageIndex >= q.stages.length) return null;
  return { questId: a.questId, stageIndex: a.stageIndex };
}

function buildContext(): QuestEvalContext | null {
  if (typeof window === "undefined") return null;
  const gs = useGameStore.getState();
  const slots = gs.inventorySlots;
  return {
    playerX: gs.player.x,
    playerY: gs.player.y,
    inventoryCount: (curatedId: string) => sumInventoryQty(slots, curatedId),
    dungeonMaxClearedFloor: Math.max(
      0,
      Math.floor(gs.dungeonMaxClearedFloor ?? 0)
    ),
  };
}

export type QuestStoreState = {
  questPersistVersion: number;
  active: ActiveQuestProgress | null;
  completedQuestIds: string[];
  /** Обработать игровое событие цепочки квестов */
  ingestEvent: (ev?: QuestRuntimeEvent) => void;
};

export const useQuestStore = create<QuestStoreState>()(
  persist(
    (set, get) => ({
      questPersistVersion: QUEST_PERSIST_SCHEMA_VERSION,
      active: null,
      completedQuestIds: [],

      ingestEvent: (ev) => {
        const ctx = buildContext();
        if (!ctx) return;

        const st = get();
        let active = sanitizeActive(st.active);
        let completed = [...st.completedQuestIds];

        const r = tickQuestState(
          QUESTS_BY_ID,
          active,
          completed,
          ctx,
          ev
        );

        active = sanitizeActive(r.active);
        completed = r.completedQuestIds;

        if (!active) {
          active = pickNextActive(completed);
        }

        const prevCompleted = st.completedQuestIds;

        set({
          active,
          completedQuestIds: completed,
        });

        if (
          typeof window !== "undefined" &&
          JSON.stringify(completed) !== JSON.stringify(prevCompleted)
        ) {
          window.dispatchEvent(
            new CustomEvent("nagibatop-achievements-reevaluate")
          );
        }

        const beforeDone = new Set(st.completedQuestIds);

        if (r.stageCompleteMessages.length > 0) {
          for (const msg of r.stageCompleteMessages) {
            window.dispatchEvent(
              new CustomEvent("nagibatop:quest-stage-complete", {
                detail: { message: msg },
              })
            );
          }
        }

        for (const qid of r.completedQuestIds) {
          if (!beforeDone.has(qid)) {
            const q = QUESTS_BY_ID[qid];
            if (q) {
              window.dispatchEvent(
                new CustomEvent("nagibatop-toast", {
                  detail: { message: `Квест завершён: ${q.title}` },
                })
              );
            }
          }
        }
      },
    }),
    {
      name: "nagibatop-quest-v1",
      version: QUEST_PERSIST_SCHEMA_VERSION,
      partialize: (s) => ({
        questPersistVersion: s.questPersistVersion,
        active: s.active,
        completedQuestIds: s.completedQuestIds,
      }),
      merge: (persisted, current) => {
        type P = Partial<
          Pick<QuestStoreState, "active" | "completedQuestIds" | "questPersistVersion">
        >;
        const p = persisted as P | undefined;
        const completed = Array.isArray(p?.completedQuestIds)
          ? [...p.completedQuestIds]
          : [];
        let active = sanitizeActive(p?.active ?? null);
        if (!active) active = pickNextActive(completed);
        return {
          ...current,
          questPersistVersion: QUEST_PERSIST_SCHEMA_VERSION,
          completedQuestIds: completed,
          active,
        };
      },
    }
  )
);

/** Стереть сейв квестов и начать цепочку с первого квеста. */
export function resetQuestsToNewGame(): void {
  useQuestStore.persist.clearStorage();
  useQuestStore.setState({
    questPersistVersion: QUEST_PERSIST_SCHEMA_VERSION,
    completedQuestIds: [],
    active: pickNextActive([]),
  });
}

export function waitForQuestStoreHydration(): Promise<void> {
  return new Promise((resolve) => {
    const p = useQuestStore.persist;
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

/** Подписки на window и gameStore — вызывать один раз на клиенте (GameRoot). */
export function mountQuestEventBridge(): () => void {
  const onDialogueClose = (e: Event) => {
    const ce = e as CustomEvent<{ npcId?: string }>;
    const npcId = ce.detail?.npcId;
    if (!npcId) return;
    useQuestStore.getState().ingestEvent({
      type: "dialogue_close",
      npcId,
    });
  };

  const onChest = (e: Event) => {
    const ce = e as CustomEvent<{ chestId?: string }>;
    const chestId = ce.detail?.chestId;
    if (!chestId) return;
    useQuestStore.getState().ingestEvent({
      type: "chest_opened",
      chestId,
    });
  };

  const onEnemy = (e: Event) => {
    const ce = e as CustomEvent<{ enemyId?: string }>;
    const enemyId = ce.detail?.enemyId;
    if (!enemyId) return;
    useQuestStore.getState().ingestEvent({
      type: "enemy_defeated",
      enemyId,
    });
  };

  window.addEventListener("nagibatop:dialogue-close", onDialogueClose);
  window.addEventListener("nagibatop:chest-opened", onChest);
  window.addEventListener("nagibatop:enemy-defeated", onEnemy);

  let snap = useGameStore.getState();
  const unsubGame = useGameStore.subscribe((s) => {
    const invChanged = s.inventorySlots !== snap.inventorySlots;
    const dungeonProg =
      s.dungeonMaxClearedFloor !== snap.dungeonMaxClearedFloor;
    const { x, y } = s.player;
    const moved =
      Math.hypot(x - snap.player.x, y - snap.player.y) >
      (invChanged ? 0 : 4);
    snap = s;
    if (invChanged || dungeonProg) {
      useQuestStore.getState().ingestEvent({ type: "reevaluate" });
      return;
    }
    if (moved) {
      useQuestStore.getState().ingestEvent({
        type: "player_moved",
        x,
        y,
      });
    }
  });

  useQuestStore.getState().ingestEvent({ type: "reevaluate" });

  return () => {
    window.removeEventListener("nagibatop:dialogue-close", onDialogueClose);
    window.removeEventListener("nagibatop:chest-opened", onChest);
    window.removeEventListener("nagibatop:enemy-defeated", onEnemy);
    unsubGame();
  };
}
