import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  type RecipesFile,
  recipesFileSchema,
} from "@/src/game/data/recipesSchema";

const RECIPES_PATH = path.join(
  process.cwd(),
  "src",
  "game",
  "data",
  "recipes.json"
);

function isDev() {
  return process.env.NODE_ENV === "development";
}

function sanitizeRecipesPayload(raw: unknown): RecipesFile | null {
  const parsed = recipesFileSchema.safeParse(raw);
  if (!parsed.success) return null;
  const seen = new Set<string>();
  const recipes = parsed.data.recipes.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  return {
    $schema: parsed.data.$schema,
    updatedAt: new Date().toISOString(),
    recipes,
  };
}

export async function GET() {
  if (!isDev()) return new NextResponse("Not found", { status: 404 });
  try {
    const raw = await fs.readFile(RECIPES_PATH, "utf8");
    const data = JSON.parse(raw) as unknown;
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
  const merged = sanitizeRecipesPayload(body);
  if (!merged) {
    return NextResponse.json(
      {
        error:
          "Invalid recipes file (expected { recipes: [...] } with valid entries)",
      },
      { status: 400 }
    );
  }

  await fs.writeFile(
    RECIPES_PATH,
    JSON.stringify(merged, null, 2) + "\n",
    "utf8"
  );

  return NextResponse.json({ ok: true, count: merged.recipes.length });
}
