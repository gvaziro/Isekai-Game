import { describe, expect, it } from "vitest";
import { nextTool, TOOL_ORDER } from "@/src/game/mapEditor/mapEditorShortcuts";

describe("mapEditorShortcuts", () => {
  it("nextTool cycles", () => {
    expect(TOOL_ORDER.length).toBe(9);
    expect(nextTool("select", 1)).toBe("paint");
    expect(nextTool("path", 1)).toBe("exit");
    expect(nextTool("exit", 1)).toBe("pan");
    expect(nextTool("pan", 1)).toBe("select");
    expect(nextTool("paint", -1)).toBe("select");
  });
});
