import { notFound } from "next/navigation";
import CharacterEditorGate from "./CharacterEditorGate";

export default function DevCharacterEditorPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <CharacterEditorGate />;
}
