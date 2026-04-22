import { npcEventLineSchema } from "@/src/game/data/schemas/npc";
import type { z } from "zod";

export type NpcRoute = {
  spawn: { x: number; y: number };
  speed: number;
  idleMs: [number, number];
  waypoints: { x: number; y: number }[];
};

export type NpcEvent = z.infer<typeof npcEventLineSchema>;

export type NpcBundle = {
  id: string;
  characterMd: string;
  traits: Record<string, unknown>;
  events: NpcEvent[];
  route: NpcRoute;
};
