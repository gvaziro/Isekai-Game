import { notFound } from "next/navigation";
import MapEditorGate from "./MapEditorGate";

export default function DevMapEditorPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <MapEditorGate />;
}
