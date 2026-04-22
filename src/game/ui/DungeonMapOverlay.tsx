"use client";

import { useEffect, useRef } from "react";
import {
  DUNGEON_MAP_CELL,
  getDungeonFloorCellKeySetForFloor,
  getDungeonMapGridForFloor,
  getDungeonWallCellKeySetForFloor,
  parseCellCoordsFromKey,
  parseFloorFromCellKey,
  parseLocalGridCellKey,
} from "@/src/game/data/dungeonMap";
import { useGameStore } from "@/src/game/state/gameStore";

const CANVAS_W = 320;
const CANVAS_H = 240;

/** Ключ клетки сетки `gx,gy` как в `getDungeonWallCellKeySet`. */
function localGridKey(gx: number, gy: number): string {
  return `${gx},${gy}`;
}

/**
 * Стена рисуется, если рядом (квадрат Чебышёва ≤ ring) есть открытый **пол**,
 * по которому вы ходили — контур вокруг исследованного коридора.
 */
function wallNearRevealedWalkable(
  wx: number,
  wy: number,
  revealedWalkable: ReadonlySet<string>,
  chebRing: number
): boolean {
  for (let dy = -chebRing; dy <= chebRing; dy++) {
    for (let dx = -chebRing; dx <= chebRing; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) > chebRing) continue;
      if (revealedWalkable.has(localGridKey(wx + dx, wy + dy))) return true;
    }
  }
  return false;
}

/** Насколько дальше от открытого пола рисуем кольцо стен (в клетках сетки). */
const DUNGEON_MAP_WALL_RING_CHEB = 2;

export default function DungeonMapOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const floor = useGameStore((s) => s.dungeonCurrentFloor);
  const player = useGameStore((s) => s.player);
  const revealed = useGameStore((s) => s.dungeonRevealedCells);

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

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const { gw, gh } = getDungeonMapGridForFloor(floor);
    const cw = CANVAS_W / gw;
    const ch = CANVAS_H / gh;
    ctx.fillStyle = "#050506";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const floorTiles = getDungeonFloorCellKeySetForFloor(floor);
    const revealedCellKeys = new Set<string>();
    for (const [k, v] of Object.entries(revealed)) {
      if (!v) continue;
      if (parseFloorFromCellKey(k) !== floor) continue;
      const coords = parseCellCoordsFromKey(k);
      if (!coords) continue;
      revealedCellKeys.add(localGridKey(coords.gx, coords.gy));
    }

    const revealedWalkable = new Set<string>();
    for (const key of revealedCellKeys) {
      if (floorTiles.has(key)) revealedWalkable.add(key);
    }

    ctx.fillStyle = "#2a3530";
    for (const key of revealedWalkable) {
      const cell = parseLocalGridCellKey(key);
      if (!cell) continue;
      ctx.fillRect(
        cell.gx * cw,
        cell.gy * ch,
        Math.ceil(cw),
        Math.ceil(ch)
      );
    }

    ctx.fillStyle = "#5c6570";
    for (const cellKey of getDungeonWallCellKeySetForFloor(floor)) {
      const cell = parseLocalGridCellKey(cellKey);
      if (!cell) continue;
      if (
        !wallNearRevealedWalkable(
          cell.gx,
          cell.gy,
          revealedWalkable,
          DUNGEON_MAP_WALL_RING_CHEB
        )
      ) {
        continue;
      }
      ctx.fillRect(
        cell.gx * cw,
        cell.gy * ch,
        Math.ceil(cw),
        Math.ceil(ch)
      );
    }
    const pgx = player.x / DUNGEON_MAP_CELL;
    const pgy = player.y / DUNGEON_MAP_CELL;
    const cx = pgx * cw + cw / 2;
    const cy = pgy * ch + ch / 2;
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, cw * 0.35), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [open, floor, player.x, player.y, revealed]);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[92] flex flex-col items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Карта подземелья"
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-600 bg-zinc-900/97 p-4 shadow-2xl">
        <h2 className="text-center text-base font-semibold text-zinc-100">
          Этаж {floor}
        </h2>
        <p className="mt-1 text-center text-[11px] text-zinc-500">
          Видны только пол и стены там, где вы уже были; по мере движения карта
          открывается дальше.
        </p>
        <div className="mt-3 flex justify-center">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="max-w-full rounded border border-zinc-700 bg-black"
          />
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
