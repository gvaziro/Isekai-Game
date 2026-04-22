"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FOREST_MAP_CELL, parseForestCellKey } from "@/src/game/data/forestMap";
import {
  createForestMinimapChunkCache,
  FOREST_MINIMAP_COLORS,
  sampleForestMinimapTerrain,
} from "@/src/game/data/forestMapTerrain";
import { FOREST_HUB_EXITS } from "@/src/game/locations/forestChunkGen";
import { useGameStore } from "@/src/game/state/gameStore";

const CANVAS_W = 320;
const CANVAS_H = 240;
const BASE_VIEW_GW = 48;
const BASE_VIEW_GH = 36;
const ZOOM_MIN = 0.45;
const ZOOM_MAX = 2.8;
const EXIT_MINIMAP_FILL = "#ca8a04";
const EXIT_MINIMAP_STROKE = "#fde047";

function drawGuideLineToTarget(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  w: number,
  h: number
): void {
  const margin = 10;
  const loX = margin;
  const hiX = w - margin;
  const loY = margin;
  const hiY = h - margin;
  const dx = tx - px;
  const dy = ty - py;
  const dist = Math.hypot(dx, dy);
  if (dist < 6) return;
  const ux = dx / dist;
  const uy = dy / dist;
  let tMax = Infinity;
  if (ux > 1e-8) tMax = Math.min(tMax, (hiX - px) / ux);
  else if (ux < -1e-8) tMax = Math.min(tMax, (loX - px) / ux);
  if (uy > 1e-8) tMax = Math.min(tMax, (hiY - py) / uy);
  else if (uy < -1e-8) tMax = Math.min(tMax, (loY - py) / uy);
  if (!Number.isFinite(tMax) || tMax <= 0) return;
  const tTarget = (tx - px) * ux + (ty - py) * uy;
  const tLine = Math.min(tTarget > 0 ? tTarget : tMax, tMax);
  const ax = px + ux * tLine;
  const ay = py + uy * tLine;
  ctx.save();
  ctx.strokeStyle = "rgba(253, 224, 71, 0.85)";
  ctx.fillStyle = "rgba(253, 224, 71, 0.95)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(ax, ay);
  ctx.stroke();
  ctx.setLineDash([]);
  const back = 9;
  const wing = 5;
  const bx = ax - ux * back;
  const by = ay - uy * back;
  const pxp = -uy * wing;
  const pyp = ux * wing;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx + pxp, by + pyp);
  ctx.lineTo(bx - pxp, by - pyp);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export default function ForestMapOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerDragRef = useRef<{ id: number } | null>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [panCell, setPanCell] = useState({ x: 0, y: 0 });
  const player = useGameStore((s) => s.player);
  const revealed = useGameStore((s) => s.forestRevealedCells);
  const worldSeed = useGameStore((s) => s.forestWorldSeed);

  const viewGw = Math.max(
    18,
    Math.round(BASE_VIEW_GW / mapZoom)
  );
  const viewGh = Math.max(
    14,
    Math.round(BASE_VIEW_GH / mapZoom)
  );

  useEffect(() => {
    if (!open) return;
    setPanCell({ x: 0, y: 0 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.code === "KeyM") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const onWheelCanvas = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const dir = e.deltaY > 0 ? 0.9 : 1.11;
    setMapZoom((z) => {
      const n = z * dir;
      return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, n));
    });
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerDragRef.current = { id: e.pointerId };
    },
    []
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!pointerDragRef.current || pointerDragRef.current.id !== e.pointerId) {
        return;
      }
      const cw = CANVAS_W / viewGw;
      const ch = CANVAS_H / viewGh;
      setPanCell((p) => ({
        x: p.x + e.movementX / cw,
        y: p.y + e.movementY / ch,
      }));
    },
    [viewGw, viewGh]
  );

  const endPointerDrag = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointerDragRef.current?.id === e.pointerId) {
        pointerDragRef.current = null;
      }
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    const cw = CANVAS_W / viewGw;
    const ch = CANVAS_H / viewGh;

    const pc = {
      gx: Math.floor(player.x / FOREST_MAP_CELL),
      gy: Math.floor(player.y / FOREST_MAP_CELL),
    };
    const originGx = Math.floor(pc.gx - viewGw / 2 - panCell.x);
    const originGy = Math.floor(pc.gy - viewGh / 2 - panCell.y);

    ctx.fillStyle = FOREST_MINIMAP_COLORS.void;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const revealedSet = new Set<string>();
    for (const [k, v] of Object.entries(revealed)) {
      if (!v) continue;
      const coords = parseForestCellKey(k);
      if (!coords) continue;
      revealedSet.add(`${coords.gx},${coords.gy}`);
    }

    const chunkCache = createForestMinimapChunkCache();
    const seed = worldSeed || 1;

    for (let iy = 0; iy < viewGh; iy++) {
      for (let ix = 0; ix < viewGw; ix++) {
        const gx = originGx + ix;
        const gy = originGy + iy;
        if (!revealedSet.has(`${gx},${gy}`)) continue;
        const kind = sampleForestMinimapTerrain(gx, gy, seed, chunkCache);
        ctx.fillStyle = FOREST_MINIMAP_COLORS[kind];
        ctx.fillRect(ix * cw, iy * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }

    const townExit = FOREST_HUB_EXITS[0];
    if (townExit) {
      const gx0 = Math.floor(townExit.x / FOREST_MAP_CELL);
      const gx1 = Math.floor((townExit.x + townExit.w - 1) / FOREST_MAP_CELL);
      const gy0 = Math.floor(townExit.y / FOREST_MAP_CELL);
      const gy1 = Math.floor((townExit.y + townExit.h - 1) / FOREST_MAP_CELL);
      for (let gy = gy0; gy <= gy1; gy++) {
        for (let gx = gx0; gx <= gx1; gx++) {
          if (!revealedSet.has(`${gx},${gy}`)) continue;
          const sx = (gx - originGx) * cw;
          const sy = (gy - originGy) * ch;
          ctx.fillStyle = EXIT_MINIMAP_FILL;
          ctx.fillRect(sx, sy, Math.ceil(cw), Math.ceil(ch));
          ctx.strokeStyle = EXIT_MINIMAP_STROKE;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, sy + 0.5, Math.ceil(cw) - 1, Math.ceil(ch) - 1);
        }
      }
    }

    const pxCell = player.x / FOREST_MAP_CELL;
    const pyCell = player.y / FOREST_MAP_CELL;
    const vx = (pxCell - originGx) * cw + cw / 2;
    const vy = (pyCell - originGy) * ch + ch / 2;

    if (townExit) {
      const exCx = townExit.x + townExit.w / 2;
      const exCy = townExit.y + townExit.h / 2;
      const exPx = exCx / FOREST_MAP_CELL;
      const exPy = exCy / FOREST_MAP_CELL;
      const exSx = (exPx - originGx) * cw + cw / 2;
      const exSy = (exPy - originGy) * ch + ch / 2;
      drawGuideLineToTarget(ctx, vx, vy, exSx, exSy, CANVAS_W, CANVAS_H);
    }

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(vx, vy, Math.max(3, cw * 0.35), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [
    open,
    panCell.x,
    panCell.y,
    player.x,
    player.y,
    revealed,
    worldSeed,
    viewGw,
    viewGh,
  ]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[92] flex flex-col items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Карта леса"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-600 bg-zinc-900/97 p-4 shadow-2xl">
        <h2 className="text-center text-base font-semibold text-zinc-100">
          Лес
        </h2>
        <p className="mt-1 text-center text-[11px] text-zinc-500">
          Разведанная область: дорога, деревья, камни, кусты и трава. Перетащите
          карту указателем, колёсико — масштаб. Жёлтая пунктирная линия и
          стрелка — направление к выходу в поселение (на хабе).
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() =>
              setMapZoom((z) => Math.min(ZOOM_MAX, z * 1.15))
            }
          >
            +
          </button>
          <span className="self-center font-mono text-[10px] text-zinc-500">
            {Math.round(mapZoom * 100)}%
          </span>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() =>
              setMapZoom((z) => Math.max(ZOOM_MIN, z / 1.15))
            }
          >
            −
          </button>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
            onClick={() => setPanCell({ x: 0, y: 0 })}
          >
            К игроку
          </button>
        </div>
        <div className="mt-2 flex justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="max-w-full touch-none cursor-grab rounded border border-zinc-700 bg-black active:cursor-grabbing"
            onWheel={onWheelCanvas}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endPointerDrag}
            onPointerCancel={endPointerDrag}
            onLostPointerCapture={() => {
              pointerDragRef.current = null;
            }}
          />
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[9px] text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: EXIT_MINIMAP_FILL }} />
            выход в город
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: FOREST_MINIMAP_COLORS.path }} />
            тропа
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: FOREST_MINIMAP_COLORS.tree }} />
            деревья
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: FOREST_MINIMAP_COLORS.rock }} />
            камни
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: FOREST_MINIMAP_COLORS.bush }} />
            кусты
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm" style={{ background: FOREST_MINIMAP_COLORS.grass }} />
            трава
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-zinc-600"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-zinc-500">
          <kbd className="rounded bg-zinc-800 px-1">M</kbd> или{" "}
          <kbd className="rounded bg-zinc-800 px-1">Esc</kbd> — закрыть
        </p>
      </div>
    </div>
  );
}
