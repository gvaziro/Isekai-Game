import GameShell from "./GameShell";

export default function GamePage() {
  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-950 px-4 py-10 text-zinc-100">
      <GameShell />
    </div>
  );
}
