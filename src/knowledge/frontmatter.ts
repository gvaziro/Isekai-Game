import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Frontmatter, FrontmatterValue, KnowledgeDocument, KnowledgeType } from "./types";

const FRONTMATTER_MARKER = "---";

export function parseMarkdownDocument(filePath: string, rootDir: string): KnowledgeDocument {
  const raw = fs.readFileSync(filePath, "utf8");
  const { metadata, body } = parseFrontmatter(raw);
  const id = asString(metadata.id);
  const type = asKnowledgeType(metadata.type);
  const title = asString(metadata.title);

  return {
    id,
    type,
    title,
    metadata,
    body: body.trim(),
    sourcePath: toPosixPath(path.relative(rootDir, filePath)),
    contentHash: createHash("sha256").update(raw).digest("hex"),
  };
}

export function parseFrontmatter(raw: string): { metadata: Frontmatter; body: string } {
  const normalized = raw.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);

  if (lines[0] !== FRONTMATTER_MARKER) {
    throw new Error("Missing YAML frontmatter marker");
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === FRONTMATTER_MARKER);
  if (endIndex < 0) {
    throw new Error("Missing closing YAML frontmatter marker");
  }

  return {
    metadata: parseYamlSubset(lines.slice(1, endIndex)),
    body: lines.slice(endIndex + 1).join("\n"),
  };
}

export function parseYamlSubset(lines: string[]): Frontmatter {
  const data: Frontmatter = {};
  let activeListKey: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line.trim() || line.trimStart().startsWith("#")) {
      continue;
    }

    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && activeListKey) {
      const current = data[activeListKey];
      const values = Array.isArray(current) ? current : [];
      values.push(parseScalar(listItem[1] ?? "") as string);
      data[activeListKey] = values;
      continue;
    }

    activeListKey = null;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) {
      throw new Error(`Unsupported YAML line: ${line}`);
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!rawValue) {
      data[key] = [];
      activeListKey = key;
      continue;
    }

    data[key] = parseScalar(rawValue);
  }

  return data;
}

function parseScalar(rawValue: string): FrontmatterValue {
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (rawValue === "null") return null;

  if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
    const inner = rawValue.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => stripQuotes(item.trim()));
  }

  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return Number(rawValue);
  }

  return stripQuotes(rawValue);
}

function stripQuotes(value: string): string {
  const first = value.at(0);
  const last = value.at(-1);
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function asString(value: FrontmatterValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function asKnowledgeType(value: FrontmatterValue | undefined): KnowledgeType {
  if (value === "fact" || value === "entity" || value === "book" || value === "locked") {
    return value;
  }
  return "fact";
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
