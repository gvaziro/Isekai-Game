"use client";

import {
  getPlayerAttackCooldownMs,
  getPlayerEvadeChance,
} from "@/src/game/data/balance";
import { getDerivedCombatStats } from "@/src/game/rpg/derivedStats";
import type { AttrKey } from "@/src/game/rpg/characterAttributes";
import { useGameStore } from "@/src/game/state/gameStore";

const ATTR_ROWS: Array<{
  key: AttrKey;
  label: string;
  hint: string;
}> = [
  {
    key: "str",
    label: "Сила",
    hint: "Урон в ближнем бою (ATK).",
  },
  {
    key: "agi",
    label: "Ловкость",
    hint: "Шанс уклонения от удара моба; немного ускоряет атаку.",
  },
  {
    key: "vit",
    label: "Живучесть",
    hint: "Запас здоровья (max HP).",
  },
  {
    key: "tgh",
    label: "Стойкость",
    hint: "Снижает получаемый урон (DEF).",
  },
  {
    key: "end",
    label: "Выносливость",
    hint: "Запас стамины (бег и нагрузка).",
  },
  {
    key: "mob",
    label: "Скорость",
    hint: "Бег и заметное ускорение атаки.",
  },
];

export default function LevelStatOverlay() {
  const character = useGameStore((s) => s.character);
  const equipped = useGameStore((s) => s.equipped);
  const originBonus = useGameStore((s) =>
    s.isekaiOrigin?.completed === true ? s.isekaiOrigin.bonus : undefined
  );
  const allocateStatPoint = useGameStore((s) => s.allocateStatPoint);
  const deallocateStatPoint = useGameStore((s) => s.deallocateStatPoint);

  const pool = character.unspentStatPoints;
  const derived = getDerivedCombatStats(
    character.level,
    equipped,
    originBonus,
    character.attrs
  );
  const atkCd = getPlayerAttackCooldownMs(character.attrs);
  const evadeVs3 = Math.round(
    getPlayerEvadeChance(character.attrs.agi, 3) * 1000
  ) / 10;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[110] flex flex-col items-center justify-center bg-black/82 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="level-stat-title"
    >
      <div className="w-full max-w-md rounded-xl border border-amber-800/50 bg-zinc-950/97 p-5 shadow-2xl">
        <h2
          id="level-stat-title"
          className="text-center text-lg font-semibold text-amber-100"
        >
          Новый уровень
        </h2>
        <p className="mt-2 text-center text-xs leading-relaxed text-zinc-400">
          Распределите очки характеристик. Осталось:{" "}
          <span className="font-mono font-semibold text-amber-200">{pool}</span>
          . Пока очки не потрачены, окно не закроется.
        </p>

        <ul className="mt-4 flex flex-col gap-2">
          {ATTR_ROWS.map((row) => {
            const v = character.attrs[row.key];
            const min = character.attrsMin[row.key];
            const canMinus = v > min;
            const canPlus = pool > 0;
            return (
              <li
                key={row.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-100">
                    {row.label}
                  </div>
                  <div className="text-[10px] text-zinc-500" title={row.hint}>
                    {row.hint}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={!canMinus}
                    className="h-8 w-8 rounded border border-zinc-600 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Убрать очко: ${row.label}`}
                    onClick={() => deallocateStatPoint(row.key)}
                  >
                    −
                  </button>
                  <span className="min-w-[2rem] text-center font-mono text-sm text-amber-100">
                    {v}
                  </span>
                  <button
                    type="button"
                    disabled={!canPlus}
                    className="h-8 w-8 rounded border border-amber-800/60 text-sm font-semibold text-amber-100 hover:bg-amber-950/50 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Добавить очко: ${row.label}`}
                    onClick={() => allocateStatPoint(row.key)}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-4 rounded-md border border-zinc-800/80 bg-zinc-900/50 px-2 py-2 font-mono text-[10px] leading-relaxed text-zinc-400">
          Сводка: HP {derived.maxHp} · STA {derived.maxSta} · ATK {derived.atk} ·
          DEF {derived.def} · SPD {derived.spd} · кд атаки {atkCd} мс · пример
          уклонения vs ур.3 моба: ~{evadeVs3}%
        </p>
      </div>
    </div>
  );
}
