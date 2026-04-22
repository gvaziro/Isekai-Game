"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  imageUrl: string;
  frameWidth: number;
  frameHeight: number;
  /** Если не задано — считается по размеру загруженной картинки. */
  frameCount?: number;
  value: number;
  onChange: (frame: number) => void;
  /** Сообщить выделенную область в координатах клеток (включитель). */
  onBrushRect?: (rect: {
    col0: number;
    row0: number;
    col1: number;
    row1: number;
  }) => void;
};

/** Выше — подписи только у наведённой ячейки (иначе каша). */
const LABEL_ALL_THRESHOLD = 200;

const ZOOM_MIN = 0.125;
const ZOOM_MAX = 64;

function clampFrame(n: number, frameCount: number): number {
  return Math.min(Math.max(0, Math.floor(n)), Math.max(0, frameCount - 1));
}

function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

type Cell = { col: number; row: number };

type BrushRect = { c0: number; r0: number; c1: number; r1: number };

function normalizeBrush(a: Cell, b: Cell): BrushRect {
  return {
    c0: Math.min(a.col, b.col),
    r0: Math.min(a.row, b.row),
    c1: Math.max(a.col, b.col),
    r1: Math.max(a.row, b.row),
  };
}

export default function SpriteSheetAtlasView({
  imageUrl,
  frameWidth,
  frameHeight,
  frameCount: frameCountProp,
  value,
  onChange,
  onBrushRect,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [derivedCount, setDerivedCount] = useState<number | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [containerW, setContainerW] = useState(280);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** Множитель к «вписанному» масштабу (1 = по ширине контейнера). */
  const [zoom, setZoom] = useState(1);
  const [brushRect, setBrushRect] = useState<BrushRect | null>(null);
  const dragRef = useRef<null | { start: Cell; cur: Cell; pointerId: number }>(
    null
  );

  const frameCount = frameCountProp ?? derivedCount ?? 0;

  useEffect(() => {
    setBrushRect(null);
  }, [imageUrl, frameWidth, frameHeight]);

  useEffect(() => {
    setZoom(1);
  }, [imageUrl, frameWidth, frameHeight]);

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

  useEffect(() => {
    setLoadErr(null);
    setDerivedCount(null);
    imgRef.current = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w <= 0 || h <= 0 || frameWidth <= 0 || frameHeight <= 0) {
        setDerivedCount(0);
        imgRef.current = null;
        return;
      }
      const cols = Math.floor(w / frameWidth);
      const rows = Math.floor(h / frameHeight);
      setDerivedCount(Math.max(0, cols * rows));
      imgRef.current = img;
    };
    img.onerror = () => {
      setLoadErr("Не удалось загрузить тайлсет");
      setDerivedCount(0);
      imgRef.current = null;
    };
    img.src = imageUrl;
  }, [imageUrl, frameWidth, frameHeight]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      setContainerW(280);
      return;
    }
    const ro = new ResizeObserver(() => {
      setContainerW(Math.max(120, el.clientWidth));
    });
    ro.observe(el);
    setContainerW(Math.max(120, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || frameWidth <= 0 || frameHeight <= 0 || frameCount <= 0) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = Math.floor(img.naturalWidth / frameWidth);
    const rows = Math.floor(img.naturalHeight / frameHeight);
    if (cols <= 0 || rows <= 0) return;

    const atlasW = cols * frameWidth;
    const atlasH = rows * frameHeight;
    const fitScale = containerW / atlasW;
    const intScale = Math.floor(fitScale);
    const baseScale = intScale >= 1 ? intScale : fitScale;
    const scale = clampZoom(baseScale * zoom);

    const dispW = Math.max(1, Math.round(atlasW * scale));
    const dispH = Math.max(1, Math.round(atlasH * scale));

    canvas.width = dispW;
    canvas.height = dispH;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, dispW, dispH);
    ctx.drawImage(img, 0, 0, atlasW, atlasH, 0, 0, dispW, dispH);

    const cellDispW = dispW / cols;
    const cellDispH = dispH / rows;
    const showAllLabels = frameCount <= LABEL_ALL_THRESHOLD;

    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(250, 204, 21, 0.35)";
    for (let c = 0; c <= cols; c++) {
      const x = Math.round(c * cellDispW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dispH);
      ctx.stroke();
    }
    for (let r = 0; r <= rows; r++) {
      const y = Math.round(r * cellDispH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(dispW, y);
      ctx.stroke();
    }

    const fontPx = Math.max(8, Math.min(11, Math.floor(cellDispH * 0.22)));
    ctx.font = `${fontPx}px ui-monospace, monospace`;
    ctx.textBaseline = "top";

    const drawLabel = (i: number, col: number, row: number) => {
      const x = col * cellDispW + 2;
      const y = row * cellDispH + 2;
      ctx.fillStyle = "rgba(0,0,0,0.65)";
      const t = String(i);
      const tw = ctx.measureText(t).width;
      ctx.fillRect(x, y, tw + 4, fontPx + 4);
      ctx.fillStyle = "rgba(254, 243, 199, 0.95)";
      ctx.fillText(t, x + 2, y + 1);
    };

    if (showAllLabels) {
      const maxI = Math.min(frameCount, cols * rows);
      for (let i = 0; i < maxI; i++) {
        drawLabel(i, i % cols, Math.floor(i / cols));
      }
    } else if (hoverIndex !== null && hoverIndex >= 0 && hoverIndex < frameCount) {
      const col = hoverIndex % cols;
      const row = Math.floor(hoverIndex / cols);
      drawLabel(hoverIndex, col, row);
    }

    const drawBrushOutline = (br: BrushRect, style: string, lineW: number) => {
      const x0 = Math.round(br.c0 * cellDispW) + 0.5;
      const y0 = Math.round(br.r0 * cellDispH) + 0.5;
      const x1 = Math.round((br.c1 + 1) * cellDispW) + 0.5;
      const y1 = Math.round((br.r1 + 1) * cellDispH) + 0.5;
      ctx.strokeStyle = style;
      ctx.lineWidth = lineW;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x0, y0, x1 - x0 - 1, y1 - y0 - 1);
      ctx.setLineDash([]);
    };

    const v = clampFrame(value, frameCount);
    const selCol = v % cols;
    const selRow = Math.floor(v / cols);

    if (brushRect) {
      drawBrushOutline(brushRect, "rgba(244, 114, 182, 0.95)", 2);
    } else {
      ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        Math.round(selCol * cellDispW) + 1,
        Math.round(selRow * cellDispH) + 1,
        Math.round(cellDispW) - 2,
        Math.round(cellDispH) - 2
      );
    }

    if (brushRect && (brushRect.c0 !== selCol || brushRect.r0 !== selRow)) {
      ctx.strokeStyle = "rgba(251, 191, 36, 0.75)";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        Math.round(selCol * cellDispW) + 1,
        Math.round(selRow * cellDispH) + 1,
        Math.round(cellDispW) - 2,
        Math.round(cellDispH) - 2
      );
    }
  }, [
    brushRect,
    containerW,
    frameCount,
    frameHeight,
    frameWidth,
    hoverIndex,
    value,
    zoom,
  ]);

  useEffect(() => {
    paint();
  }, [paint, imageUrl, derivedCount, loadErr]);

  const cellFromClient = (
    clientX: number,
    clientY: number
  ): Cell | null => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || frameCount <= 0) return null;
    const cols = Math.floor(img.naturalWidth / frameWidth);
    const rows = Math.floor(img.naturalHeight / frameHeight);
    if (cols <= 0) return null;
    const rect = canvas.getBoundingClientRect();
    const rx = (clientX - rect.left) * (canvas.width / rect.width);
    const ry = (clientY - rect.top) * (canvas.height / rect.height);
    const col = Math.floor((rx / canvas.width) * cols);
    const row = Math.floor((ry / canvas.height) * rows);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
    const idx = row * cols + col;
    if (idx >= frameCount) return null;
    return { col, row };
  };

  const indexFromCell = (cell: Cell, cols: number): number =>
    cell.row * cols + cell.col;

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const cell = cellFromClient(e.clientX, e.clientY);
    if (!cell) return;
    dragRef.current = { start: cell, cur: cell, pointerId: e.pointerId };
    setBrushRect(normalizeBrush(cell, cell));
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const img = imgRef.current;
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId || !img) return;
    const cols = Math.floor(img.naturalWidth / frameWidth);
    const cell = cellFromClient(e.clientX, e.clientY);
    if (cell) {
      drag.cur = cell;
      const idx = indexFromCell(cell, cols);
      if (idx !== hoverIndex) setHoverIndex(idx);
    }
    const br = normalizeBrush(drag.start, drag.cur);
    setBrushRect(br);
  };

  const finishPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const img = imgRef.current;
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId || !img) return;
    dragRef.current = null;
    try {
      (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const cols = Math.floor(img.naturalWidth / frameWidth);
    const br = normalizeBrush(drag.start, drag.cur);
    const topLeftIdx = indexFromCell({ col: br.c0, row: br.r0 }, cols);
    onChange(clampFrame(topLeftIdx, frameCount));
    setBrushRect(br);
    onBrushRect?.({
      col0: br.c0,
      row0: br.r0,
      col1: br.c1,
      row1: br.r1,
    });
  };

  const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) return;
    const cell = cellFromClient(e.clientX, e.clientY);
    if (!cell) {
      if (hoverIndex !== null) setHoverIndex(null);
      return;
    }
    const img = imgRef.current;
    if (!img) return;
    const cols = Math.floor(img.naturalWidth / frameWidth);
    const idx = indexFromCell(cell, cols);
    if (idx >= frameCount) {
      if (hoverIndex !== null) setHoverIndex(null);
      return;
    }
    if (idx !== hoverIndex) setHoverIndex(idx);
  };

  const onCanvasMouseLeave = () => {
    if (!dragRef.current) setHoverIndex(null);
  };

  if (frameCount <= 0) {
    return loadErr ? (
      <p className="text-[11px] text-red-400/90">{loadErr}</p>
    ) : (
      <p className="text-[11px] text-zinc-500">Загрузка карты кадров…</p>
    );
  }

  const wCells = brushRect ? brushRect.c1 - brushRect.c0 + 1 : 1;
  const hCells = brushRect ? brushRect.r1 - brushRect.r0 + 1 : 1;

  return (
    <div className="space-y-1.5 rounded border border-zinc-700 bg-zinc-900/60 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Карта кадров (тайлсет)
      </div>
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
          title="Сбросить к «вписать по ширине»"
        >
          Сброс
        </button>
        <span className="text-zinc-600">|</span>
        <span className="text-zinc-500">колёсико мыши — зум</span>
      </div>
      <p className="text-[10px] leading-snug text-zinc-500">
        Перетащите по сетке, чтобы выделить прямоугольник; левый верхний кадр
        станет активным. Один клик — одна ячейка.
        {frameCount > LABEL_ALL_THRESHOLD
          ? ` Кадров ${frameCount}: номер — у курсора.`
          : null}
      </p>
      {brushRect && (wCells > 1 || hCells > 1) ? (
        <p className="text-[10px] font-mono text-pink-300/90">
          Область: {wCells}×{hCells} клеток · ЛВ-кадр #{value}
        </p>
      ) : null}
      <div
        ref={wrapRef}
        className="max-h-[min(70vh,560px)] w-full overflow-auto rounded border border-zinc-600 bg-zinc-950"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Тайлсет: сетка кадров"
          className="block cursor-crosshair touch-none"
          style={{ imageRendering: "pixelated" }}
          onMouseMove={onCanvasMouseMove}
          onMouseLeave={onCanvasMouseLeave}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishPointer}
          onPointerCancel={finishPointer}
        />
      </div>
    </div>
  );
}
