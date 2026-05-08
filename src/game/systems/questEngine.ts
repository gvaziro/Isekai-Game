import type { InventoryStack } from "@/src/game/state/gameStore";
import type { QuestDef, QuestObjective } from "@/src/game/data/schemas/quest";

export type QuestEvalContext = {
  playerX: number;
  playerY: number;
  inventoryCount: (curatedId: string) => number;
  /** Макс. полностью зачищенный этаж катакомб (после убийства босса этажа). */
  dungeonMaxClearedFloor: number;
};

export type QuestRuntimeEvent =
  | { type: "dialogue_close"; npcId: string }
  | { type: "chest_opened"; chestId: string }
  | { type: "enemy_defeated"; enemyId: string }
  | { type: "player_moved"; x: number; y: number }
  | { type: "reevaluate" };

export type ActiveQuestProgress = {
  questId: string;
  stageIndex: number;
};

export type QuestTickResult = {
  active: ActiveQuestProgress | null;
  completedQuestIds: string[];
  stageCompleteMessages: string[];
  questJustCompleted: boolean;
};

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

export function sumInventoryQty(
  slots: (InventoryStack | null)[],
  curatedId: string
): number {
  let n = 0;
  for (const s of slots) {
    if (s && s.curatedId === curatedId) n += s.qty;
  }
  return n;
}

function evalObjective(
  o: QuestObjective,
  ctx: QuestEvalContext,
  ev?: QuestRuntimeEvent
): boolean {
  switch (o.kind) {
    case "talk_to":
      return ev?.type === "dialogue_close" && ev.npcId === o.npcId;
    case "bring_item":
      return ctx.inventoryCount(o.curatedId) >= o.qty;
    case "open_chest":
      return ev?.type === "chest_opened" && ev.chestId === o.chestId;
    case "kill":
      return ev?.type === "enemy_defeated" && ev.enemyId === o.enemyId;
    case "reach_point": {
      if (ev?.type === "player_moved") {
        return dist(ev.x, ev.y, o.x, o.y) <= o.radius;
      }
      return dist(ctx.playerX, ctx.playerY, o.x, o.y) <= o.radius;
    }
    case "dungeon_cleared_to_floor":
      return ctx.dungeonMaxClearedFloor >= o.floor;
    default:
      return false;
  }
}

/**
 * Выполнена ли текущая цель стадии.
 */
export function isCurrentStageComplete(
  quest: QuestDef,
  stageIndex: number,
  ctx: QuestEvalContext,
  ev?: QuestRuntimeEvent
): boolean {
  const stage = quest.stages[stageIndex];
  if (!stage) return false;
  const o = stage.objective;

  if (o.kind === "bring_item") {
    return ctx.inventoryCount(o.curatedId) >= o.qty;
  }

  if (o.kind === "reach_point") {
    if (ev?.type === "player_moved") {
      return dist(ev.x, ev.y, o.x, o.y) <= o.radius;
    }
    return dist(ctx.playerX, ctx.playerY, o.x, o.y) <= o.radius;
  }

  if (o.kind === "dungeon_cleared_to_floor") {
    return ctx.dungeonMaxClearedFloor >= o.floor;
  }

  if (!ev || ev.type === "reevaluate") return false;

  return evalObjective(o, ctx, ev);
}

/**
 * Один шаг: при выполнении стадии увеличивает индекс или закрывает квест.
 */
export function reduceQuestProgress(
  questById: Record<string, QuestDef>,
  active: ActiveQuestProgress | null,
  completedQuestIds: readonly string[],
  ctx: QuestEvalContext,
  ev?: QuestRuntimeEvent
): QuestTickResult {
  const completed = [...completedQuestIds];
  const stageCompleteMessages: string[] = [];
  let questJustCompleted = false;

  if (!active) {
    return {
      active: null,
      completedQuestIds: completed,
      stageCompleteMessages,
      questJustCompleted,
    };
  }

  const quest = questById[active.questId];
  if (!quest) {
    return {
      active: null,
      completedQuestIds: completed,
      stageCompleteMessages,
      questJustCompleted,
    };
  }

  const stageIndex = active.stageIndex;
  if (stageIndex < 0 || stageIndex >= quest.stages.length) {
    return {
      active: null,
      completedQuestIds: completed,
      stageCompleteMessages,
      questJustCompleted,
    };
  }

  if (!isCurrentStageComplete(quest, stageIndex, ctx, ev)) {
    return {
      active: { questId: active.questId, stageIndex },
      completedQuestIds: completed,
      stageCompleteMessages,
      questJustCompleted,
    };
  }

  const cur = quest.stages[stageIndex];
  stageCompleteMessages.push(`Выполнено: ${cur.summary}`);

  if (stageIndex + 1 >= quest.stages.length) {
    if (!completed.includes(quest.id)) completed.push(quest.id);
    questJustCompleted = true;
    return {
      active: null,
      completedQuestIds: completed,
      stageCompleteMessages,
      questJustCompleted,
    };
  }

  return {
    active: { questId: quest.id, stageIndex: stageIndex + 1 },
    completedQuestIds: completed,
    stageCompleteMessages,
    questJustCompleted,
  };
}

/**
 * Цепочка шагов: после прогресса по событию подхватываем уже выполненные
 * стадии (например игрок уже стоит в зоне reach при завершении talk_to).
 */
export function tickQuestState(
  questById: Record<string, QuestDef>,
  active: ActiveQuestProgress | null,
  completedQuestIds: readonly string[],
  ctx: QuestEvalContext,
  ev?: QuestRuntimeEvent
): QuestTickResult {
  let a = active;
  let c = [...completedQuestIds];
  const msgs: string[] = [];
  let qJust = false;
  let nextEv: QuestRuntimeEvent | undefined = ev;

  for (let i = 0; i < 24; i++) {
    const step = reduceQuestProgress(questById, a, c, ctx, nextEv);
    a = step.active;
    c = step.completedQuestIds;
    msgs.push(...step.stageCompleteMessages);
    qJust = qJust || step.questJustCompleted;
    if (!a) break;
    if (step.stageCompleteMessages.length === 0 && !step.questJustCompleted) {
      break;
    }
    nextEv = { type: "reevaluate" };
  }

  return {
    active: a,
    completedQuestIds: c,
    stageCompleteMessages: msgs,
    questJustCompleted: qJust,
  };
}
