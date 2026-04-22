"use client";

import { useEffect, useRef } from "react";

export type PropMenuPayload = {
  propIndex: number;
  clientX: number;
  clientY: number;
};

export type SpawnMenuPayload = {
  spawnKey: string;
  clientX: number;
  clientY: number;
};

export type GrassMenuPayload = {
  clientX: number;
  clientY: number;
};

/** ПКМ по маркеру постоянного моба леса (`enemySpawns`). */
export type MobMenuPayload = {
  mobIndex: number;
  clientX: number;
  clientY: number;
};

type Props =
  | {
      type: "prop";
      payload: PropMenuPayload;
      textureLabel: string;
      onDuplicate: () => void;
      onDelete: () => void;
      onClose: () => void;
    }
  | {
      type: "spawn";
      payload: SpawnMenuPayload;
      onClose: () => void;
    }
  | {
      type: "grass";
      payload: GrassMenuPayload;
      onClose: () => void;
    }
  | {
      type: "mob";
      payload: MobMenuPayload;
      mobLabel: string;
      onDelete: () => void;
      onClose: () => void;
    };

function menuPosition(clientX: number, clientY: number): {
  left: number;
  top: number;
} {
  const pad = 8;
  const w = 220;
  const h = 140;
  let left = clientX + pad;
  let top = clientY + pad;
  if (typeof window !== "undefined") {
    if (left + w > window.innerWidth - pad) left = clientX - w - pad;
    if (top + h > window.innerHeight - pad) top = clientY - h - pad;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
  }
  return { left, top };
}

export default function SelectionContextMenu(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const onClose = props.onClose;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (e.button === 2) return;
      const el = ref.current;
      if (!el?.contains(e.target as Node)) onClose();
    };
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", onDoc, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc, true);
    };
  }, [onClose]);

  const { left, top } = menuPosition(
    props.payload.clientX,
    props.payload.clientY
  );

  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      className="fixed z-[100] w-[min(220px,calc(100vw-16px))] rounded-lg border border-amber-900/80 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 shadow-xl"
      style={{ left, top }}
    >
      <div className="mb-2 border-b border-zinc-800 pb-1.5 text-xs font-semibold text-amber-200/95">
        {props.type === "prop" ? (
          <>
            Объект{" "}
            <span className="font-mono text-zinc-400">#{props.payload.propIndex}</span>
            <div className="mt-0.5 font-normal text-zinc-500">{props.textureLabel}</div>
          </>
        ) : props.type === "spawn" ? (
          <>
            Точка спавна{" "}
            <span className="font-mono text-zinc-400">{props.payload.spawnKey}</span>
          </>
        ) : props.type === "mob" ? (
          <>
            Постоянный моб{" "}
            <span className="font-mono text-zinc-400">#{props.payload.mobIndex}</span>
            <div className="mt-0.5 font-normal text-zinc-500">{props.mobLabel}</div>
          </>
        ) : (
          <>Трава (генерация)</>
        )}
      </div>
      <div className="flex flex-col gap-1">
        {props.type === "grass" ? (
          <p className="text-[11px] leading-snug text-zinc-400">
            Плотность и зерно генерации задайте в панели слева: блок «Трава» — поля
            seed и количество кустов.
          </p>
        ) : null}
        {props.type === "prop" ? (
          <>
            <button
              type="button"
              className="rounded bg-zinc-800 px-2 py-1.5 text-left text-xs hover:bg-zinc-700"
              onClick={() => {
                props.onDuplicate();
                props.onClose();
              }}
            >
              Дублировать
            </button>
            <button
              type="button"
              className="rounded bg-red-950/80 px-2 py-1.5 text-left text-xs text-red-200 hover:bg-red-900/80"
              onClick={() => {
                props.onDelete();
                props.onClose();
              }}
            >
              Удалить
            </button>
          </>
        ) : null}
        {props.type === "mob" ? (
          <button
            type="button"
            className="rounded bg-red-950/80 px-2 py-1.5 text-left text-xs text-red-200 hover:bg-red-900/80"
            onClick={() => {
              props.onDelete();
              props.onClose();
            }}
          >
            Удалить с карты
          </button>
        ) : null}
        <button
          type="button"
          className="rounded border border-zinc-700 px-2 py-1.5 text-left text-xs text-zinc-400 hover:bg-zinc-900"
          onClick={props.onClose}
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
