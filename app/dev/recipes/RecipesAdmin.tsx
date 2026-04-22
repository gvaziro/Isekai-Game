"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { CRAFT_STATION_META } from "@/src/game/data/stations";
import { CURATED_ITEMS, type ItemSlot } from "@/src/game/data/items.curated";
import { ITEM_ATLAS } from "@/src/game/data/items.generated";
import { getCuratedItem } from "@/src/game/data/itemRegistry";
import type { RecipeDef, RecipesFile } from "@/src/game/data/recipesSchema";
import {
  ItemAtlasIcon,
  type ItemAtlasFramesFile,
} from "@/src/game/ui/ItemAtlasIcon";

const SLOT_LABEL: Record<ItemSlot, string> = {
  weapon: "Оружие",
  offhand: "Левая рука",
  helmet: "Шлем",
  chest: "Нагрудник",
  pants: "Штаны",
  boots: "Обувь",
  backpack: "Рюкзак",
  consumable: "Расходник",
  active_item: "Активный",
  fish: "Рыба",
  loot: "Лут",
  material: "Материал",
  quest: "Квест",
  pickaxe: "Кирка",
  axe: "Топор",
  fishing_rod: "Удочка",
};

function newRecipe(stationId: string): RecipeDef {
  return {
    id: `recipe_${Date.now()}`,
    stationId,
    label: "Новый рецепт",
    inputs: [{ curatedId: "item588", qty: 1 }],
    outputs: [{ curatedId: "rope_coil", qty: 1 }],
  };
}

type IoKind = "inputs" | "outputs";

type PickerTarget = {
  recipeIndex: number;
  kind: IoKind;
  lineIndex: number;
};

export default function RecipesAdmin() {
  const datalistId = useId();
  const [file, setFile] = useState<RecipesFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const defaultStationId = CRAFT_STATION_META[0]?.id ?? "wb_house";
  const [activeStationId, setActiveStationId] = useState(defaultStationId);

  const [atlas, setAtlas] = useState<ItemAtlasFramesFile | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerSlot, setPickerSlot] = useState<ItemSlot | "all">("all");
  const pickerAnchorRef = useRef<HTMLDivElement>(null);

  const slotOptions = useMemo(() => {
    const s = new Set<ItemSlot>();
    for (const i of CURATED_ITEMS) s.add(i.slot);
    return [...s].sort((a, b) => SLOT_LABEL[a].localeCompare(SLOT_LABEL[b], "ru"));
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/dev/recipes", { cache: "no-store" });
      if (!res.ok) {
        setLoadError(await res.text());
        return;
      }
      const j = (await res.json()) as RecipesFile;
      setFile({
        recipes: Array.isArray(j.recipes) ? j.recipes : [],
        updatedAt: j.updatedAt,
      });
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!ITEM_ATLAS.available) return;
    let cancelled = false;
    void fetch(ITEM_ATLAS.jsonUrl)
      .then((r) => r.json())
      .then((j: ItemAtlasFramesFile) => {
        if (!cancelled) setAtlas(j);
      })
      .catch(() => {
        if (!cancelled) setAtlas(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!picker) return;
    pickerAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, [picker]);

  const save = useCallback(async () => {
    if (!file) return;
    setSaveError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/dev/recipes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipes: file.recipes }),
      });
      if (!res.ok) {
        const t = await res.text();
        setSaveError(t);
        return;
      }
      await load();
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [file, load]);

  const updateRecipe = (index: number, next: RecipeDef) => {
    setFile((prev) => {
      if (!prev) return prev;
      const recipes = [...prev.recipes];
      recipes[index] = next;
      return { ...prev, recipes };
    });
  };

  const removeRecipe = (index: number) => {
    setFile((prev) => {
      if (!prev) return prev;
      const recipes = prev.recipes.filter((_, i) => i !== index);
      return { ...prev, recipes };
    });
  };

  const addRecipe = () => {
    setFile((prev) => {
      const base = prev ?? { recipes: [] };
      return {
        ...base,
        recipes: [...base.recipes, newRecipe(activeStationId)],
      };
    });
  };

  const setIoLine = (
    recipeIndex: number,
    kind: IoKind,
    lineIndex: number,
    field: "curatedId" | "qty",
    value: string
  ) => {
    const f = file?.recipes[recipeIndex];
    if (!f) return;
    const lines = [...f[kind]];
    const row = { ...lines[lineIndex]! };
    if (field === "qty") {
      const n = Math.max(1, Math.floor(Number(value) || 1));
      row.qty = n;
    } else {
      row.curatedId = value.trim() || "item588";
    }
    lines[lineIndex] = row;
    updateRecipe(recipeIndex, { ...f, [kind]: lines });
  };

  const addIoLine = (recipeIndex: number, kind: IoKind) => {
    const f = file?.recipes[recipeIndex];
    if (!f) return;
    updateRecipe(recipeIndex, {
      ...f,
      [kind]: [...f[kind], { curatedId: "item588", qty: 1 }],
    });
  };

  const removeIoLine = (
    recipeIndex: number,
    kind: IoKind,
    lineIndex: number
  ) => {
    const f = file?.recipes[recipeIndex];
    if (!f) return;
    const lines = f[kind].filter((_, i) => i !== lineIndex);
    if (lines.length < 1) return;
    updateRecipe(recipeIndex, { ...f, [kind]: lines });
  };

  const moveRecipeToStation = (recipeIndex: number, nextStationId: string) => {
    const f = file?.recipes[recipeIndex];
    if (!f || f.stationId === nextStationId) return;
    updateRecipe(recipeIndex, { ...f, stationId: nextStationId });
    setActiveStationId(nextStationId);
  };

  const openPicker = (t: PickerTarget) => {
    setPickerQuery("");
    setPickerSlot("all");
    setPicker(t);
  };

  const closePicker = () => setPicker(null);

  const stationCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of CRAFT_STATION_META) m.set(s.id, 0);
    if (!file) return m;
    for (const r of file.recipes) {
      m.set(r.stationId, (m.get(r.stationId) ?? 0) + 1);
    }
    return m;
  }, [file]);

  const visibleRecipeIndices = useMemo(() => {
    if (!file) return [];
    const out: number[] = [];
    file.recipes.forEach((r, i) => {
      if (r.stationId === activeStationId) out.push(i);
    });
    return out;
  }, [file, activeStationId]);

  const filteredPickerItems = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return CURATED_ITEMS.filter((item) => {
      if (pickerSlot !== "all" && item.slot !== pickerSlot) return false;
      if (!q) return true;
      return (
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
      );
    });
  }, [pickerQuery, pickerSlot]);

  const applyPickerChoice = (curatedId: string) => {
    if (!picker) return;
    setIoLine(picker.recipeIndex, picker.kind, picker.lineIndex, "curatedId", curatedId);
    closePicker();
  };

  return (
    <div className="mx-auto w-full max-w-[min(960px,100%)] text-zinc-100">
      <datalist id={datalistId}>
        {CURATED_ITEMS.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </datalist>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded border border-emerald-800 bg-emerald-950/60 px-3 py-1.5 text-sm hover:bg-emerald-900/50 disabled:opacity-50"
          disabled={busy}
          onClick={() => void load()}
        >
          Обновить
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm hover:bg-zinc-700 disabled:opacity-50"
          disabled={busy || !file}
          onClick={() => void save()}
        >
          {busy ? "Сохранение…" : "Сохранить в recipes.json"}
        </button>
        <button
          type="button"
          className="rounded border border-amber-800/80 bg-amber-950/40 px-3 py-1.5 text-sm hover:bg-amber-950/70"
          onClick={addRecipe}
        >
          + Рецепт
        </button>
      </div>

      {loadError ? (
        <p className="mb-3 text-sm text-red-400">{loadError}</p>
      ) : null}
      {saveError ? (
        <p className="mb-3 text-sm text-red-400">{saveError}</p>
      ) : null}

      {file?.updatedAt ? (
        <p className="mb-3 font-mono text-[11px] text-zinc-500">
          Файл: updatedAt {file.updatedAt} (после сохранения перезапишется)
        </p>
      ) : null}

      {file ? (
        <div
          className="mb-4 flex flex-wrap gap-1 border-b border-zinc-800 pb-2"
          role="tablist"
          aria-label="Станции крафта"
        >
          {CRAFT_STATION_META.map((st) => {
            const n = stationCounts.get(st.id) ?? 0;
            const active = st.id === activeStationId;
            return (
              <button
                key={st.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`rounded-t-md px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? "bg-zinc-800 text-zinc-100 ring-1 ring-zinc-600 ring-b-0"
                    : "text-zinc-400 hover:bg-zinc-900/80 hover:text-zinc-200"
                }`}
                onClick={() => {
                  setActiveStationId(st.id);
                  closePicker();
                }}
              >
                <div className="font-medium">{st.label}</div>
                <div className="font-mono text-[10px] leading-tight text-zinc-500">
                  {st.id}
                  <span className="ml-1.5 tabular-nums text-zinc-400">· {n}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {picker && file ? (
        <div
          ref={pickerAnchorRef}
          className="mb-4 rounded-lg border border-emerald-900/60 bg-zinc-950/90 p-3 shadow-lg shadow-black/40"
        >
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-400">
              Выбор предмета ·{" "}
              {picker.kind === "inputs" ? "ингредиент" : "результат"} · строка{" "}
              {picker.lineIndex + 1}
            </span>
            <button
              type="button"
              className="ml-auto text-xs text-zinc-500 hover:text-zinc-300"
              onClick={closePicker}
            >
              Закрыть
            </button>
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            <input
              type="search"
              placeholder="Поиск по id или названию…"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              className="min-w-[12rem] flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm outline-none ring-emerald-700 focus:ring-1"
            />
            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span>Слот</span>
              <select
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                value={pickerSlot}
                onChange={(e) =>
                  setPickerSlot(
                    e.target.value === "all" ? "all" : (e.target.value as ItemSlot)
                  )
                }
              >
                <option value="all">Все</option>
                {slotOptions.map((slot) => (
                  <option key={slot} value={slot}>
                    {SLOT_LABEL[slot]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mb-2 text-[11px] text-zinc-500">
            Найдено: {filteredPickerItems.length} из {CURATED_ITEMS.length}
          </p>
          <div className="grid max-h-[min(50vh,320px)] grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2 overflow-y-auto pr-1">
            {filteredPickerItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => applyPickerChoice(item.id)}
                className="flex flex-col items-center gap-1 rounded border border-zinc-800 bg-zinc-900/60 p-2 text-center transition hover:border-emerald-700/80 hover:bg-zinc-800/80"
              >
                <ItemAtlasIcon
                  frameKey={item.atlasFrame}
                  atlas={atlas}
                  cell={40}
                />
                <span className="line-clamp-2 w-full text-[11px] leading-snug text-zinc-200">
                  {item.name}
                </span>
                <span className="w-full truncate font-mono text-[9px] text-zinc-500">
                  {item.id}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {!file ? (
        <p className="text-sm text-zinc-400">Загрузка…</p>
      ) : (
        <ul className="flex flex-col gap-6">
          {visibleRecipeIndices.map((ri) => {
            const recipe = file.recipes[ri]!;
            return (
              <li
                key={`${recipe.id}-${ri}`}
                className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-4"
              >
                <div className="mb-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-500">id</span>
                    <input
                      className="w-56 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-sm"
                      value={recipe.id}
                      onChange={(e) =>
                        updateRecipe(ri, { ...recipe, id: e.target.value })
                      }
                    />
                  </label>
                  <div className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-500">Станция</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-300">
                        {CRAFT_STATION_META.find((s) => s.id === recipe.stationId)
                          ?.label ?? recipe.stationId}
                      </span>
                      <details className="relative">
                        <summary className="cursor-pointer list-none rounded border border-zinc-700 px-2 py-1 text-[11px] text-emerald-400 hover:bg-zinc-800">
                          Перенести…
                        </summary>
                        <div className="absolute left-0 z-20 mt-1 min-w-[10rem] rounded border border-zinc-600 bg-zinc-950 py-1 shadow-lg">
                          {CRAFT_STATION_META.filter((s) => s.id !== recipe.stationId).map(
                            (s) => (
                              <button
                                key={s.id}
                                type="button"
                                className="block w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-800"
                                onClick={() => {
                                  moveRecipeToStation(ri, s.id);
                                  (document.activeElement as HTMLElement | null)?.blur?.();
                                }}
                              >
                                {s.label}
                                <span className="ml-1 font-mono text-[10px] text-zinc-500">
                                  {s.id}
                                </span>
                              </button>
                            )
                          )}
                        </div>
                      </details>
                    </div>
                  </div>
                  <label className="flex min-w-[12rem] flex-col gap-1 text-xs">
                    <span className="text-zinc-500">Подпись</span>
                    <input
                      className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-sm"
                      value={recipe.label ?? ""}
                      onChange={(e) =>
                        updateRecipe(ri, {
                          ...recipe,
                          label: e.target.value || undefined,
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-zinc-500">Золото (опц.)</span>
                    <input
                      type="number"
                      min={0}
                      className="w-24 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-sm"
                      value={recipe.goldCost ?? ""}
                      onChange={(e) => {
                        const t = e.target.value;
                        updateRecipe(ri, {
                          ...recipe,
                          goldCost:
                            t === ""
                              ? undefined
                              : Math.max(0, Math.floor(Number(t) || 0)),
                        });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="ml-auto text-xs text-red-400 hover:text-red-300"
                    onClick={() => removeRecipe(ri)}
                  >
                    Удалить рецепт
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <IoBlock
                    title="Ингредиенты"
                    recipeIndex={ri}
                    kind="inputs"
                    recipe={recipe}
                    atlas={atlas}
                    datalistId={datalistId}
                    picker={picker}
                    onOpenPicker={openPicker}
                    onClosePicker={closePicker}
                    setIoLine={setIoLine}
                    addIoLine={addIoLine}
                    removeIoLine={removeIoLine}
                  />
                  <IoBlock
                    title="Результат"
                    recipeIndex={ri}
                    kind="outputs"
                    recipe={recipe}
                    atlas={atlas}
                    datalistId={datalistId}
                    picker={picker}
                    onOpenPicker={openPicker}
                    onClosePicker={closePicker}
                    setIoLine={setIoLine}
                    addIoLine={addIoLine}
                    removeIoLine={removeIoLine}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {file && visibleRecipeIndices.length === 0 ? (
        <p className="mt-4 text-sm text-zinc-500">
          На этой станции пока нет рецептов. Нажмите «+ Рецепт», чтобы добавить.
        </p>
      ) : null}
    </div>
  );
}

function IoBlock({
  title,
  recipeIndex,
  kind,
  recipe,
  atlas,
  datalistId,
  picker,
  onOpenPicker,
  onClosePicker,
  setIoLine,
  addIoLine,
  removeIoLine,
}: {
  title: string;
  recipeIndex: number;
  kind: IoKind;
  recipe: RecipeDef;
  atlas: ItemAtlasFramesFile | null;
  datalistId: string;
  picker: PickerTarget | null;
  onOpenPicker: (t: PickerTarget) => void;
  onClosePicker: () => void;
  setIoLine: (
    recipeIndex: number,
    kind: IoKind,
    lineIndex: number,
    field: "curatedId" | "qty",
    value: string
  ) => void;
  addIoLine: (recipeIndex: number, kind: IoKind) => void;
  removeIoLine: (recipeIndex: number, kind: IoKind, lineIndex: number) => void;
}) {
  const lines = recipe[kind];

  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </div>
      {lines.map((line, li) => {
        const def = getCuratedItem(line.curatedId);
        const frameKey = def?.atlasFrame ?? null;
        const pickerOpen =
          picker?.recipeIndex === recipeIndex &&
          picker?.kind === kind &&
          picker?.lineIndex === li;

        return (
          <div
            key={li}
            className="mb-2 rounded border border-zinc-800/80 bg-zinc-950/40 p-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <ItemAtlasIcon frameKey={frameKey} atlas={atlas} cell={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-zinc-200">
                  {def?.name ?? "Неизвестный id"}
                </div>
                <div className="truncate font-mono text-[10px] text-zinc-500">
                  {line.curatedId}
                  {def?.slot ? (
                    <span className="ml-1.5 text-zinc-600">
                      · {SLOT_LABEL[def.slot]}
                    </span>
                  ) : null}
                </div>
              </div>
              <label className="flex flex-col gap-0.5 text-[10px] text-zinc-500">
                <span>Кол-во</span>
                <input
                  type="number"
                  min={1}
                  className="w-16 rounded border border-zinc-600 bg-zinc-950 px-1.5 py-1 font-mono text-xs"
                  value={line.qty}
                  onChange={(e) =>
                    setIoLine(recipeIndex, kind, li, "qty", e.target.value)
                  }
                />
              </label>
              <button
                type="button"
                className={`rounded px-2 py-1 text-[11px] ${
                  pickerOpen
                    ? "bg-emerald-950 text-emerald-200 ring-1 ring-emerald-700"
                    : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
                onClick={() =>
                  pickerOpen
                    ? onClosePicker()
                    : onOpenPicker({ recipeIndex, kind, lineIndex: li })
                }
              >
                {pickerOpen ? "Скрыть каталог" : "Каталог"}
              </button>
              <input
                className="min-w-[6rem] max-w-[10rem] rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 font-mono text-[10px]"
                list={datalistId}
                title="Ручной ввод id"
                value={line.curatedId}
                onChange={(e) =>
                  setIoLine(recipeIndex, kind, li, "curatedId", e.target.value)
                }
              />
              {lines.length > 1 ? (
                <button
                  type="button"
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                  onClick={() => removeIoLine(recipeIndex, kind, li)}
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        className="text-xs text-emerald-400 hover:text-emerald-300"
        onClick={() => addIoLine(recipeIndex, kind)}
      >
        + строка
      </button>
    </div>
  );
}
