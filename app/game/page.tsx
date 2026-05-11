"use client";

import { useIsElectronClient } from "@/src/game/hooks/useIsElectronClient";
import GameShell from "./GameShell";

export default function GamePage() {
  const electron = useIsElectronClient();

  if (electron) {
    return (
      <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-black text-zinc-100">
        <div className="flex min-h-0 flex-1 flex-col">
          <GameShell />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <GameShell />
    </div>
  );
}
