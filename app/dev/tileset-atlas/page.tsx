import { notFound } from "next/navigation";
import TilesetAtlasGate from "./TilesetAtlasGate";

export default function DevTilesetAtlasPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <TilesetAtlasGate />;
}
