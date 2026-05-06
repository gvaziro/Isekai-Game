"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getLocation } from "@/src/game/locations";
import {
  mergeAssetManifestWithExtras,
  type CharacterPackJson,
} from "@/src/game/load/mergeAssetManifestExtras";
import {
  buildCatalogFromManifestLoad,
  type CatalogItem,
  type ManifestLoadEntry,
} from "@/src/game/mapEditor/manifestCatalog";
import type { AssetManifest } from "@/src/game/types";
import {
  getAssetSourceSlice,
  isSliceEditableKey,
} from "@/src/game/data/assetSourceSlices";
import {
  collectTextureUsageFromLocations,
  formatUsageLocations,
  type MapTextureUsageRow,
} from "@/src/game/mapEditor/mapTextureUsage";
import MapElementCatalog from "@/src/game/mapEditor/MapElementCatalog";
import SourceSliceEditor from "@/src/game/mapEditor/SourceSliceEditor";
import SpriteSheetAtlasView from "@/src/game/mapEditor/SpriteSheetAtlasView";
import SpriteSheetFramePicker from "@/src/game/mapEditor/SpriteSheetFramePicker";

export default function TilesetAtlasRoot() {
  const [catalogImages, setCatalogImages] = useState<CatalogItem[]>([]);
  const [catalogSpritesheets, setCatalogSpritesheets] = useState<CatalogItem[]>(
    []
  );
  const [textureKey, setTextureKey] = useState("");
  const [paintFrame, setPaintFrame] = useState(0);
  const [imageWholeSize, setImageWholeSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [mapSourceLabel, setMapSourceLabel] = useState<string | null>(null);
  const [brushSummary, setBrushSummary] = useState<string | null>(null);

  // Снимок при монтировании; при правках карты перезагрузите страницу.
  const usageRows = useMemo(
    () => collectTextureUsageFromLocations((id) => getLocation(id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dev-страница, снимок ключей
    []
  );

  useEffect(() => {
    void Promise.all([
      fetch("/assets/world/manifest.json").then((r) => r.json()),
      fetch("/assets/world/pixel-crawler-environment.load.json")
        .then((r) => (r.ok ? r.json() : { load: [] }))
        .catch(() => ({ load: [] })),
      fetch("/assets/world/pixel-crawler-slices.load.json")
        .then((r) => (r.ok ? r.json() : { load: [] }))
        .catch(() => ({ load: [] })),
      fetch("/assets/world/pixel-crawler-autoslices.load.json")
        .then((r) => (r.ok ? r.json() : { load: [] }))
        .catch(() => ({ load: [] })),
      fetch("/assets/world/character-pack.json")
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({})),
    ])
      .then(
        ([data, extra, slices, autoSlices, characterPack]: [
          AssetManifest,
          { load?: ManifestLoadEntry[] },
          { load?: ManifestLoadEntry[] },
          { load?: ManifestLoadEntry[] },
          Record<string, unknown>,
        ]) => {
          const merged = mergeAssetManifestWithExtras(data, {
            pcEnvLoad: extra as { load?: AssetManifest["load"] },
            pcSlicesLoad: slices as { load?: AssetManifest["load"] },
            pcAutoSlicesLoad: autoSlices as { load?: AssetManifest["load"] },
            characterPack:
              characterPack &&
              typeof characterPack === "object" &&
              ("load" in characterPack ||
                "animations" in characterPack ||
                "units" in characterPack ||
                "mobs" in characterPack)
                ? (characterPack as CharacterPackJson)
                : null,
          });
          const { images, spritesheets } = buildCatalogFromManifestLoad(
            merged.load
          );
          setCatalogImages(images);
          setCatalogSpritesheets(spritesheets);
        }
      )
      .catch(() => {
        setCatalogImages([]);
        setCatalogSpritesheets([]);
      });
  }, []);

  useEffect(() => {
    setPaintFrame(0);
    setBrushSummary(null);
  }, [textureKey]);

  useEffect(() => {
    const all = [...catalogImages, ...catalogSpritesheets];
    if (!all.length) return;
    setTextureKey((prev) => {
      const ok = prev && all.some((c) => c.key === prev);
      if (ok) return prev;
      return all[0]!.key;
    });
  }, [catalogImages, catalogSpritesheets]);

  const selected = useMemo(() => {
    return (
      catalogSpritesheets.find((c) => c.key === textureKey) ??
      catalogImages.find((c) => c.key === textureKey)
    );
  }, [catalogImages, catalogSpritesheets, textureKey]);

  useEffect(() => {
    if (selected?.type !== "image") {
      setImageWholeSize(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () =>
      setImageWholeSize({
        w: img.naturalWidth,
        h: img.naturalHeight,
      });
    img.onerror = () => setImageWholeSize(null);
    img.src = selected.url;
  }, [selected?.type, selected?.url]);

  const findCatalogForTexture = useCallback(
    (texture: string): CatalogItem | undefined => {
      return (
        catalogSpritesheets.find((c) => c.key === texture) ??
        catalogImages.find((c) => c.key === texture)
      );
    },
    [catalogImages, catalogSpritesheets]
  );

  const selectFromMapRow = useCallback(
    (row: MapTextureUsageRow) => {
      const item = findCatalogForTexture(row.texture);
      if (!item) {
        setMapSourceLabel(null);
        window.alert(
          `Текстура «${row.texture}» не найдена в манифесте (возможно, ключ другой).`
        );
        return;
      }
      setTextureKey(item.key);
      setPaintFrame(row.frame ?? 0);
      setMapSourceLabel(
        `${row.texture}${row.frame !== undefined ? ` · кадр ${row.frame}` : ""} · ${formatUsageLocations(row)}`
      );
    },
    [findCatalogForTexture]
  );

  const onCatalogSelectKey = useCallback((key: string) => {
    setTextureKey(key);
    setMapSourceLabel(null);
  }, []);

  const onBrushRect = useCallback(
    (rect: { col0: number; row0: number; col1: number; row1: number }) => {
      const w = rect.col1 - rect.col0 + 1;
      const h = rect.row1 - rect.row0 + 1;
      setBrushSummary(
        w > 1 || h > 1
          ? `Сетка: столбцы ${rect.col0}–${rect.col1}, строки ${rect.row0}–${rect.row1} (${w}×${h} клеток). В JSON пропа сейчас хранится один кадр (левый верх).`
          : null
      );
    },
    []
  );

  const sliceDef = selected ? getAssetSourceSlice(selected.key) : undefined;

  const spriteSheetDims =
    selected?.type === "spritesheet" &&
    selected.frameWidth != null &&
    selected.frameHeight != null
      ? { fw: selected.frameWidth, fh: selected.frameHeight }
      : null;

  const showImageAtlas =
    selected?.type === "image" &&
    imageWholeSize &&
    imageWholeSize.w > 0 &&
    imageWholeSize.h > 0;

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3 lg:max-w-md">
        <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 text-sm text-zinc-300">
          <p className="mb-2">
            Для пропов вроде{" "}
            <code className="text-amber-200/90">bench</code> /{" "}
            <code className="text-amber-200/90">chest</code> ниже появится блок
            «материнский лист» — жёлтая рамка совпадает с вырезом из{" "}
            <code className="text-zinc-400">gen-assets.mjs</code>; её можно
            сдвинуть и скопировать готовую строку <code className="text-zinc-400">
              cropToFile
            </code>
            . Масштаб и прокрутка — для больших тайлсетов. «Объекты с карты» —
            реальные ключи из локаций. Позиция на карте —{" "}
            <Link
              href="/dev/map-editor"
              className="text-emerald-400 underline hover:text-emerald-300"
            >
              редактор карт
            </Link>
            .
          </p>
        </div>

        <div className="rounded border border-zinc-700 bg-zinc-900/50 p-2">
          <div className="mb-2 text-xs font-medium text-zinc-400">
            Объекты с карты
          </div>
          <p className="mb-2 text-[10px] leading-snug text-zinc-500">
            Клик — открыть ту же текстуру здесь (спрайтшит + кадр или цельная
            картинка).
          </p>
          <ul className="max-h-52 space-y-1 overflow-y-auto pr-1 text-left">
            {usageRows.map((row) => {
              const k =
                row.frame !== undefined
                  ? `${row.texture}#${row.frame}`
                  : row.texture;
              return (
                <li key={k}>
                  <button
                    type="button"
                    onClick={() => selectFromMapRow(row)}
                    className="w-full rounded border border-zinc-700 bg-zinc-950/80 px-2 py-1.5 text-left text-[11px] text-zinc-200 hover:border-amber-700/60 hover:bg-zinc-900"
                  >
                    <span className="font-mono text-amber-200/90">
                      {row.texture}
                      {row.frame !== undefined ? (
                        <span className="text-sky-300/90"> #{row.frame}</span>
                      ) : null}
                      {isSliceEditableKey(row.texture) ? (
                        <span className="ml-1 text-[9px] uppercase text-amber-500/90">
                          gen
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-zinc-500">
                      {formatUsageLocations(row)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <MapElementCatalog
          images={catalogImages}
          spritesheets={catalogSpritesheets}
          selectedKey={textureKey}
          onSelectKey={onCatalogSelectKey}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        {mapSourceLabel ? (
          <p className="rounded border border-sky-900/60 bg-sky-950/30 px-2 py-1.5 text-[11px] text-sky-200/90">
            Выбрано с карты: {mapSourceLabel}
          </p>
        ) : null}

        {spriteSheetDims && selected ? (
          <>
            <SpriteSheetFramePicker
              imageUrl={selected.url}
              frameWidth={spriteSheetDims.fw}
              frameHeight={spriteSheetDims.fh}
              frameCount={selected.frameCount}
              value={paintFrame}
              onChange={setPaintFrame}
            />
            <SpriteSheetAtlasView
              imageUrl={selected.url}
              frameWidth={spriteSheetDims.fw}
              frameHeight={spriteSheetDims.fh}
              frameCount={selected.frameCount}
              value={paintFrame}
              onChange={setPaintFrame}
              onBrushRect={onBrushRect}
            />
            <MetaBlock
              selected={selected}
              paintFrame={paintFrame}
              brushSummary={brushSummary}
            />
          </>
        ) : showImageAtlas ? (
          <>
            <p className="text-[11px] text-zinc-400">
              Цельная текстура (не тайлсет): одна «ячейка» = весь файл. Масштаб и
              рамка — для визуального контроля.
            </p>
            <SpriteSheetAtlasView
              imageUrl={selected!.url}
              frameWidth={imageWholeSize.w}
              frameHeight={imageWholeSize.h}
              frameCount={1}
              value={0}
              onChange={() => {}}
              onBrushRect={onBrushRect}
            />
            <MetaBlock
              selected={selected!}
              paintFrame={0}
              brushSummary={brushSummary}
              imagePixelSize={imageWholeSize}
            />
            {sliceDef ? (
              <SourceSliceEditor
                key={sliceDef.manifestKey}
                manifestKey={sliceDef.manifestKey}
                parentUrl={sliceDef.parentUrl}
                initialSlice={sliceDef.slice}
                snapGrid={sliceDef.snapGrid ?? 0}
                cropSrcJoinHint={sliceDef.cropSrcJoinHint}
              />
            ) : null}
          </>
        ) : selected?.type === "image" ? (
          <p className="text-sm text-zinc-500">Загрузка размеров картинки…</p>
        ) : selected ? (
          <p className="text-sm text-amber-200/90">
            У выбранного спрайтшита нет frameWidth/frameHeight в манифесте — карта
            кадров недоступна.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Загрузка каталога…</p>
        )}
      </div>
    </div>
  );
}

function MetaBlock(props: {
  selected: CatalogItem;
  paintFrame: number;
  brushSummary: string | null;
  imagePixelSize?: { w: number; h: number } | null;
}) {
  const { selected, paintFrame, brushSummary, imagePixelSize } = props;
  return (
    <div className="space-y-1 rounded border border-zinc-800 bg-zinc-900/50 px-3 py-2 font-mono text-[11px] text-zinc-400">
      <div>key: {selected.key}</div>
      {selected.type === "spritesheet" ? (
        <div>
          кадр: {paintFrame}
          {selected.frameCount != null
            ? ` / ${selected.frameCount - 1}`
            : ""}
        </div>
      ) : null}
      {selected.type === "image" && imagePixelSize ? (
        <div>
          файл: {imagePixelSize.w}×{imagePixelSize.h}px
        </div>
      ) : null}
      {selected.type === "spritesheet" &&
      selected.frameWidth &&
      selected.frameHeight ? (
        <div>
          ячейка: {selected.frameWidth}×{selected.frameHeight}
        </div>
      ) : null}
      {brushSummary ? (
        <p className="border-t border-zinc-800 pt-1 font-sans text-[10px] leading-snug text-pink-200/85">
          {brushSummary}
        </p>
      ) : null}
    </div>
  );
}
