import type { MapEditorBridgeTool } from "@/src/game/mapEditor/MapEditScene";

/** Соответствие клавиш → инструмент (по e.code). */
export const TOOL_BY_CODE: Partial<
  Record<string, MapEditorBridgeTool>
> = {
  Digit1: "select",
  Digit2: "paint",
  Digit3: "spawn",
  Digit4: "pan",
  Digit5: "npc",
  Digit6: "mob",
  Digit7: "grass",
  Digit8: "path",
  Digit9: "exit",
  KeyV: "select",
  KeyB: "paint",
  KeyS: "spawn",
  KeyH: "pan",
  KeyN: "npc",
  KeyM: "mob",
  KeyG: "grass",
  KeyR: "path",
  KeyP: "exit",
};

export const TOOL_ORDER: MapEditorBridgeTool[] = [
  "select",
  "paint",
  "spawn",
  "npc",
  "mob",
  "grass",
  "path",
  "exit",
  "pan",
];

export function toolLabel(tool: MapEditorBridgeTool): string {
  switch (tool) {
    case "select":
      return "Выбор";
    case "paint":
      return "Кисть";
    case "spawn":
      return "Спавн";
    case "npc":
      return "NPC";
    case "mob":
      return "Моб";
    case "grass":
      return "Трава";
    case "path":
      return "Дорожка";
    case "exit":
      return "Переход";
    case "pan":
      return "Просмотр";
    default:
      return tool;
  }
}

export function nextTool(
  current: MapEditorBridgeTool,
  delta: 1 | -1
): MapEditorBridgeTool {
  const i = TOOL_ORDER.indexOf(current);
  const idx = i < 0 ? 0 : (i + delta + TOOL_ORDER.length) % TOOL_ORDER.length;
  return TOOL_ORDER[idx] ?? "select";
}
