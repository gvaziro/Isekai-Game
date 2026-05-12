import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  BUFF_MULT_FIELD_KEYS,
  type BuffDef,
} from "@/src/game/data/balance";

const BUFFS_PATH = path.join(
  process.cwd(),
  "src",
  "game",
  "data",
  "buffs.json"
);

const BUFF_ID_RE = /^[a-z][a-z0-9_]{0,47}$/;
const MULT_MIN = 0.05;
const MULT_MAX = 5;
const LABEL_MAX = 80;

type BuffsFile = {
  $schema?: string;
  updatedAt?: string;
  buffs: Record<string, BuffDef>;
};

function isDev() {
  return process.env.NODE_ENV === "development";
}

function clampMult(n: number): number {
  return Math.min(MULT_MAX, Math.max(MULT_MIN, n));
}

function sanitizeBuffDef(raw: unknown): BuffDef | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const label =
    typeof o.label === "string" ? o.label.trim().slice(0, LABEL_MAX) : "";
  if (!label) return null;
  const out: BuffDef = { label };
  if (o.isDebuff === true) out.isDebuff = true;
  for (const key of BUFF_MULT_FIELD_KEYS) {
    const v = o[key];
    if (
      typeof v === "number" &&
      Number.isFinite(v) &&
      v > 0
    ) {
      out[key] = clampMult(v);
    }
  }
  return out;
}

function sanitizeBuffsPayload(raw: unknown): BuffsFile | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const buffsRaw = o.buffs;
  if (typeof buffsRaw !== "object" || buffsRaw === null) return null;
  const buffs: Record<string, BuffDef> = {};
  for (const [id, def] of Object.entries(buffsRaw)) {
    if (!BUFF_ID_RE.test(id)) continue;
    const s = sanitizeBuffDef(def);
    if (s) buffs[id] = s;
  }
  if (Object.keys(buffs).length === 0) return null;
  return {
    $schema: typeof o.$schema === "string" ? o.$schema : undefined,
    updatedAt: new Date().toISOString(),
    buffs,
  };
}

async function readBuffs(): Promise<BuffsFile> {
  const raw = await fs.readFile(BUFFS_PATH, "utf8");
  const parsed = JSON.parse(raw) as BuffsFile;
  if (!parsed?.buffs || typeof parsed.buffs !== "object") {
    throw new Error("Invalid buffs file");
  }
  return parsed;
}

export async function GET() {
  if (!isDev()) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await readBuffs();
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
  const merged = sanitizeBuffsPayload(body);
  if (!merged) {
    return NextResponse.json(
      { error: "Body must be { buffs: { id: BuffDef, ... } } with valid entries" },
      { status: 400 }
    );
  }

  await fs.writeFile(
    BUFFS_PATH,
    JSON.stringify(merged, null, 2) + "\n",
    "utf8"
  );

  return NextResponse.json({ ok: true, count: Object.keys(merged.buffs).length });
}
