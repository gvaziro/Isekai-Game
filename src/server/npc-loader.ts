import fs from "fs/promises";
import path from "path";
import {
  npcBarksFileSchema,
  npcCharacterMdSchema,
  npcDialogueScriptsFileSchema,
  npcEventLineSchema,
  npcRouteSchema,
  npcTraitsSchema,
} from "@/src/game/data/schemas/npc";
import type { NpcBundle, NpcEvent, NpcRoute } from "@/src/server/types";
import type { ZodError } from "zod";

const NPC_ROOT = path.join(process.cwd(), "npcs");

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;

export function assertSafeNpcId(id: string): void {
  if (!ID_RE.test(id)) {
    throw new Error("Invalid npc id");
  }
}

export async function listNpcIds(): Promise<string[]> {
  try {
    const entries = await fs.readdir(NPC_ROOT, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && ID_RE.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

async function statMaxMtime(dir: string, names: string[]): Promise<number> {
  let max = 0;
  for (const n of names) {
    try {
      const st = await fs.stat(path.join(dir, n));
      max = Math.max(max, st.mtimeMs);
    } catch {
      /* optional files */
    }
  }
  return max;
}

function formatZodIssues(e: ZodError): string {
  return e.issues
    .map((i) => `${i.path.map(String).join(".")}: ${i.message}`)
    .join("; ");
}

function parseEventsJsonl(raw: string): NpcEvent[] {
  const lines = raw.trim().split("\n").filter(Boolean);
  const out: NpcEvent[] = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as unknown;
      const r = npcEventLineSchema.safeParse(parsed);
      if (r.success) {
        out.push(r.data);
      } else {
        console.warn(`[npc-loader] skip invalid events.jsonl row: ${formatZodIssues(r.error)}`);
      }
    } catch {
      /* skip bad line */
    }
  }
  return out;
}

export async function loadNpc(id: string): Promise<NpcBundle> {
  assertSafeNpcId(id);
  const dir = path.join(NPC_ROOT, id);
  const [characterMd, traitsRaw, eventsRaw, routeRaw] = await Promise.all([
    fs.readFile(path.join(dir, "character.md"), "utf8"),
    fs.readFile(path.join(dir, "traits.json"), "utf8"),
    fs.readFile(path.join(dir, "events.jsonl"), "utf8").catch(() => ""),
    fs.readFile(path.join(dir, "route.json"), "utf8"),
  ]);

  let traitsJson: unknown;
  let routeJson: unknown;
  try {
    traitsJson = JSON.parse(traitsRaw);
    routeJson = JSON.parse(routeRaw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`npc "${id}": invalid JSON in traits.json or route.json — ${msg}`);
  }

  const traitsResult = npcTraitsSchema.safeParse(traitsJson);
  if (!traitsResult.success) {
    console.error(`[npc-loader] traits.json validation failed for "${id}"`, traitsResult.error);
    throw new Error(
      `Invalid traits.json for npc "${id}": ${formatZodIssues(traitsResult.error)}`
    );
  }

  const routeResult = npcRouteSchema.safeParse(routeJson);
  if (!routeResult.success) {
    console.error(`[npc-loader] route.json validation failed for "${id}"`, routeResult.error);
    throw new Error(
      `Invalid route.json for npc "${id}": ${formatZodIssues(routeResult.error)}`
    );
  }

  const traits = traitsResult.data as Record<string, unknown>;
  const route = routeResult.data as NpcRoute;
  const charResult = npcCharacterMdSchema.safeParse(characterMd);
  if (!charResult.success) {
    console.error(`[npc-loader] character.md validation failed for "${id}"`, charResult.error);
    throw new Error(
      `Invalid character.md for npc "${id}": ${formatZodIssues(charResult.error)}`
    );
  }

  const events = parseEventsJsonl(eventsRaw);

  return {
    id,
    characterMd: charResult.data,
    traits,
    events,
    route,
  };
}

export async function npcBundleVersion(id: string): Promise<string> {
  assertSafeNpcId(id);
  const dir = path.join(NPC_ROOT, id);
  const m = await statMaxMtime(dir, [
    "character.md",
    "traits.json",
    "events.jsonl",
    "route.json",
    "barks.json",
    "dialogue_scripts.json",
  ]);
  return `${id}:${m.toFixed(0)}`;
}

export async function appendNpcEvent(id: string, evt: NpcEvent): Promise<void> {
  assertSafeNpcId(id);
  const parsed = npcEventLineSchema.parse(evt);
  const file = path.join(NPC_ROOT, id, "events.jsonl");
  const line = `${JSON.stringify(parsed)}\n`;
  await fs.appendFile(file, line, "utf8");
}

export async function loadNpcRouteOnly(id: string): Promise<NpcRoute> {
  assertSafeNpcId(id);
  const routeRaw = await fs.readFile(
    path.join(NPC_ROOT, id, "route.json"),
    "utf8"
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(routeRaw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`npc "${id}": invalid JSON in route.json — ${msg}`);
  }
  const routeResult = npcRouteSchema.safeParse(parsed);
  if (!routeResult.success) {
    throw new Error(
      `Invalid route.json for npc "${id}": ${formatZodIssues(routeResult.error)}`
    );
  }
  return routeResult.data as NpcRoute;
}

/** Квестовые scripted-сцены из `dialogue_scripts.json`. */
export type NpcDialogueScriptsPayload = {
  scenes: {
    id: string;
    questId: string;
    stageId: string;
    version: number;
    steps: {
      id: string;
      npcText: string;
      choices: {
        label: string;
        playerText?: string;
        nextStepId?: string;
        unlockLoreFactIds?: string[];
        complete?: boolean;
      }[];
    }[];
  }[];
};

/** Опциональные реплики при приближении; при ошибке — пустой массив. */
export async function loadNpcBarksOnly(id: string): Promise<string[]> {
  assertSafeNpcId(id);
  try {
    const raw = await fs.readFile(
      path.join(NPC_ROOT, id, "barks.json"),
      "utf8"
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[npc-loader] barks.json invalid JSON for "${id}": ${msg}`);
      return [];
    }
    const r = npcBarksFileSchema.safeParse(parsed);
    if (!r.success) {
      console.warn(
        `[npc-loader] barks.json validation failed for "${id}":`,
        formatZodIssues(r.error)
      );
      return [];
    }
    return r.data.lines;
  } catch {
    return [];
  }
}

/** Опциональные кнопки диалога; при отсутствии/ошибке — null. */
export async function loadNpcDialogueScriptsOnly(
  id: string
): Promise<NpcDialogueScriptsPayload | null> {
  assertSafeNpcId(id);
  try {
    const raw = await fs.readFile(
      path.join(NPC_ROOT, id, "dialogue_scripts.json"),
      "utf8"
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[npc-loader] dialogue_scripts.json invalid JSON for "${id}": ${msg}`
      );
      return null;
    }
    const r = npcDialogueScriptsFileSchema.safeParse(parsed);
    if (!r.success) {
      console.warn(
        `[npc-loader] dialogue_scripts.json validation failed for "${id}":`,
        formatZodIssues(r.error)
      );
      return null;
    }
    return {
      scenes: r.data.scenes,
    };
  } catch {
    return null;
  }
}

export async function loadNpcDisplayName(
  id: string
): Promise<string | undefined> {
  assertSafeNpcId(id);
  try {
    const raw = await fs.readFile(
      path.join(NPC_ROOT, id, "traits.json"),
      "utf8"
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined;
    }
    const traitsResult = npcTraitsSchema.safeParse(parsed);
    if (!traitsResult.success) {
      console.warn(
        `[npc-loader] traits.json invalid for "${id}", displayName skipped:`,
        formatZodIssues(traitsResult.error)
      );
      return undefined;
    }
    const n = traitsResult.data.name;
    return typeof n === "string" ? n : undefined;
  } catch {
    return undefined;
  }
}
