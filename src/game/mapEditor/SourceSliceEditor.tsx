"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notifyAssetSliceOverridesSaved } from "@/src/game/load/assetSliceOverridesRuntime";

export type SliceRect = { left: number; top: number; width: number; height: number };

type Props = {
  manifestKey: string;
  parentUrl: string;
  initialSlice: SliceRect;
  snapGrid?: number;
  cropSrcJoinHint: string;
};

type CellRect = { c0: number; r0: number; w: number; h: number };

const ZOOM_MIN = 0.125;
const ZOOM_MAX = 32;

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function sliceToCellRect(slice: SliceRect, g: number): CellRect {
  const c0 = Math.floor(slice.left / g);
  const r0 = Math.floor(slice.top / g);
  const c1 = Math.ceil((slice.left + slice.width) / g) - 1;
  const r1 = Math.ceil((slice.top + slice.height) / g) - 1;
  return {
    c0,
    r0,
    w: Math.max(1, c1 - c0 + 1),
    h: Math.max(1, r1 - r0 + 1),
  };
}

function cellRectToSlice(cr: CellRect, g: number): SliceRect {
  return {
    left: cr.c0 * g,
    top: cr.r0 * g,
    width: cr.w * g,
    height: cr.h * g,
  };
}

function clampSlicePx(r: SliceRect, iw: number, ih: number): SliceRect {
  let { left, top, width, height } = r;
  width = Math.max(1, Math.min(width, iw));
  height = Math.max(1, Math.min(height, ih));
  left = Math.max(0, Math.min(left, iw - width));
  top = Math.max(0, Math.min(top, ih - height));
  return { left, top, width, height };
}

function clampCellRect(cr: CellRect, iw: number, ih: number, g: number): CellRect {
  const px = clampSlicePx(cellRectToSlice(cr, g), iw, ih);
  return sliceToCellRect(px, g);
}

type HandleId =
  | "move"
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

function parseSliceFromJson(v: unknown): SliceRect | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.left === "number" &&
    Number.isFinite(o.left) &&
    o.left >= 0 &&
    typeof o.top === "number" &&
    Number.isFinite(o.top) &&
    o.top >= 0 &&
    typeof o.width === "number" &&
    Number.isFinite(o.width) &&
    o.width >= 1 &&
    typeof o.height === "number" &&
    Number.isFinite(o.height) &&
    o.height >= 1
  ) {
    return {
      left: Math.floor(o.left),
      top: Math.floor(o.top),
      width: Math.floor(o.width),
      height: Math.floor(o.height),
    };
  }
  return null;
}

async function fetchSliceOverride(
  manifestKey: string,
  fallback: SliceRect
): Promise<SliceRect> {
  try {
    const r = await fetch(`/asset-slice-overrides.json?cb=${Date.now()}`, {
      cache: "no-store",
    });
    if (!r.ok) return fallback;
    const j = (await r.json()) as Record<string, unknown>;
    const parsed = parseSliceFromJson(j[manifestKey]);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function applyCellDrag(
  mode: HandleId,
  start: CellRect,
  dCol: number,
  dRow: number,
  iw: number,
  ih: number,
  g: number
): CellRect {
  let { c0, r0, w, h } = start;
  switch (mode) {
    case "move":
      c0 += dCol;
      r0 += dRow;
      break;
    case "e":
      w += dCol;
      break;
    case "w":
      c0 += dCol;
      w -= dCol;
      break;
    case "s":
      h += dRow;
      break;
    case "n":
      r0 += dRow;
      h -= dRow;
      break;
    case "nw":
      c0 += dCol;
      r0 += dRow;
      w -= dCol;
      h -= dRow;
      break;
    case "ne":
      r0 += dRow;
      h -= dRow;
      w += dCol;
      break;
    case "se":
      w += dCol;
      h += dRow;
      break;
    case "sw":
      c0 += dCol;
      w -= dCol;
      h += dRow;
      break;
    default:
      break;
  }
  return clampCellRect({ c0, r0, w, h }, iw, ih, g);
}

function hitTestCell(
  cc: number,
  cr: number,
  R: CellRect,
  inflate: number
): HandleId | null {
  const { c0, r0, w, h } = R;
  const c1 = c0 + w - 1;
  const r1 = r0 + h - 1;

  const near = (a: number, b: number) => Math.abs(a - b) <= inflate;

  if (near(cc, c0) && near(cr, r0)) return "nw";
  if (near(cc, c1) && near(cr, r0)) return "ne";
  if (near(cc, c1) && near(cr, r1)) return "se";
  if (near(cc, c0) && near(cr, r1)) return "sw";

  if (cc >= c0 - inflate && cc <= c1 + inflate && near(cr, r0)) return "n";
  if (cc >= c0 - inflate && cc <= c1 + inflate && near(cr, r1)) return "s";
  if (near(cc, c0) && cr >= r0 - inflate && cr <= r1 + inflate) return "w";
  if (near(cc, c1) && cr >= r0 - inflate && cr <= r1 + inflate) return "e";

  if (cc >= c0 && cc <= c1 && cr >= r0 && cr <= r1) return "move";
  return null;
}

export default function SourceSliceEditor({
  manifestKey,
  parentUrl,
  initialSlice,
  snapGrid = 16,
  cropSrcJoinHint,
}: Props) {
  const g = snapGrid > 0 ? snapGrid : 1;

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [imageReady, setImageReady] = useState(false);
  const [containerW, setContainerW] = useState(360);
  const [zoom, setZoom] = useState(1);
  const [cellRect, setCellRect] = useState<CellRect>(() =>
    sliceToCellRect(initialSlice, g)
  );
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const dragRef = useRef<null | {
    mode: HandleId;
    start: CellRect;
    p0c: number;
    p0r: number;
    pointerId: number;
  }>(null);

  const rect = useMemo(() => cellRectToSlice(cellRect, g), [cellRect, g]);

  useEffect(() => {
    setZoom(1);
    setSaveMsg(null);
  }, [manifestKey, initialSlice, g]);

  useEffect(() => {
    setLoadErr(null);
    setImageReady(false);
    setSaveMsg(null);
    imgRef.current = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    let cancelled = false;
    const initSlice = initialSlice;
    const mk = manifestKey;
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      void (async () => {
        const base = await fetchSliceOverride(mk, initSlice);
        if (cancelled || !imgRef.current) return;
        setCellRect(
          clampCellRect(
            sliceToCellRect(base, g),
            img.naturalWidth,
            img.naturalHeight,
            g
          )
        );
        setImageReady(true);
      })();
    };
    img.onerror = () => {
      if (cancelled) return;
      setLoadErr(
        "Не удалось загрузить материнский лист (проверьте папку Pixel Crawler в public)."
      );
      imgRef.current = null;
      setImageReady(false);
    };
    img.src = parentUrl;
    return () => {
      cancelled = true;
    };
  }, [parentUrl, manifestKey, initialSlice, g]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      setContainerW(Math.max(160, el.clientWidth));
    });
    ro.observe(el);
    setContainerW(Math.max(160, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom((z) => clampZoom(z * factor));
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  const clientToImg = useCallback(
    (clientX: number, clientY: number, canvas: HTMLCanvasElement, img: HTMLImageElement) => {
      const rectEl = canvas.getBoundingClientRect();
      const sx = (clientX - rectEl.left) * (canvas.width / rectEl.width);
      const sy = (clientY - rectEl.top) * (canvas.height / rectEl.height);
      const scale = canvas.width / img.naturalWidth;
      return { ix: sx / scale, iy: sy / scale, scale };
    },
    []
  );

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    if (iw <= 0 || ih <= 0) return;

    const fitScale = containerW / iw;
    const intScale = Math.floor(fitScale);
    const baseScale = intScale >= 1 ? intScale : fitScale;
    const scale = clampZoom(baseScale * zoom);
    const cw = Math.max(1, Math.round(iw * scale));
    const ch = Math.max(1, Math.round(ih * scale));
    canvas.width = cw;
    canvas.height = ch;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, iw, ih, 0, 0, cw, ch);

    const gs = g * scale;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= cw; x += gs) {
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, ch);
      ctx.stroke();
    }
    for (let y = 0; y <= ch; y += gs) {
      ctx.beginPath();
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(cw, Math.round(y) + 0.5);
      ctx.stroke();
    }

    const R = clampCellRect(cellRect, iw, ih, g);
    const px = cellRectToSlice(R, g);
    const x0 = px.left * scale;
    const y0 = px.top * scale;
    const rw = px.width * scale;
    const rh = px.height * scale;
    ctx.fillStyle = "rgba(251, 191, 36, 0.14)";
    ctx.fillRect(x0, y0, rw, rh);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0 + 1, y0 + 1, rw - 2, rh - 2);
    const hs = 5;
    ctx.fillStyle = "rgba(254, 243, 199, 0.95)";
    const corners: [number, number][] = [
      [x0, y0],
      [x0 + rw, y0],
      [x0 + rw, y0 + rh],
      [x0, y0 + rh],
    ];
    for (const [cx, cy] of corners) {
      ctx.fillRect(cx - hs, cy - hs, hs * 2, hs * 2);
    }
  }, [cellRect, containerW, g, zoom]);

  useEffect(() => {
    paint();
  }, [paint, loadErr, imageReady]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;
    const { ix, iy } = clientToImg(e.clientX, e.clientY, canvas, img);
    const cc = Math.floor(Math.max(0, Math.min(ix, img.naturalWidth - 1e-6)) / g);
    const cr = Math.floor(Math.max(0, Math.min(iy, img.naturalHeight - 1e-6)) / g);
    const R = clampCellRect(cellRect, img.naturalWidth, img.naturalHeight, g);
    const mode = hitTestCell(cc, cr, R, 1);
    if (!mode) return;
    setSaveMsg(null);
    dragRef.current = {
      mode,
      start: { ...R },
      p0c: cc,
      p0r: cr,
      pointerId: e.pointerId,
    };
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId || !canvas || !img) return;
    const { ix, iy } = clientToImg(e.clientX, e.clientY, canvas, img);
    const cc = Math.floor(Math.max(0, Math.min(ix, img.naturalWidth - 1e-6)) / g);
    const cr = Math.floor(Math.max(0, Math.min(iy, img.naturalHeight - 1e-6)) / g);
    const dCol = cc - d.p0c;
    const dRow = cr - d.p0r;
    const next = applyCellDrag(
      d.mode,
      d.start,
      dCol,
      dRow,
      img.naturalWidth,
      img.naturalHeight,
      g
    );
    setCellRect(next);
  };

  const finishPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    try {
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const img = imgRef.current;
    if (!img) return;
    setCellRect((cr) =>
      clampCellRect(cr, img.naturalWidth, img.naturalHeight, g)
    );
  };

  const copySnippet = useCallback(() => {
    const { left, top, width, height } = rect;
    const outDecor = `path.join(outRoot, "decor", "${manifestKey}.png")`;
    const line = `await cropToFile(\n  ${cropSrcJoinHint},\n  ${left},\n  ${top},\n  ${width},\n  ${height},\n  ${outDecor}\n);`;
    void navigator.clipboard.writeText(line).catch(() => {
      window.prompt("Скопируйте вручную:", line);
    });
  }, [cropSrcJoinHint, manifestKey, rect]);

  const saveToProject = useCallback(async () => {
    const img = imgRef.current;
    if (!img) return;
    setSaveMsg(null);
    const px = cellRectToSlice(
      clampCellRect(cellRect, img.naturalWidth, img.naturalHeight, g),
      g
    );
    try {
      const res = await fetch("/api/dev/asset-slices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: manifestKey, slice: px }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? res.statusText);
      }
      notifyAssetSliceOverridesSaved();
      setSaveMsg(
        "Сохранено в public/asset-slice-overrides.json. Открытые вкладки с игрой или редактором карт подхватят вырез сами; иначе обнови страницу."
      );
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : String(e));
    }
  }, [cellRect, g, manifestKey]);

  if (loadErr) {
    return <p className="text-[11px] text-red-400/90">{loadErr}</p>;
  }

  if (!imageReady && !loadErr) {
    return <p className="text-[11px] text-zinc-500">Загрузка материнского листа…</p>;
  }

  const R = imgRef.current
    ? clampCellRect(cellRect, imgRef.current.naturalWidth, imgRef.current.naturalHeight, g)
    : cellRect;

  return (
    <div className="space-y-2 rounded border border-amber-900/50 bg-zinc-900/60 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-amber-400/90">
        Материнский лист (как в gen-assets)
      </div>
      <p className="text-[10px] leading-snug text-zinc-500">
        Сетка <span className="font-mono text-zinc-400">{g}×{g}px</span> — выделение
        только целыми клетками. Тяните углы/края или середину. «Сохранить в
        проект» записывает JSON в репозиторий (только dev). Копирование — шаблон
        для <code className="text-zinc-400">cropToFile</code>.
      </p>
      {saveMsg ? (
        <p
          className={`text-[11px] leading-snug ${
            saveMsg.startsWith("Сохранено")
              ? "text-emerald-400/90"
              : "text-red-400/90"
          }`}
        >
          {saveMsg}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
        <span>Масштаб:</span>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-0.5 hover:bg-zinc-800"
          onClick={() => setZoom((z) => clampZoom(z / 1.25))}
        >
          −
        </button>
        <span className="min-w-[3.5rem] text-center font-mono text-amber-200/90">
          {Math.round(zoom * 100)}%
        </span>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-0.5 hover:bg-zinc-800"
          onClick={() => setZoom((z) => clampZoom(z * 1.25))}
        >
          +
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-0.5 hover:bg-zinc-800"
          onClick={() => setZoom(1)}
        >
          Сброс
        </button>
      </div>
      <div className="font-mono text-[10px] text-zinc-400">
        клетки: c0={R.c0} r0={R.r0} w={R.w} h={R.h} · px left={rect.left} top={rect.top}{" "}
        w={rect.width} h={rect.height}
      </div>
      <div
        ref={wrapRef}
        className="max-h-[min(65vh,520px)] w-full overflow-auto rounded border border-zinc-600 bg-zinc-950"
      >
        <canvas
          ref={canvasRef}
          className="block touch-none"
          style={{ imageRendering: "pixelated", cursor: "crosshair" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded bg-emerald-900/80 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-800/90"
          onClick={() => void saveToProject()}
        >
          Сохранить в проект
        </button>
        <button
          type="button"
          className="rounded bg-amber-900/70 px-2 py-1 text-[11px] text-amber-100 hover:bg-amber-800/80"
          onClick={copySnippet}
        >
          Копировать шаблон cropToFile
        </button>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800"
          onClick={() => {
            const img = imgRef.current;
            const cr = sliceToCellRect(initialSlice, g);
            if (img) {
              setCellRect(
                clampCellRect(cr, img.naturalWidth, img.naturalHeight, g)
              );
            } else {
              setCellRect(cr);
            }
          }}
        >
          Сброс к gen-assets
        </button>
      </div>
    </div>
  );
}
