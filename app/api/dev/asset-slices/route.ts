import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isSliceEditableKey } from "@/src/game/data/assetSourceSlices";

const OVERRIDES_PATH = path.join(
  process.cwd(),
  "public",
  "asset-slice-overrides.json"
);

function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

type SlicePx = { left: number; top: number; width: number; height: number };

function isValidSlice(v: unknown): v is SlicePx {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.left === "number" &&
    Number.isFinite(o.left) &&
    o.left >= 0 &&
    typeof o.top === "number" &&
    Number.isFinite(o.top) &&
    o.top >= 0 &&
    typeof o.width === "number" &&
    Number.isFinite(o.width) &&
    o.width >= 1 &&
    typeof o.height === "number" &&
    Number.isFinite(o.height) &&
    o.height >= 1
  );
}

async function readOverrides(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(OVERRIDES_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Сохранить вырез для одного ключа манифеста в `public/asset-slice-overrides.json`.
 * Только development.
 */
export async function POST(req: Request) {
  if (!isDev()) {
    return NextResponse.json({ error: "Только в NODE_ENV=development" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Ожидается объект" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const key = o.key;
  const slice = o.slice;

  if (typeof key !== "string" || !isSliceEditableKey(key)) {
    return NextResponse.json(
      { error: "Недопустимый key (разрешены только ключи из assetSourceSlices)" },
      { status: 400 }
    );
  }

  if (!isValidSlice(slice)) {
    return NextResponse.json(
      { error: "Некорректный slice { left, top, width, height }" },
      { status: 400 }
    );
  }

  const data = await readOverrides();
  const next: Record<string, unknown> = { ...data };
  next[key] = {
    left: Math.floor(slice.left),
    top: Math.floor(slice.top),
    width: Math.floor(slice.width),
    height: Math.floor(slice.height),
  };
  next.updatedAt = new Date().toISOString();

  await fs.writeFile(
    OVERRIDES_PATH,
    `${JSON.stringify(next, null, 2)}\n`,
    "utf8"
  );

  return NextResponse.json({ ok: true, key, slice: next[key] });
}
