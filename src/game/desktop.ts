export type LastSummonProfileIpcResult =
  | { ok: true; data: string | null }
  | { ok: false; error: string };

export type LastSummonDesktopBridge = {
  isElectron: true;
  platform: string;
  versions: { electron: string; chrome: string };
  /** Чтение сейва профиля из `userData` (только Electron). */
  profileRead?: () => Promise<LastSummonProfileIpcResult>;
  /** Запись JSON-профиля (валидируется в main-процессе). */
  profileWrite?: (json: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

declare global {
  interface Window {
    lastSummonDesktop?: LastSummonDesktopBridge;
  }
}

export function getDesktopBridge(): LastSummonDesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return window.lastSummonDesktop;
}

export function isElectronClient(): boolean {
  return Boolean(getDesktopBridge()?.isElectron);
}
