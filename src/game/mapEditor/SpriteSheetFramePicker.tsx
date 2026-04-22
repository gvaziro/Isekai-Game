"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  imageUrl: string;
  frameWidth: number;
  frameHeight: number;
  /** Если не задано — считается по размеру загруженной картинки. */
  frameCount?: number;
  value: number;
  onChange: (frame: number) => void;
};

export default function SpriteSheetFramePicker({
  imageUrl,
  frameWidth,
  frameHeight,
  frameCount: frameCountProp,
  value,
  onChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [derivedCount, setDerivedCount] = useState<number | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const frameCount =
    frameCountProp ??
    derivedCount ??
    0;

  useEffect(() => {
    setLoadErr(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w <= 0 || h <= 0 || frameWidth <= 0 || frameHeight <= 0) {
        setDerivedCount(0);
        return;
      }
      const cols = Math.floor(w / frameWidth);
      const rows = Math.floor(h / frameHeight);
      setDerivedCount(Math.max(0, cols * rows));
    };
    img.onerror = () => {
      setLoadErr("Не удалось загрузить превью");
      setDerivedCount(0);
    };
    img.src = imageUrl;
  }, [imageUrl, frameWidth, frameHeight]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frameWidth <= 0 || frameHeight <= 0 || frameCount <= 0) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = 2;
    canvas.width = frameWidth * scale;
    canvas.height = frameHeight * scale;
    ctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const cols = Math.floor(img.naturalWidth / frameWidth);
      if (cols <= 0) return;
      const fi = Math.min(Math.max(0, value), frameCount - 1);
      const sx = (fi % cols) * frameWidth;
      const sy = Math.floor(fi / cols) * frameHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(
        img,
        sx,
        sy,
        frameWidth,
        frameHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
    };
    img.src = imageUrl;
  }, [imageUrl, frameWidth, frameHeight, frameCount, value]);

  if (frameCount <= 0) {
    return loadErr ? (
      <p className="text-[11px] text-red-400/90">{loadErr}</p>
    ) : (
      <p className="text-[11px] text-zinc-500">Считаю кадры…</p>
    );
  }

  const clamp = (n: number) =>
    Math.min(Math.max(0, Math.floor(n)), frameCount - 1);

  return (
    <div className="space-y-2 rounded border border-zinc-700 bg-zinc-900/60 p-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
        Кадр spritesheet
      </div>
      <div className="flex items-center gap-2">
        <canvas
          ref={canvasRef}
          className="rounded border border-zinc-600 bg-zinc-950"
          style={{ imageRendering: "pixelated" }}
        />
        <div className="flex flex-1 flex-col gap-1">
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded border border-zinc-600 px-2 py-0.5 text-xs hover:bg-zinc-800"
              onClick={() => onChange(clamp(value - 1))}
            >
              −
            </button>
            <input
              type="number"
              min={0}
              max={frameCount - 1}
              className="min-w-0 flex-1 rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
              value={value}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                onChange(clamp(n));
              }}
            />
            <button
              type="button"
              className="rounded border border-zinc-600 px-2 py-0.5 text-xs hover:bg-zinc-800"
              onClick={() => onChange(clamp(value + 1))}
            >
              +
            </button>
          </div>
          <span className="text-[10px] text-zinc-500">
            Кадр {value} / {frameCount - 1} · ячейка {frameWidth}×{frameHeight}
          </span>
        </div>
      </div>
    </div>
  );
}
