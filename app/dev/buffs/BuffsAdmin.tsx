"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import {
  BUFF_MULT_FIELD_KEYS,
  type BuffDef,
} from "@/src/game/data/balance";

const BUFF_ID_RE = /^[a-z][a-z0-9_]{0,47}$/;

type BuffsFile = {
  updatedAt?: string;
  buffs: Record<string, BuffDef>;
};

const COL_TITLE: Record<(typeof BUFF_MULT_FIELD_KEYS)[number], string> = {
  staRegenMult: "STA реген",
  moveSpdMult: "Скорость",
  staDrainMult: "STA бег",
  hpRegenMult: "HP реген",
  xpGainMult: "Опыт",
  luckMult: "Удача→XP",
  atkMult: "ATK",
  defMult: "DEF",
  goldGainMult: "Золото",
  evadeMult: "Уклон",
  attackCooldownMult: "КД атаки",
};

const COL_HINT: Record<(typeof BUFF_MULT_FIELD_KEYS)[number], string> = {
  staRegenMult: "Восстановление стамины стоя",
  moveSpdMult: "Скорость передвижения",
  staDrainMult: "Расход стамины при беге",
  hpRegenMult: "Пассивное HP стоя",
  xpGainMult: "Множитель опыта (после удачи)",
  luckMult: "Множитель LUCK для бонуса XP",
  atkMult: "Урон по врагам",
  defMult: "Защита от ударов мобов",
  goldGainMult: "Золото с трупов (не лавка)",
  evadeMult: "Шанс уклонения",
  attackCooldownMult: "< 1 — быстрее ближние атаки",
};

type Row = {
  rowKey: string;
  id: string;
  label: string;
} & Record<(typeof BUFF_MULT_FIELD_KEYS)[number], string>;

function emptyMults(): Pick<Row, (typeof BUFF_MULT_FIELD_KEYS)[number]> {
  return Object.fromEntries(BUFF_MULT_FIELD_KEYS.map((k) => [k, ""])) as Pick<
    Row,
    (typeof BUFF_MULT_FIELD_KEYS)[number]
  >;
}

function rowFromEntry(id: string, def: BuffDef): Row {
  const m = emptyMults();
  for (const k of BUFF_MULT_FIELD_KEYS) {
    const v = def[k];
    m[k] = v !== undefined ? String(v) : "";
  }
  return {
    rowKey: id,
    id,
    label: def.label,
    ...m,
  };
}

function parseOptPositive(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function rowsToBuffs(
  rows: Row[]
): { ok: true; buffs: Record<string, BuffDef> } | { ok: false; error: string } {
  const seen = new Set<string>();
  const buffs: Record<string, BuffDef> = {};
  for (const r of rows) {
    const id = r.id.trim();
    if (!BUFF_ID_RE.test(id)) {
      return {
        ok: false,
        error: `Некорректный id: «${id}» (нужен snake_case, a-z0-9_)`,
      };
    }
    if (seen.has(id)) {
      return { ok: false, error: `Дубликат id: ${id}` };
    }
    seen.add(id);
    const label = r.label.trim();
    if (!label) {
      return { ok: false, error: `Пустая подпись у «${id}»` };
    }
    const o: BuffDef = { label };
    for (const k of BUFF_MULT_FIELD_KEYS) {
      const v = parseOptPositive(r[k]);
      if (v !== undefined) o[k] = v;
    }
    buffs[id] = o;
  }
  if (Object.keys(buffs).length === 0) {
    return { ok: false, error: "Нужен хотя бы один баф" };
  }
  return { ok: true, buffs };
}

export default function BuffsAdmin() {
  const [rows, setRows] = useState<Row[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dev/buffs", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as BuffsFile;
        if (cancelled) return;
        const list = Object.keys(data.buffs ?? {})
          .sort((a, b) => a.localeCompare(b, "en"))
          .map((id) => rowFromEntry(id, data.buffs[id]));
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

  const patchRow = useCallback((rowKey: string, p: Partial<Row>) => {
    setRows((prev) =>
      prev.map((r) => (r.rowKey === rowKey ? { ...r, ...p } : r))
    );
  }, []);

  const onIdChange = useCallback(
    (rowKey: string, e: ChangeEvent<HTMLInputElement>) => {
      patchRow(rowKey, { id: e.target.value });
    },
    [patchRow]
  );

  const addRow = useCallback(() => {
    setRows((prev) => {
      let n = prev.length + 1;
      let id = `new_buff_${n}`;
      while (prev.some((r) => r.id === id) || id.length > 48) {
        n++;
        id = `new_buff_${n}`;
      }
      return [
        ...prev,
        {
          rowKey: `rk_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          id,
          label: "Новый баф",
          ...emptyMults(),
        },
      ];
    });
  }, []);

  const removeRow = useCallback((rowKey: string) => {
    setRows((prev) => prev.filter((r) => r.rowKey !== rowKey));
  }, []);

  const save = useCallback(async () => {
    setError(null);
    const built = rowsToBuffs(rows);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/dev/buffs", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buffs: built.buffs }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`HTTP ${res.status}: ${txt}`);
      }
      setUpdatedAt(new Date().toISOString());
      setRows((prev) =>
        [...prev].sort((a, b) => a.id.localeCompare(b.id, "en"))
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [rows]);

  if (loading) {
    return <p className="text-sm text-zinc-400">Загрузка…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1 border-b border-zinc-800 pb-3">
        <h1 className="text-lg font-semibold text-zinc-100">
          Менеджер бафов
        </h1>
        <p className="text-sm text-zinc-500">
          Данные в{" "}
          <code className="rounded bg-zinc-900 px-1 text-emerald-400/90">
            src/game/data/buffs.json
          </code>
          . Пустое поле — множитель не применяется (как 1×).
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
          onClick={addRow}
          className="rounded bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
        >
          Добавить
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm text-white hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900/50 text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="sticky left-0 z-10 bg-zinc-900/95 px-2 py-2 font-medium">
                id
              </th>
              <th className="sticky left-[6.5rem] z-10 bg-zinc-900/95 px-2 py-2 font-medium">
                Подпись
              </th>
              {BUFF_MULT_FIELD_KEYS.map((k) => (
                <th
                  key={k}
                  className="min-w-[4.5rem] px-1 py-2 font-medium"
                  title={COL_HINT[k]}
                >
                  <span className="block max-w-[5rem] leading-tight normal-case">
                    {COL_TITLE[k]}
                  </span>
                </th>
              ))}
              <th className="w-20 px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.rowKey}
                className="border-b border-zinc-800/80 hover:bg-zinc-900/30"
              >
                <td className="sticky left-0 z-[1] bg-zinc-950/98 px-2 py-1.5 align-top">
                  <input
                    className="w-[6.25rem] rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-emerald-300"
                    value={r.id}
                    onChange={(e) => onIdChange(r.rowKey, e)}
                    spellCheck={false}
                  />
                </td>
                <td className="sticky left-[6.5rem] z-[1] bg-zinc-950/98 px-2 py-1.5 align-top">
                  <input
                    className="w-[7.5rem] rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[11px]"
                    value={r.label}
                    onChange={(e) =>
                      patchRow(r.rowKey, { label: e.target.value })
                    }
                  />
                </td>
                {BUFF_MULT_FIELD_KEYS.map((k) => (
                  <td key={k} className="px-1 py-1.5 align-top">
                    <input
                      className="w-full min-w-[3.25rem] rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 font-mono text-[11px]"
                      value={r[k]}
                      placeholder="—"
                      title={COL_HINT[k]}
                      onChange={(e) =>
                        patchRow(r.rowKey, { [k]: e.target.value } as Partial<Row>)
                      }
                    />
                  </td>
                ))}
                <td className="px-2 py-1.5 align-top">
                  <button
                    type="button"
                    onClick={() => removeRow(r.rowKey)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!rows.length ? (
        <p className="text-sm text-zinc-500">Нет строк — нажмите «Добавить».</p>
      ) : null}
    </div>
  );
}
