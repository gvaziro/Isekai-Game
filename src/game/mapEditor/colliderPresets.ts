import type { PropCollider } from "@/src/game/locations/types";

export type ColliderPreset = { id: string; label: string; collider: PropCollider };

export const COLLIDER_PRESETS: ColliderPreset[] = [
  {
    id: "full",
    label: "Полный кадр (стена/глыба)",
    collider: { w: 0, h: 0, oy: 0, fit: "frame" },
  },
  { id: "tree", label: "Дерево", collider: { w: 18, h: 10, oy: 6 } },
  { id: "rock", label: "Камень", collider: { w: 22, h: 12, oy: 7 } },
  { id: "bench", label: "Скамейка", collider: { w: 40, h: 14, oy: 8 } },
  { id: "chest", label: "Сундук", collider: { w: 26, h: 14, oy: 8 } },
  { id: "house", label: "Дом", collider: { w: 80, h: 24, oy: 14 } },
  { id: "none", label: "Без коллайдера", collider: { w: 0, h: 0, oy: 0 } },
];

export function presetCollider(id: string): PropCollider | undefined {
  const p = COLLIDER_PRESETS.find((x) => x.id === id);
  if (!p || p.id === "none") return undefined;
  return { ...p.collider };
}
