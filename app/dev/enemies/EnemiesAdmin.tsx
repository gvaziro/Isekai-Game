"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ENEMY_DEFAULT_KEY,
  type EnemyDef,
  computeEnemyScaledStatsFromDef,
} from "@/src/game/data/enemies";
import {
  xpEnemyKill,
  xpEnemyKillForPlayer,
} from "@/src/game/data/balance";
import { mobPortraitMeta } from "@/src/game/data/mobPortraitUrls";

const PREVIEW_LEVELS = [1, 5, 10, 20, 50, 99] as const;

type EnemiesFile = {
  updatedAt?: string;
  enemies: Record<string, EnemyDef>;
};

type RowState = {
  rowKey: string;
  id: string;
  label: string;
  hp: string;
  atk: string;
  armor: string;
  speed: string;
  attackRange: string;
  attackCooldownMs: string;
  hpLinear: string;
  hpQuad: string;
  atkPerLevel: string;
  armorPerLevel: string;
  speedPerLevel: string;
  speedCap: string;
  attackRangePerLevelInv: string;
  cooldownDecayPerLevel: string;
  cooldownDecayLevelCap: string;
  cooldownMin: string;
  aggroRadius: string;
  loseAggroRadius: string;
  leashRadius: string;
  respawnMs: string;
  archived: boolean;
};

function sortEnemyIds(ids: string[]): string[] {
  const rest = ids.filter((id) => id !== ENEMY_DEFAULT_KEY).sort((a, b) =>
    a.localeCompare(b, "en")
  );
  return ids.includes(ENEMY_DEFAULT_KEY)
    ? [ENEMY_DEFAULT_KEY, ...rest]
    : rest;
}

function orderedEnemyRowIds(enemies: Record<string, EnemyDef>): string[] {
  const active: string[] = [];
  const archived: string[] = [];
  for (const id of Object.keys(enemies)) {
    if (enemies[id]?.archived) archived.push(id);
    else active.push(id);
  }
  const sortedActive = sortEnemyIds(active);
  archived.sort((a, b) => a.localeCompare(b, "en"));
  return [...sortedActive, ...archived];
}

function rowFromEntry(id: string, def: EnemyDef): RowState {
  return {
    rowKey: id,
    id,
    label: def.label,
    hp: String(def.base.hp),
    atk: String(def.base.atk),
    armor: String(def.base.armor),
    speed: String(def.base.speed),
    attackRange: String(def.base.attackRange),
    attackCooldownMs: String(def.base.attackCooldownMs),
    hpLinear: String(def.scaling.hpLinear),
    hpQuad: String(def.scaling.hpQuad),
    atkPerLevel: String(def.scaling.atkPerLevel),
    armorPerLevel: String(def.scaling.armorPerLevel),
    speedPerLevel: String(def.scaling.speedPerLevel),
    speedCap: String(def.scaling.speedCap),
    attackRangePerLevelInv: String(def.scaling.attackRangePerLevelInv),
    cooldownDecayPerLevel: String(def.scaling.cooldownDecayPerLevel),
    cooldownDecayLevelCap: String(def.scaling.cooldownDecayLevelCap),
    cooldownMin: String(def.scaling.cooldownMin),
    aggroRadius: String(def.ai.aggroRadius),
    loseAggroRadius: String(def.ai.loseAggroRadius),
    leashRadius: String(def.ai.leashRadius),
    respawnMs: String(def.respawnMs),
    archived: Boolean(def.archived),
  };
}

function parseIntStrict(s: string, field: string): number | { error: string } {
  const t = s.trim().replace(",", ".");
  if (t === "") return { error: `Пустое поле: ${field}` };
  const n = Number(t);
  if (!Number.isFinite(n)) return { error: `Не число: ${field}` };
  return Math.floor(n);
}

function parseFloatStrict(s: string, field: string): number | { error: string } {
  const t = s.trim().replace(",", ".");
  if (t === "") return { error: `Пустое поле: ${field}` };
  const n = Number(t);
  if (!Number.isFinite(n)) return { error: `Не число: ${field}` };
  return n;
}

function rowToEnemyDef(
  r: RowState
): { ok: true; def: EnemyDef } | { ok: false; error: string } {
  const label = r.label.trim();
  if (!label) return { ok: false, error: `Пустая подпись у «${r.id}»` };

  const hp = parseIntStrict(r.hp, "HP");
  if (typeof hp === "object") return { ok: false, error: `${r.id}: ${hp.error}` };
  const atk = parseIntStrict(r.atk, "ATK");
  if (typeof atk === "object") return { ok: false, error: `${r.id}: ${atk.error}` };
  const armor = parseIntStrict(r.armor, "броня");
  if (typeof armor === "object")
    return { ok: false, error: `${r.id}: ${armor.error}` };
  const speed = parseIntStrict(r.speed, "скорость");
  if (typeof speed === "object")
    return { ok: false, error: `${r.id}: ${speed.error}` };
  const attackRange = parseIntStrict(r.attackRange, "дальность");
  if (typeof attackRange === "object")
    return { ok: false, error: `${r.id}: ${attackRange.error}` };
  const attackCooldownMs = parseIntStrict(r.attackCooldownMs, "КД атаки");
  if (typeof attackCooldownMs === "object")
    return { ok: false, error: `${r.id}: ${attackCooldownMs.error}` };

  const hpLinear = parseFloatStrict(r.hpLinear, "hpLinear");
  if (typeof hpLinear === "object")
    return { ok: false, error: `${r.id}: ${hpLinear.error}` };
  const hpQuad = parseFloatStrict(r.hpQuad, "hpQuad");
  if (typeof hpQuad === "object")
    return { ok: false, error: `${r.id}: ${hpQuad.error}` };
  const atkPerLevel = parseFloatStrict(r.atkPerLevel, "atkPerLevel");
  if (typeof atkPerLevel === "object")
    return { ok: false, error: `${r.id}: ${atkPerLevel.error}` };
  const armorPerLevel = parseFloatStrict(r.armorPerLevel, "armorPerLevel");
  if (typeof armorPerLevel === "object")
    return { ok: false, error: `${r.id}: ${armorPerLevel.error}` };
  const speedPerLevel = parseFloatStrict(r.speedPerLevel, "speedPerLevel");
  if (typeof speedPerLevel === "object")
    return { ok: false, error: `${r.id}: ${speedPerLevel.error}` };
  const speedCap = parseIntStrict(r.speedCap, "speedCap");
  if (typeof speedCap === "object")
    return { ok: false, error: `${r.id}: ${speedCap.error}` };
  const attackRangePerLevelInv = parseIntStrict(
    r.attackRangePerLevelInv,
    "attackRangePerLevelInv"
  );
  if (typeof attackRangePerLevelInv === "object")
    return { ok: false, error: `${r.id}: ${attackRangePerLevelInv.error}` };
  const cooldownDecayPerLevel = parseFloatStrict(
    r.cooldownDecayPerLevel,
    "cooldownDecayPerLevel"
  );
  if (typeof cooldownDecayPerLevel === "object")
    return { ok: false, error: `${r.id}: ${cooldownDecayPerLevel.error}` };
  const cooldownDecayLevelCap = parseIntStrict(
    r.cooldownDecayLevelCap,
    "cooldownDecayLevelCap"
  );
  if (typeof cooldownDecayLevelCap === "object")
    return { ok: false, error: `${r.id}: ${cooldownDecayLevelCap.error}` };
  const cooldownMin = parseIntStrict(r.cooldownMin, "cooldownMin");
  if (typeof cooldownMin === "object")
    return { ok: false, error: `${r.id}: ${cooldownMin.error}` };

  const aggroRadius = parseIntStrict(r.aggroRadius, "aggro");
  if (typeof aggroRadius === "object")
    return { ok: false, error: `${r.id}: ${aggroRadius.error}` };
  const loseAggroRadius = parseIntStrict(r.loseAggroRadius, "loseAggro");
  if (typeof loseAggroRadius === "object")
    return { ok: false, error: `${r.id}: ${loseAggroRadius.error}` };
  const leashRadius = parseIntStrict(r.leashRadius, "leash");
  if (typeof leashRadius === "object")
    return { ok: false, error: `${r.id}: ${leashRadius.error}` };
  const respawnMs = parseIntStrict(r.respawnMs, "respawnMs");
  if (typeof respawnMs === "object")
    return { ok: false, error: `${r.id}: ${respawnMs.error}` };

  return {
    ok: true,
    def: {
      label,
      base: {
        hp,
        atk,
        armor,
        speed,
        attackRange,
        attackCooldownMs,
      },
      scaling: {
        hpLinear,
        hpQuad,
        atkPerLevel,
        armorPerLevel,
        speedPerLevel,
        speedCap,
        attackRangePerLevelInv,
        cooldownDecayPerLevel,
        cooldownDecayLevelCap,
        cooldownMin,
      },
      ai: {
        aggroRadius,
        loseAggroRadius,
        leashRadius,
      },
      respawnMs,
      ...(r.id !== ENEMY_DEFAULT_KEY && r.archived ? { archived: true } : {}),
    },
  };
}

function rowsToEnemies(
  rows: RowState[]
): { ok: true; enemies: Record<string, EnemyDef> } | { ok: false; error: string } {
  const enemies: Record<string, EnemyDef> = {};
  const seen = new Set<string>();
  for (const r of rows) {
    const id = r.id.trim();
    if (seen.has(id)) return { ok: false, error: `Дубликат id: ${id}` };
    seen.add(id);
    const built = rowToEnemyDef(r);
    if (!built.ok) return built;
    enemies[id] = built.def;
  }
  if (!enemies[ENEMY_DEFAULT_KEY]) {
    return { ok: false, error: `Нужна запись «${ENEMY_DEFAULT_KEY}»` };
  }
  return { ok: true, enemies };
}

/** Сохраняет id, подпись и флаг архива; подставляет боевой профиль из `src`. */
function mergeDefIntoRow(r: RowState, src: EnemyDef): RowState {
  const merged: EnemyDef = {
    label: r.label,
    base: { ...src.base },
    scaling: { ...src.scaling },
    ai: { ...src.ai },
    respawnMs: src.respawnMs,
  };
  if (r.archived) merged.archived = true;
  return rowFromEntry(r.id, merged);
}

function inputCls(w = "w-full") {
  return `${w} rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 font-mono text-[11px] text-zinc-100`;
}

const detailsSummaryCls =
  "cursor-pointer select-none text-[11px] font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-300";

const PORTRAIT_UPSCALE = 3.5;

function MobPortrait({ mobId, label }: { mobId: string; label: string }) {
  const meta = mobPortraitMeta(mobId);
  if (!meta) {
    return (
      <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 p-1.5">
        <p className="px-1 text-center text-[10px] leading-snug text-zinc-500">
          Нет спрайта
          <span className="mt-1 block text-zinc-600">
            фоллбэк для неизвестных id
          </span>
        </p>
      </div>
    );
  }
  const boxW = Math.round(meta.frameWidth * PORTRAIT_UPSCALE);
  const boxH = Math.round(meta.frameHeight * PORTRAIT_UPSCALE);
  return (
    <div
      className="shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
      style={{
        width: boxW,
        height: boxH,
      }}
      title={`Первый кадр idle (${meta.frameWidth}×${meta.frameHeight})`}
    >
      <img
        src={meta.url}
        alt={`${label} (${mobId})`}
        className="h-full w-auto max-w-none"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
}

function PreviewBlock({
  def,
  playerLevel,
  compactTitle,
}: {
  def: EnemyDef;
  playerLevel: number;
  compactTitle?: string;
}) {
  const pl = Math.max(1, Math.min(99, Math.floor(playerLevel)));
  return (
    <div className="mt-3 overflow-x-auto rounded border border-zinc-800 bg-zinc-900/40 p-2">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {compactTitle ?? "Превью уровней (та же формула, что в игре)"}
      </p>
      <table className="w-full min-w-[640px] border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-500">
            <th className="px-1 py-1">Lv</th>
            <th className="px-1 py-1">HP</th>
            <th className="px-1 py-1">ATK</th>
            <th className="px-1 py-1">Броня</th>
            <th className="px-1 py-1">Скор.</th>
            <th className="px-1 py-1">Дальн.</th>
            <th className="px-1 py-1">КД мс</th>
            <th className="px-1 py-1" title="Базовый XP за убийство (без учёта игрока)">
              XP
            </th>
            <th
              className="px-1 py-1"
              title={`XP с учётом ур. игрока ${pl} (xpEnemyKillForPlayer)`}
            >
              XP @P{pl}
            </th>
          </tr>
        </thead>
        <tbody>
          {PREVIEW_LEVELS.map((lv) => {
            const s = computeEnemyScaledStatsFromDef(def, lv);
            const xpBase = xpEnemyKill(s.level);
            const xpPl = xpEnemyKillForPlayer(s.level, pl);
            return (
              <tr key={lv} className="border-b border-zinc-800/60">
                <td className="px-1 py-0.5 font-mono text-amber-200/90">{lv}</td>
                <td className="px-1 py-0.5">{s.hp}</td>
                <td className="px-1 py-0.5">{s.atk}</td>
                <td className="px-1 py-0.5">{s.armor}</td>
                <td className="px-1 py-0.5">{s.speed}</td>
                <td className="px-1 py-0.5">{s.attackRange}</td>
                <td className="px-1 py-0.5">{s.attackCooldownMs}</td>
                <td className="px-1 py-0.5 font-mono text-violet-300/90">
                  {xpBase}
                </td>
                <td className="px-1 py-0.5 font-mono text-violet-200/90">
                  {xpPl}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function EnemiesAdmin() {
  const [rows, setRows] = useState<RowState[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});
  const [filterQuery, setFilterQuery] = useState("");
  const [playerLevelForXp, setPlayerLevelForXp] = useState(10);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [copyFromSelect, setCopyFromSelect] = useState<Record<string, string>>(
    {}
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dev/enemies", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as EnemiesFile;
        if (cancelled) return;
        const ids = orderedEnemyRowIds(data.enemies ?? {});
        const list = ids.map((id) => rowFromEntry(id, data.enemies[id]));
        setRows(list);
        setUpdatedAt(data.updatedAt);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const patchRow = useCallback((rowKey: string, p: Partial<RowState>) => {
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, ...p } : r))
    );
  }, []);

  const togglePreview = useCallback((rowKey: string) => {
    setPreviewOpen((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  }, []);

  const save = useCallback(async () => {
    setError(null);
    const built = rowsToEnemies(rows);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dev/enemies", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enemies: built.enemies }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      setUpdatedAt(new Date().toISOString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [rows]);

  const rowDefs = useMemo(() => {
    const m = new Map<string, EnemyDef | null>();
    for (const r of rows) {
      const b = rowToEnemyDef(r);
      m.set(r.rowKey, b.ok ? b.def : null);
    }
    return m;
  }, [rows]);

  const displayRows = useMemo(() => {
    const t = filterQuery.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(
      (r) =>
        r.id.toLowerCase().includes(t) || r.label.toLowerCase().includes(t)
    );
  }, [rows, filterQuery]);

  const compareAEffective =
    compareA && rows.some((r) => r.id === compareA)
      ? compareA
      : rows.find((r) => r.id !== ENEMY_DEFAULT_KEY)?.id ?? rows[0]?.id ?? "";
  const compareBEffective =
    compareB &&
    rows.some((r) => r.id === compareB) &&
    compareB !== compareAEffective
      ? compareB
      : rows.find((r) => r.id !== compareAEffective)?.id ?? rows[0]?.id ?? "";

  const compareDefA = compareAEffective
    ? rowDefs.get(compareAEffective) ?? null
    : null;
  const compareDefB = compareBEffective
    ? rowDefs.get(compareBEffective) ?? null
    : null;

  const navRowIds = useMemo(
    () => displayRows.filter((r) => !r.archived).map((r) => r.id),
    [displayRows]
  );

  const applyCopyFrom = useCallback(
    (targetRowKey: string, sourceId: string) => {
      const target = rows.find((r) => r.rowKey === targetRowKey);
      const sourceRow = rows.find((r) => r.id === sourceId);
      if (!target || !sourceRow || target.id === sourceId) return;
      const built = rowToEnemyDef(sourceRow);
      if (!built.ok) {
        setError(built.error);
        return;
      }
      setError(null);
      setRows((prev) =>
        prev.map((r) =>
          r.rowKey === targetRowKey ? mergeDefIntoRow(r, built.def) : r
        )
      );
    },
    [rows]
  );

  const resetRowFromDefault = useCallback(
    (targetRowKey: string) => {
      const target = rows.find((r) => r.rowKey === targetRowKey);
      const defaultRow = rows.find((r) => r.id === ENEMY_DEFAULT_KEY);
      if (!target || !defaultRow || target.id === ENEMY_DEFAULT_KEY) return;
      const built = rowToEnemyDef(defaultRow);
      if (!built.ok) {
        setError(built.error);
        return;
      }
      setError(null);
      setRows((prev) =>
        prev.map((r) =>
          r.rowKey === targetRowKey ? mergeDefIntoRow(r, built.def) : r
        )
      );
    },
    [rows]
  );

  const setArchived = useCallback((rowKey: string, archived: boolean) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowKey !== rowKey) return r;
        if (r.id === ENEMY_DEFAULT_KEY) return { ...r, archived: false };
        return { ...r, archived };
      })
    );
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-400">Загрузка…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1 border-b border-zinc-800 pb-3">
        <h1 className="text-lg font-semibold text-zinc-100">
          Редактор врагов
        </h1>
        <p className="text-sm text-zinc-500">
          Данные в{" "}
          <code className="rounded bg-zinc-900 px-1 text-emerald-400/90">
            src/game/data/enemies.json
          </code>
          . «В архив» отключает спавн и респавн моба в игре (запись в JSON
          остаётся). Превью слева — первый кадр idle-листа. После сохранения
          перезапустите dev-сервер или обновите страницу игры, чтобы подтянуть
          JSON в бандл.
        </p>
        {updatedAt ? (
          <p className="text-xs text-zinc-600">
            Обновлено: {new Date(updatedAt).toLocaleString("ru-RU")}
          </p>
        ) : null}
      </header>

      {error ? (
        <div className="rounded border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label className="text-[10px] uppercase text-zinc-500">
            Поиск по id или подписи
          </label>
          <input
            type="search"
            className={inputCls("max-w-md")}
            placeholder="orc…, skeleton…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            aria-label="Фильтр мобов"
          />
        </div>
        <div className="flex w-28 flex-col gap-1">
          <label className="text-[10px] uppercase text-zinc-500">
            Ур. игрока для XP
          </label>
          <input
            type="number"
            min={1}
            max={99}
            className={inputCls()}
            value={playerLevelForXp}
            onChange={(e) =>
              setPlayerLevelForXp(
                Math.max(1, Math.min(99, Number(e.target.value) || 1))
              )
            }
          />
        </div>
      </div>

      <details className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">
        <summary className={detailsSummaryCls}>
          Сравнение двух мобов (статы + XP по уровням)
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-[10px] uppercase text-zinc-500">
              Моб A
            </label>
            <select
              className={inputCls("max-w-full")}
              value={compareAEffective}
              onChange={(e) => setCompareA(e.target.value)}
            >
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}
                </option>
              ))}
            </select>
            {compareDefA ? (
              <PreviewBlock
                def={compareDefA}
                playerLevel={playerLevelForXp}
                compactTitle={`A: ${compareAEffective}`}
              />
            ) : (
              <p className="text-xs text-amber-600">Некорректные поля у A.</p>
            )}
          </div>
          <div className="space-y-2">
            <label className="block text-[10px] uppercase text-zinc-500">
              Моб B
            </label>
            <select
              className={inputCls("max-w-full")}
              value={compareBEffective}
              onChange={(e) => setCompareB(e.target.value)}
            >
              {rows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.id}
                </option>
              ))}
            </select>
            {compareDefB ? (
              <PreviewBlock
                def={compareDefB}
                playerLevel={playerLevelForXp}
                compactTitle={`B: ${compareBEffective}`}
              />
            ) : (
              <p className="text-xs text-amber-600">Некорректные поля у B.</p>
            )}
          </div>
        </div>
      </details>

      {rows.length > 0 ? (
        <nav
          className="sticky top-0 z-20 flex flex-wrap items-baseline gap-x-3 gap-y-1.5 rounded-lg border border-zinc-800/90 bg-zinc-950/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm"
          aria-label="Быстрый переход к мобу"
        >
          <span className="font-medium text-zinc-500">К мобу:</span>
          {navRowIds.map((id) => (
            <a
              key={id}
              href={`#enemy-${id}`}
              className="font-mono text-emerald-400/95 hover:text-emerald-300"
            >
              {id}
            </a>
          ))}
        </nav>
      ) : null}

      <div className="flex flex-col gap-6">
        {filterQuery.trim() && displayRows.length === 0 && rows.length > 0 ? (
          <p className="text-sm text-zinc-500">
            Нет мобов по фильтру — сбросьте поиск или измените запрос.
          </p>
        ) : null}
        {displayRows.map((r, idx) => {
          const def = rowDefs.get(r.rowKey);
          const showArchiveHeading =
            r.archived &&
            (idx === 0 || !displayRows[idx - 1]!.archived);
          const sectionCls = r.archived
            ? "scroll-mt-24 rounded border border-dashed border-amber-900/55 bg-zinc-950/35 p-3 sm:p-4"
            : "scroll-mt-24 rounded border border-zinc-800 bg-zinc-950/50 p-3 sm:p-4";
          return (
            <Fragment key={r.rowKey}>
              {showArchiveHeading ? (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-600/95">
                  Архив — не спавнятся в игре (данные сохраняются)
                </h3>
              ) : null}
              <section id={`enemy-${r.id}`} className={sectionCls}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start">
                <MobPortrait mobId={r.id} label={r.label} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-mono text-sm text-emerald-300">
                      {r.id}
                    </h2>
                    {r.archived ? (
                      <span className="rounded bg-amber-950/70 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400/95">
                        В архиве
                      </span>
                    ) : null}
                    <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
                      {r.id !== ENEMY_DEFAULT_KEY ? (
                        r.archived ? (
                          <button
                            type="button"
                            onClick={() => setArchived(r.rowKey, false)}
                            className="rounded border border-zinc-600 bg-zinc-800/80 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700"
                          >
                            Восстановить
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setArchived(r.rowKey, true)}
                            className="rounded border border-amber-900/60 bg-amber-950/40 px-2 py-1 text-[11px] text-amber-200/90 hover:bg-amber-950/70"
                          >
                            В архив
                          </button>
                        )
                      ) : null}
                      <button
                        type="button"
                        onClick={() => togglePreview(r.rowKey)}
                        className="shrink-0 text-xs text-sky-400 hover:text-sky-300"
                      >
                        {previewOpen[r.rowKey]
                          ? "Скрыть превью уровней"
                          : "Превью уровней"}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] uppercase text-zinc-500">
                      Подпись
                    </label>
                    <input
                      className={inputCls("max-w-md")}
                      value={r.label}
                      onChange={(e) =>
                        patchRow(r.rowKey, { label: e.target.value })
                      }
                    />
                  </div>
                  {r.id !== ENEMY_DEFAULT_KEY ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800/50 pt-2">
                      <span className="text-[10px] uppercase text-zinc-500">
                        Профиль
                      </span>
                      <select
                        className={inputCls("min-w-[9rem] max-w-[14rem]")}
                        value={copyFromSelect[r.rowKey] ?? ""}
                        onChange={(e) =>
                          setCopyFromSelect((s) => ({
                            ...s,
                            [r.rowKey]: e.target.value,
                          }))
                        }
                        aria-label={`Источник копирования для ${r.id}`}
                      >
                        <option value="">Копировать из…</option>
                        {rows
                          .filter((o) => o.id !== r.id)
                          .map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.id}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={!copyFromSelect[r.rowKey]}
                        onClick={() => {
                          const src = copyFromSelect[r.rowKey];
                          if (src) applyCopyFrom(r.rowKey, src);
                        }}
                        className="rounded border border-zinc-600 bg-zinc-800/80 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Применить копию
                      </button>
                      <button
                        type="button"
                        onClick={() => resetRowFromDefault(r.rowKey)}
                        className="rounded border border-sky-900/50 bg-sky-950/30 px-2 py-1 text-[11px] text-sky-300/90 hover:bg-sky-950/55"
                        title="Base, скейлинг, AI и респавн как у __default (подпись и архив не трогаем)"
                      >
                        Как у шаблона (__default)
                      </button>
                    </div>
                  ) : (
                    <p className="border-t border-zinc-800/50 pt-2 text-[10px] text-zinc-600">
                      __default — эталон для «Как у шаблона» и фоллбэка неизвестных
                      id.
                    </p>
                  )}
                </div>
              </div>

              <p className="mb-1 text-[10px] font-semibold uppercase text-zinc-600">
                База (ур. 1)
              </p>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                {(
                  [
                    ["hp", "HP"],
                    ["atk", "ATK"],
                    ["armor", "Броня"],
                    ["speed", "Скорость"],
                    ["attackRange", "Дальность атаки"],
                    ["attackCooldownMs", "КД атаки (мс)"],
                  ] as const
                ).map(([key, lab]) => (
                  <div key={key}>
                    <label className="mb-0.5 block text-[10px] text-zinc-500">
                      {lab}
                    </label>
                    <input
                      className={inputCls()}
                      value={r[key]}
                      onChange={(e) =>
                        patchRow(r.rowKey, { [key]: e.target.value } as Partial<RowState>)
                      }
                    />
                  </div>
                ))}
              </div>

              <details className="mb-2 rounded border border-zinc-800/80 bg-zinc-950/30 px-2 py-1">
                <summary className={detailsSummaryCls}>
                  Скейлинг по уровню (t = L−1)
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2 pb-2 sm:grid-cols-3 md:grid-cols-5">
                  {(
                    [
                      ["hpLinear", "HP линейный a"],
                      ["hpQuad", "HP квадр. b"],
                      ["atkPerLevel", "ATK / ур."],
                      ["armorPerLevel", "Броня / ур."],
                      ["speedPerLevel", "Скор. / ур."],
                      ["speedCap", "Потолок скорости"],
                      ["attackRangePerLevelInv", "Дальн.: шаг t÷"],
                      ["cooldownDecayPerLevel", "КД затухание"],
                      ["cooldownDecayLevelCap", "КД cap по t"],
                      ["cooldownMin", "КД мин (мс)"],
                    ] as const
                  ).map(([key, lab]) => (
                    <div key={key}>
                      <label className="mb-0.5 block text-[10px] text-zinc-500">
                        {lab}
                      </label>
                      <input
                        className={inputCls()}
                        value={r[key]}
                        onChange={(e) =>
                          patchRow(r.rowKey, {
                            [key]: e.target.value,
                          } as Partial<RowState>)
                        }
                      />
                    </div>
                  ))}
                </div>
              </details>

              <details className="mb-2 rounded border border-zinc-800/80 bg-zinc-950/30 px-2 py-1">
                <summary className={detailsSummaryCls}>
                  AI и респавн
                </summary>
                <div className="mt-2 space-y-3 pb-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["aggroRadius", "Агро"],
                        ["loseAggroRadius", "Сброс агро"],
                        ["leashRadius", "Лиз"],
                      ] as const
                    ).map(([key, lab]) => (
                      <div key={key}>
                        <label className="mb-0.5 block text-[10px] text-zinc-500">
                          {lab}
                        </label>
                        <input
                          className={inputCls()}
                          value={r[key]}
                          onChange={(e) =>
                            patchRow(r.rowKey, {
                              [key]: e.target.value,
                            } as Partial<RowState>)
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="max-w-xs">
                    <label className="mb-0.5 block text-[10px] text-zinc-500">
                      Респавн (мс)
                    </label>
                    <input
                      className={inputCls()}
                      value={r.respawnMs}
                      onChange={(e) =>
                        patchRow(r.rowKey, { respawnMs: e.target.value })
                      }
                    />
                  </div>
                </div>
              </details>

              {previewOpen[r.rowKey] && def ? (
                <PreviewBlock
                  def={def}
                  playerLevel={playerLevelForXp}
                />
              ) : null}
              {previewOpen[r.rowKey] && !def ? (
                <p className="mt-2 text-xs text-amber-600">
                  Исправьте поля, чтобы показать превью.
                </p>
              ) : null}
            </section>
            </Fragment>
          );
        })}
      </div>

      {!rows.length ? (
        <p className="text-sm text-zinc-500">Нет записей в enemies.json.</p>
      ) : null}
    </div>
  );
}
