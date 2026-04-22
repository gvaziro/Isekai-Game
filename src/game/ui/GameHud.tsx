"use client";

import { BUFFS, xpToNext } from "@/src/game/data/balance";
import { useGameStore } from "@/src/game/state/gameStore";
import { getDerivedCombatStats } from "@/src/game/rpg/derivedStats";

function Bar({
  label,
  current,
  max,
  colorClass,
}: {
  label: string;
  current: number;
  max: number;
  colorClass: string;
}) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((current / max) * 100));
  return (
    <div className="flex min-w-[140px] flex-col gap-0.5">
      <div className="flex justify-between text-[9px] uppercase tracking-wide text-zinc-500">
        <span>{label}</span>
        <span className="font-mono text-zinc-400">
          {Math.ceil(current)} / {max}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-700">
        <div
          className={`h-full rounded-full transition-[width] duration-150 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function GameHud({ preview }: { preview: boolean }) {
  const character = useGameStore((s) => s.character);
  const equipped = useGameStore((s) => s.equipped);
  const originBonus = useGameStore((s) =>
    s.isekaiOrigin?.completed === true ? s.isekaiOrigin.bonus : undefined
  );
  const d = getDerivedCombatStats(
    character.level,
    equipped,
    originBonus,
    character.attrs
  );
  const needXp = xpToNext(character.level);
  const xpPct =
    needXp <= 0 ? 100 : Math.min(100, Math.round((character.xp / needXp) * 100));

  if (preview) return null;

  return (
    <div className="pointer-events-none absolute left-2 top-12 z-30 flex min-w-[min(92vw,280px)] flex-col gap-2 rounded-lg border border-zinc-700/90 bg-zinc-950/92 px-3 py-2 shadow-lg backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-emerald-300">
          Ур. {character.level}
        </span>
        <span className="font-mono text-[10px] text-zinc-500">
          ATK {d.atk} · DEF {d.def} · SPD {d.spd} · LCK {d.luck}
          {character.unspentStatPoints > 0 ? (
            <span className="text-amber-400">
              {" "}
              · очки: {character.unspentStatPoints}
            </span>
          ) : null}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 rounded border border-amber-900/40 bg-amber-950/35 px-2 py-1 text-[10px] text-amber-100/95">
        <span className="uppercase tracking-wide text-amber-600/90">Золото</span>
        <span className="font-mono tabular-nums font-semibold">
          {Math.floor(character.gold ?? 0)}
        </span>
      </div>
      {character.buffs.length > 0 ? (
        <div className="flex flex-wrap gap-1 border-b border-zinc-800/80 pb-1.5">
          {character.buffs.map((b) => {
            const def = BUFFS[b.id];
            const label = def?.label ?? b.id;
            return (
              <span
                key={b.id}
                className="rounded border border-cyan-900/60 bg-cyan-950/45 px-1.5 py-0.5 text-[8px] text-cyan-200/95"
                title={label}
              >
                {label} ·{Math.max(0, Math.ceil(b.remainingSec))}с
              </span>
            );
          })}
        </div>
      ) : null}
      <Bar
        label="HP"
        current={character.hp}
        max={d.maxHp}
        colorClass="bg-red-600/90"
      />
      <Bar
        label="Стамина"
        current={character.sta}
        max={d.maxSta}
        colorClass="bg-amber-500/90"
      />
      <div className="flex min-w-[140px] flex-col gap-0.5">
        <div className="flex justify-between text-[9px] uppercase tracking-wide text-zinc-500">
          <span>Опыт</span>
          <span className="font-mono text-zinc-400">
            {Math.floor(character.xp)} / {needXp}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800 ring-1 ring-zinc-700">
          <div
            className="h-full rounded-full bg-violet-500/90 transition-[width] duration-150"
            style={{ width: `${xpPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
