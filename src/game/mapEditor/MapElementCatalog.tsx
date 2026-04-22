"use client";

import { useMemo, useState } from "react";
import {
  groupByCategory,
  type CatalogItem,
} from "@/src/game/mapEditor/manifestCatalog";

type Props = {
  images: CatalogItem[];
  spritesheets: CatalogItem[];
  selectedKey: string;
  onSelectKey: (key: string) => void;
};

const CATEGORY_ORDER = [
  "Декор",
  "Здания",
  "PC: тайлсеты",
  "PC: пропсы",
  "PC: структуры",
  "PC: слайсы",
  "PC: environment",
  "Юниты",
  "Анимации / станции",
  "Прочее",
];

function sortCategoryKeys(keys: string[]): string[] {
  const rest = keys.filter((k) => !CATEGORY_ORDER.includes(k));
  const ordered = CATEGORY_ORDER.filter((k) => keys.includes(k));
  return [...ordered, ...rest.sort((a, b) => a.localeCompare(b, "ru"))];
}

type TypeFilter = "all" | "image" | "spritesheet";

export default function MapElementCatalog({
  images,
  spritesheets,
  selectedKey,
  onSelectKey,
}: Props) {
  const showImageSection = images.length > 0;
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [activeCats, setActiveCats] = useState<Set<string>>(() => new Set());
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    images: true,
    spritesheets: true,
    filters: false,
  });

  const q = query.trim().toLowerCase();

  const allCategories = useMemo(() => {
    const s = new Set<string>();
    for (const i of images) s.add(i.category);
    for (const i of spritesheets) s.add(i.category);
    return sortCategoryKeys([...s]);
  }, [images, spritesheets]);

  const passesCategory = (cat: string) =>
    activeCats.size === 0 || activeCats.has(cat);

  const filteredImages = useMemo(() => {
    const base = typeFilter === "spritesheet" ? [] : images;
    return base.filter(
      (i) =>
        (!q || i.key.toLowerCase().includes(q)) && passesCategory(i.category)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images, q, typeFilter, activeCats]);

  const filteredSheets = useMemo(() => {
    const base = typeFilter === "image" ? [] : spritesheets;
    return base.filter(
      (i) =>
        (!q || i.key.toLowerCase().includes(q)) && passesCategory(i.category)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spritesheets, q, typeFilter, activeCats]);

  const toggleCat = (cat: string) => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const imageGroups = useMemo(
    () => groupByCategory(filteredImages),
    [filteredImages]
  );
  const sheetGroups = useMemo(
    () => groupByCategory(filteredSheets),
    [filteredSheets]
  );

  function toggleSection(id: string): void {
    setOpenSections((s) => ({ ...s, [id]: !s[id] }));
  }

  return (
    <div className="space-y-2 rounded border border-zinc-700 p-2">
      <div className="text-xs font-medium text-zinc-400">Каталог элементов</div>
      <input
        type="search"
        placeholder="Поиск по ключу…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-xs placeholder:text-zinc-600"
      />

      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <span className="text-zinc-500">Тип:</span>
        {(
          [
            ["all", "Все"],
            ...(showImageSection ? ([["image", "Картинки"]] as const) : []),
            ["spritesheet", "Спрайты"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTypeFilter(id)}
            className={`rounded px-2 py-0.5 ${
              typeFilter === id
                ? "bg-amber-800 text-white"
                : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
        {activeCats.size > 0 ? (
          <button
            type="button"
            onClick={() => setActiveCats(new Set())}
            className="ml-auto rounded bg-zinc-800 px-2 py-0.5 text-zinc-400 hover:bg-zinc-700"
            title="Сбросить фильтры по категориям"
          >
            сброс ({activeCats.size})
          </button>
        ) : null}
      </div>

      <Section
        id="filters"
        title={`Категории${
          activeCats.size ? ` · выбрано ${activeCats.size}` : ""
        }`}
        open={openSections.filters ?? false}
        onToggle={() => toggleSection("filters")}
      >
        <div className="flex flex-wrap gap-1">
          {allCategories.map((cat) => {
            const on = activeCats.has(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCat(cat)}
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
                  on
                    ? "border-amber-500 bg-amber-950/60 text-amber-200"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {cat}
              </button>
            );
          })}
          {allCategories.length === 0 ? (
            <span className="text-[11px] text-zinc-500">
              Загрузка категорий…
            </span>
          ) : null}
        </div>
      </Section>

      {showImageSection ? (
        <Section
          id="images"
          title="Картинки"
          open={openSections.images ?? true}
          onToggle={() => toggleSection("images")}
        >
          {filteredImages.length === 0 ? (
            <p className="text-[11px] text-zinc-500">Ничего не найдено</p>
          ) : (
            sortCategoryKeys([...imageGroups.keys()]).map((cat) => (
              <div key={cat} className="mb-2">
                <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                  {cat}
                </div>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {(imageGroups.get(cat) ?? []).map((it) => (
                    <CatalogTile
                      key={it.key}
                      item={it}
                      selected={selectedKey === it.key}
                      onPick={() => onSelectKey(it.key)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </Section>
      ) : null}

      <Section
        id="spritesheets"
        title="Спрайтлисты (анимации)"
        open={openSections.spritesheets ?? true}
        onToggle={() => toggleSection("spritesheets")}
      >
        {filteredSheets.length === 0 ? (
          <p className="text-[11px] text-zinc-500">Ничего не найдено</p>
        ) : (
          sortCategoryKeys([...sheetGroups.keys()]).map((cat) => (
            <div key={cat} className="mb-2">
              <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">
                {cat}
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {(sheetGroups.get(cat) ?? []).map((it) => (
                  <CatalogTile
                    key={it.key}
                    item={it}
                    selected={selectedKey === it.key}
                    onPick={() => onSelectKey(it.key)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function Section(props: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-zinc-800 pt-2 first:border-t-0 first:pt-0">
      <button
        type="button"
        onClick={props.onToggle}
        className="mb-1 flex w-full items-center justify-between text-left text-xs font-medium text-amber-200/90"
      >
        {props.title}
        <span className="text-zinc-500">{props.open ? "−" : "+"}</span>
      </button>
      {props.open ? props.children : null}
    </div>
  );
}

function CatalogTile(props: {
  item: CatalogItem;
  selected: boolean;
  onPick: () => void;
}) {
  const { item, selected, onPick } = props;
  return (
    <button
      type="button"
      onClick={onPick}
      title={item.key}
      className={`flex flex-col items-center gap-0.5 rounded border p-1 transition-colors ${
        selected
          ? "border-amber-500 bg-amber-950/50 ring-1 ring-amber-600/80"
          : "border-zinc-700 bg-zinc-900/80 hover:border-zinc-500"
      }`}
    >
      <span className="relative block h-12 w-full overflow-hidden rounded bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element -- превью из public URL */}
        <img
          src={item.url}
          alt=""
          className="h-full w-full object-contain object-bottom"
          loading="lazy"
        />
      </span>
      <span className="max-w-full truncate px-0.5 font-mono text-[9px] text-zinc-400">
        {item.key}
      </span>
    </button>
  );
}
