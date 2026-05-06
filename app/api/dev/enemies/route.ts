import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  ENEMY_DEFAULT_KEY,
  type EnemyDef,
} from "@/src/game/data/enemies";

const ENEMIES_PATH = path.join(
  process.cwd(),
  "src",
  "game",
  "data",
  "enemies.json"
);

const MOB_ID_RE = /^(?:__default|[a-z][a-z0-9_]{0,63})$/;
const LABEL_MAX = 80;

type EnemiesFile = {
  $schema?: string;
  updatedAt?: string;
  enemies: Record<string, EnemyDef>;
};

function isDev() {
  return process.env.NODE_ENV === "development";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function num(
  raw: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return clamp(raw, min, max);
}

function int(
  raw: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  return Math.floor(num(raw, min, max, fallback));
}

function sanitizeEnemyDef(raw: unknown, id: string): EnemyDef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const label =
    typeof o.label === "string" ? o.label.trim().slice(0, LABEL_MAX) : "";
  if (!label) return null;

  const baseIn = o.base;
  const scalingIn = o.scaling;
  const aiIn = o.ai;
  if (
    typeof baseIn !== "object" ||
    baseIn === null ||
    typeof scalingIn !== "object" ||
    scalingIn === null ||
    typeof aiIn !== "object" ||
    aiIn === null
  ) {
    return null;
  }
  const br = baseIn as Record<string, unknown>;
  const sr = scalingIn as Record<string, unknown>;
  const ar = aiIn as Record<string, unknown>;

  const base: EnemyDef["base"] = {
    hp: int(br.hp, 1, 50_000, 48),
    atk: int(br.atk, 1, 2000, 9),
    armor: int(br.armor, 0, 500, 2),
    speed: int(br.speed, 0, 400, 88),
    attackRange: int(br.attackRange, 8, 400, 38),
    attackCooldownMs: int(br.attackCooldownMs, 200, 6000, 980),
  };

  const scaling: EnemyDef["scaling"] = {
    hpLinear: num(sr.hpLinear, 0, 2, 0.12),
    hpQuad: num(sr.hpQuad, 0, 0.15, 0.008),
    atkPerLevel: num(sr.atkPerLevel, 0, 10, 1.4),
    armorPerLevel: num(sr.armorPerLevel, 0, 5, 0.45),
    speedPerLevel: num(sr.speedPerLevel, 0, 15, 2),
    speedCap: int(sr.speedCap, 50, 400, 130),
    attackRangePerLevelInv: int(sr.attackRangePerLevelInv, 1, 20, 4),
    cooldownDecayPerLevel: num(sr.cooldownDecayPerLevel, 0, 0.35, 0.025),
    cooldownDecayLevelCap: int(sr.cooldownDecayLevelCap, 0, 50, 8),
    cooldownMin: int(sr.cooldownMin, 200, 6000, 700),
  };

  const ai: EnemyDef["ai"] = {
    aggroRadius: int(ar.aggroRadius, 32, 900, 220),
    loseAggroRadius: int(ar.loseAggroRadius, 32, 900, 400),
    leashRadius: int(ar.leashRadius, 32, 900, 520),
  };

  const respawnMs = int(o.respawnMs, 1000, 3_600_000, 75_000);

  const def: EnemyDef = { label, base, scaling, ai, respawnMs };
  if (id !== ENEMY_DEFAULT_KEY && o.archived === true) {
    def.archived = true;
  }
  return def;
}

function sanitizeEnemiesPayload(raw: unknown): EnemiesFile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const enemiesRaw = o.enemies;
  if (typeof enemiesRaw !== "object" || enemiesRaw === null) return null;

  const enemies: Record<string, EnemyDef> = {};
  for (const [id, defRaw] of Object.entries(enemiesRaw)) {
    if (!MOB_ID_RE.test(id)) continue;
    const s = sanitizeEnemyDef(defRaw, id);
    if (s) enemies[id] = s;
  }
  if (!enemies[ENEMY_DEFAULT_KEY]) return null;
  if (Object.keys(enemies).length < 2) return null;

  return {
    $schema: typeof o.$schema === "string" ? o.$schema : undefined,
    updatedAt: new Date().toISOString(),
    enemies,
  };
}

async function readEnemies(): Promise<EnemiesFile> {
  const raw = await fs.readFile(ENEMIES_PATH, "utf8");
  const parsed = JSON.parse(raw) as EnemiesFile;
  if (!parsed?.enemies || typeof parsed.enemies !== "object") {
    throw new Error("Invalid enemies file");
  }
  return parsed;
}

export async function GET() {
  if (!isDev()) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await readEnemies();
    return NextResponse.json(data, {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  if (!isDev()) return new NextResponse("Not found", { status: 404 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }
  const merged = sanitizeEnemiesPayload(body);
  if (!merged) {
    return NextResponse.json(
      {
        error:
          "Body must be { enemies: { id: EnemyDef, ... } } with __default and at least one mob",
      },
      { status: 400 }
    );
  }

  await fs.writeFile(
    ENEMIES_PATH,
    JSON.stringify(merged, null, 2) + "\n",
    "utf8"
  );

  return NextResponse.json({
    ok: true,
    count: Object.keys(merged.enemies).length,
  });
}
