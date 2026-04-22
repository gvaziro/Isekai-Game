"use client";

import { useEffect, useState } from "react";

/**
 * Короткое уведомление о завершении этапа квеста (дублирует общий тост с акцентом).
 */
export default function QuestToast() {
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const onStage = (e: Event) => {
      const m = (e as CustomEvent<{ message?: string }>).detail?.message;
      if (!m) return;
      setMsg(m);
      window.setTimeout(() => setMsg(null), 2400);
    };
    window.addEventListener("nagibatop:quest-stage-complete", onStage);
    return () =>
      window.removeEventListener("nagibatop:quest-stage-complete", onStage);
  }, []);

  if (!msg) return null;

  return (
    <p
      className="pointer-events-none absolute bottom-28 left-1/2 z-40 max-w-md -translate-x-1/2 rounded-md border border-amber-700/80 bg-zinc-950/95 px-3 py-2 text-center text-xs text-amber-100 shadow-lg"
      role="status"
    >
      {msg}
    </p>
  );
}
