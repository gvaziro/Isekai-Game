"use client";

import { useSyncExternalStore } from "react";
import { isElectronClient } from "@/src/game/desktop";

function subscribeNoop(): () => void {
  return () => {};
}

/** Снимок десктопа без гидратационного рассинхрона (сервер: false). */
export function useIsElectronClient(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => isElectronClient(),
    () => false
  );
}
