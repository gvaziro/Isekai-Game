"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getAchievementById } from "@/src/game/data/achievements";
import type { AchievementTreeChild } from "@/src/game/data/achievementTree";
import { ACHIEVEMENT_TREE } from "@/src/game/data/achievementTree";
import {
  buildAchievementSnapshot,
  getAchievementProgressForDef,
  type AchievementProgress,
  type AchievementSnapshot,
} from "@/src/game/systems/achievementEngine";
import { useGameStore } from "@/src/game/state/gameStore";
import { useQuestStore } from "@/src/game/state/questStore";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";

function countLeavesProgress(
  children: AchievementTreeChild[],
  unlocked: Readonly<Record<string, number>>
): { total: number; done: number } {
  let total = 0;
  let done = 0;
  const walk = (n: AchievementTreeChild) => {
    if (n.kind === "leaf") {
      total++;
      if (unlocked[n.achievementId] !== undefined) done++;
    } else for (const c of n.children) walk(c);
  };
  for (const c of children) walk(c);
  return { total, done };
}

function collectGroupIds(nodes: AchievementTreeChild[]): string[] {
  const ids: string[] = [];
  const walk = (n: AchievementTreeChild) => {
    if (n.kind === "group") {
      ids.push(n.id);
      for (const c of n.children) walk(c);
    }
  };
  for (const n of nodes) walk(n);
  return ids;
}

function AchievementProgressBar({ prog }: { prog: AchievementProgress }) {
  const pct = Math.min(100, Math.max(0, Math.round(prog.percent)));
  const labelRight = prog.isCompoundMin
    ? `${pct}%`
    : `${prog.current} / ${prog.target}`;
  return (
    <div className="mt-2">
      <div className="mb-0.5 flex justify-between text-[10px] text-[#5c5244]">
        <span>
          {prog.isCompoundMin ? "Мин. среди условий" : "До цели"}
        </span>
        <span className="font-mono tabular-nums text-[#3d2914]">{labelRight}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#d4c8b0] ring-1 ring-[#b8a88c]/80">
        <div
          className="h-full rounded-full bg-[#2d6d4f]/90 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function TreeBranch({
  node,
  depth,
  expanded,
  toggle,
  unlockedAchievements,
  snap,
}: {
  node: AchievementTreeChild;
  depth: number;
  expanded: ReadonlySet<string>;
  toggle: (groupId: string) => void;
  unlockedAchievements: Readonly<Record<string, number>>;
  snap: AchievementSnapshot;
}) {
  const pad = Math.min(6, depth) * 12;

  if (node.kind === "group") {
    const open = expanded.has(node.id);
    const leaves = countLeavesProgress(node.children, unlockedAchievements);

    return (
      <li className="list-none">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded border border-[#5c4a32]/35 bg-[rgba(42,36,28,0.05)] py-1.5 pl-2 pr-2 text-left text-sm transition-colors hover:bg-[rgba(42,36,28,0.1)]"
          style={{ marginLeft: pad }}
          onClick={() => toggle(node.id)}
          aria-expanded={open}
        >
          <span className="w-4 shrink-0 font-mono text-[#6b5d4a]">
            {open ? "▼" : "▶"}
          </span>
          <span className="font-semibold text-[#3d2914]">{node.title}</span>
          <span className="ml-auto font-mono text-[11px] text-[#7a6e5c]">
            {leaves.done}/{leaves.total}
          </span>
        </button>
        {open ? (
          <ul className="mt-1 space-y-1 border-l border-[#c9b89a]/70 pl-2">
            {node.children.map((ch, i) => (
              <TreeBranch
                key={ch.kind === "group" ? ch.id : `${ch.achievementId}-${i}`}
                node={ch}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                unlockedAchievements={unlockedAchievements}
                snap={snap}
              />
            ))}
          </ul>
        ) : null}
      </li>
    );
  }

  const def = getAchievementById(node.achievementId);
  const ts = unlockedAchievements[node.achievementId];
  const ok = ts !== undefined;
  const title = def?.title ?? node.achievementId;
  const desc = def?.description ?? "";
  const prog =
    !ok && def ? getAchievementProgressForDef(def, snap) : null;

  return (
    <li className="list-none" style={{ marginLeft: pad }}>
      <div
        className={`rounded border px-2.5 py-2 text-sm ${
          ok
            ? "border-[#1b6b52]/45 bg-[#e8f5ef]/90"
            : "border-[#b8a88c]/70 bg-[#f0ebe0]/70"
        }`}
      >
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 shrink-0 text-base leading-none"
            aria-hidden
          >
            {ok ? "✓" : "○"}
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-[#2a241c]">{title}</div>
            <div className="mt-0.5 text-xs leading-snug text-[#5c5244]">
              {desc}
            </div>
            {ok ? (
              <div className="mt-1 font-mono text-[10px] text-[#3d6b52]">
                {new Date(ts).toLocaleString(undefined, {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </div>
            ) : prog ? (
              <AchievementProgressBar prog={prog} />
            ) : (
              <div className="mt-1 text-[10px] text-[#8a7d6c]">
                Прогресс недоступен для этого условия.
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function AchievementsTreeOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const unlockedAchievements = useGameStore((s) => s.unlockedAchievements);
  const lifetimeStats = useGameStore((s) => s.lifetimeStats);
  const level = useGameStore((s) => s.character.level);
  const dungeonMax = useGameStore((s) => s.dungeonMaxClearedFloor);
  const questsDone = useQuestStore((s) => s.completedQuestIds.length);

  const snap = useMemo(
    () =>
      buildAchievementSnapshot({
        lifetimeStats,
        characterLevel: level,
        dungeonMaxClearedFloor: dungeonMax,
        questsCompleted: questsDone,
      }),
    [lifetimeStats, level, dungeonMax, questsDone]
  );

  const totalUnlocked = Object.keys(unlockedAchievements).length;
  const leafTotal = useMemo(
    () => countLeavesProgress(ACHIEVEMENT_TREE, {}).total,
    []
  );

  const allGroupIds = useMemo(() => collectGroupIds(ACHIEVEMENT_TREE), []);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(allGroupIds)
  );

  useEffect(() => {
    if (open) setExpanded(new Set(allGroupIds));
  }, [open, allGroupIds]);

  const toggle = useCallback((groupId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <PaperModalChrome title="Достижения" onClose={onClose}>
      <div className="flex min-h-0 max-h-[min(72vh,520px)] flex-col gap-2">
        <p className="shrink-0 text-xs text-[#6b5d4a]">
          Разблокировано:{" "}
          <span className="font-mono font-semibold text-[#3d2914]">
            {totalUnlocked}/{leafTotal}
          </span>
        </p>
        <div className="paper-scroll min-h-0 flex-1 overflow-y-auto pr-1">
          <ul className="space-y-2">
            {ACHIEVEMENT_TREE.map((node) => (
              <TreeBranch
                key={node.kind === "group" ? node.id : node.achievementId}
                node={node}
                depth={0}
                expanded={expanded}
                toggle={toggle}
                unlockedAchievements={unlockedAchievements}
                snap={snap}
              />
            ))}
          </ul>
        </div>
        <p className="shrink-0 border-t border-[#5c4a32]/25 pt-2 text-center text-[10px] text-[#5c5346] sm:text-[11px]">
          <kbd className="rounded border border-[#5a5346]/60 bg-[#f4ecd8] px-1 font-mono text-[#2a241c]">
            H
          </kbd>{" "}
          — открыть / закрыть · ветки можно сворачивать
        </p>
      </div>
    </PaperModalChrome>
  );
}
