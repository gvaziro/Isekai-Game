import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadKnowledgeDocuments, searchKnowledgeIndex } from "./knowledgeBase";
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeIndex,
  KnowledgeIndexEntry,
  KnowledgeVectorIndex,
  KnowledgeVectorIndexEntry,
  VectorIndexHealth,
  VectorSearchResult,
} from "./types";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";
export const DEFAULT_VECTOR_INDEX_FILE = "knowledge-vector-index.json";
export const DEFAULT_EMBEDDING_BATCH_SIZE = 64;

const NPC_PROFILE_DIRS = ["npcs", "docs/first-city-npcs"];

export type EmbedTexts = (texts: string[], model: string) => Promise<number[][]>;

export function getEmbeddingModel(): string {
  return process.env.EMBEDDING_MODEL?.trim() || DEFAULT_EMBEDDING_MODEL;
}

export function getVectorIndexPath(rootDir: string): string {
  return process.env.KNOWLEDGE_VECTOR_INDEX_PATH?.trim()
    ? path.resolve(rootDir, process.env.KNOWLEDGE_VECTOR_INDEX_PATH)
    : path.join(rootDir, DEFAULT_VECTOR_INDEX_FILE);
}

export function getEmbeddingBatchSize(): number {
  const raw = Number(process.env.EMBEDDING_BATCH_SIZE);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_EMBEDDING_BATCH_SIZE;
}

export function collectKnowledgeChunks(rootDir: string): KnowledgeChunk[] {
  const worldChunks = loadKnowledgeDocuments(rootDir).flatMap((doc) => chunksFromKnowledgeDocument(doc));
  const npcProfileChunks = loadNpcProfileChunks(rootDir);
  return [...worldChunks, ...npcProfileChunks].sort((a, b) => a.id.localeCompare(b.id));
}

export function readKnowledgeVectorIndex(indexPath: string): KnowledgeVectorIndex {
  const parsed = JSON.parse(fs.readFileSync(indexPath, "utf8")) as unknown;
  return parseKnowledgeVectorIndex(parsed, indexPath);
}

export function writeKnowledgeVectorIndex(indexPath: string, index: KnowledgeVectorIndex): void {
  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}

export async function buildKnowledgeVectorIndex(options: {
  rootDir: string;
  indexPath?: string;
  model?: string;
  batchSize?: number;
  embedTexts: EmbedTexts;
}): Promise<KnowledgeVectorIndex> {
  const rootDir = options.rootDir;
  const indexPath = options.indexPath ?? getVectorIndexPath(rootDir);
  const model = options.model ?? getEmbeddingModel();
  const batchSize = options.batchSize ?? getEmbeddingBatchSize();
  const chunks = collectKnowledgeChunks(rootDir);
  const previous = safeReadVectorIndex(indexPath);
  const previousById = new Map(previous?.entries.map((entry) => [entry.id, entry]) ?? []);
  const entries: KnowledgeVectorIndexEntry[] = [];
  const missing: KnowledgeChunk[] = [];

  for (const chunk of chunks) {
    const old = previousById.get(chunk.id);
    if (old && previous?.model === model && old.content_hash === chunk.content_hash && old.embedding.length > 0) {
      entries.push({ ...chunk, embedding: old.embedding });
    } else {
      missing.push(chunk);
    }
  }

  if (missing.length > 0) {
    const embeddings: number[][] = [];
    for (let start = 0; start < missing.length; start += batchSize) {
      const batch = missing.slice(start, start + batchSize);
      embeddings.push(...(await options.embedTexts(batch.map((chunk) => chunk.text), model)));
    }
    if (embeddings.length !== missing.length) {
      throw new Error(`Embedding count mismatch: expected ${missing.length}, got ${embeddings.length}`);
    }
    for (let index = 0; index < missing.length; index += 1) {
      const chunk = missing[index];
      const embedding = embeddings[index];
      if (!chunk || !embedding) continue;
      entries.push({ ...chunk, embedding });
    }
  }

  const dimensions = entries.find((entry) => entry.embedding.length > 0)?.embedding.length ?? previous?.dimensions ?? 0;
  const vectorIndex: KnowledgeVectorIndex = {
    generated_at: new Date().toISOString(),
    model,
    dimensions,
    entries: entries.sort((a, b) => a.id.localeCompare(b.id)),
    stats: {
      chunks: chunks.length,
      embedded: missing.length,
      reused: entries.length - missing.length,
      stale: previous ? countStaleChunks(chunks, previous) : 0,
      orphan: previous ? countOrphanEntries(chunks, previous) : 0,
    },
  };
  writeKnowledgeVectorIndex(indexPath, vectorIndex);
  return vectorIndex;
}

export function checkKnowledgeVectorIndex(options: {
  rootDir: string;
  indexPath?: string;
  expectedModel?: string;
}): VectorIndexHealth {
  const rootDir = options.rootDir;
  const indexPath = options.indexPath ?? getVectorIndexPath(rootDir);
  const expectedModel = options.expectedModel ?? getEmbeddingModel();
  const chunks = collectKnowledgeChunks(rootDir);
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));

  if (!fs.existsSync(indexPath)) {
    return health("missing", indexPath, expectedModel, null, null, chunks, 0, {
      message: "Vector index file does not exist.",
      missing_chunks: chunks.length,
    });
  }

  let vectorIndex: KnowledgeVectorIndex;
  try {
    vectorIndex = readKnowledgeVectorIndex(indexPath);
  } catch (error) {
    return health("invalid", indexPath, expectedModel, null, null, chunks, 0, {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const invalidEntries = vectorIndex.entries.filter((entry) => !isValidVectorEntry(entry, vectorIndex.dimensions)).length;
  const missingChunks = chunks.filter((chunk) => !vectorIndex.entries.some((entry) => entry.id === chunk.id)).length;
  const staleChunks = countStaleChunks(chunks, vectorIndex);
  const orphanEntries = countOrphanEntries(chunks, vectorIndex);
  const base = {
    missing_chunks: missingChunks,
    stale_chunks: staleChunks,
    orphan_entries: orphanEntries,
    invalid_entries: invalidEntries,
  };

  if (vectorIndex.model !== expectedModel) {
    return health("model_mismatch", indexPath, expectedModel, vectorIndex.model, vectorIndex.dimensions, chunks, vectorIndex.entries.length, {
      ...base,
      message: `Expected model ${expectedModel}, found ${vectorIndex.model}.`,
    });
  }
  if (invalidEntries > 0) {
    return health("dimension_mismatch", indexPath, expectedModel, vectorIndex.model, vectorIndex.dimensions, chunks, vectorIndex.entries.length, {
      ...base,
      message: `${invalidEntries} entries have invalid vector dimensions or values.`,
    });
  }
  if (missingChunks > 0 || staleChunks > 0 || orphanEntries > 0) {
    return health("stale", indexPath, expectedModel, vectorIndex.model, vectorIndex.dimensions, chunks, vectorIndex.entries.length, {
      ...base,
      message: "Vector index is out of sync with current chunks.",
    });
  }

  for (const entry of vectorIndex.entries) {
    if (!chunkById.has(entry.id)) continue;
  }

  return health("ok", indexPath, expectedModel, vectorIndex.model, vectorIndex.dimensions, chunks, vectorIndex.entries.length, base);
}

export function searchKnowledgeVectorIndex(
  vectorIndex: KnowledgeVectorIndex,
  queryEmbedding: number[],
  query: string,
  options: {
    limit?: number;
    allowedDocumentIds?: Set<string>;
    allowedChunkIds?: Set<string>;
    lexicalIndex?: KnowledgeIndex;
  } = {}
): VectorSearchResult[] {
  if (queryEmbedding.length !== vectorIndex.dimensions) return [];
  const limit = options.limit ?? 10;
  const lexicalScores = buildLexicalScores(options.lexicalIndex, query, limit * 4);

  return vectorIndex.entries
    .filter((entry) => {
      if (entry.embedding.length !== vectorIndex.dimensions) return false;
      if (!entry.embedding.every(Number.isFinite)) return false;
      if (options.allowedChunkIds?.has(entry.id)) return true;
      if (options.allowedDocumentIds?.has(entry.document_id)) return true;
      return !options.allowedChunkIds && !options.allowedDocumentIds;
    })
    .map((entry) => {
      const vectorScore = dotProduct(queryEmbedding, entry.embedding);
      const lexicalScore = lexicalScores.get(entry.document_id) ?? lexicalScores.get(entry.id) ?? 0;
      return {
        ...entry,
        vector_score: vectorScore,
        lexical_score: lexicalScore,
        score: vectorScore + lexicalScore * 0.05,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function filterVectorIndexToCurrentChunks(
  vectorIndex: KnowledgeVectorIndex,
  chunks: KnowledgeChunk[]
): KnowledgeVectorIndex {
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  return {
    ...vectorIndex,
    entries: vectorIndex.entries.filter((entry) => {
      const chunk = chunkById.get(entry.id);
      return Boolean(chunk && chunk.content_hash === entry.content_hash && isValidVectorEntry(entry, vectorIndex.dimensions));
    }),
  };
}

function parseKnowledgeVectorIndex(value: unknown, indexPath: string): KnowledgeVectorIndex {
  if (!isRecord(value)) throw new Error(`Invalid vector index at ${indexPath}: expected object`);
  const generatedAt = value.generated_at;
  const model = value.model;
  const dimensions = value.dimensions;
  if (typeof generatedAt !== "string") throw new Error("Invalid vector index: generated_at must be string");
  if (typeof model !== "string" || !model.trim()) throw new Error("Invalid vector index: model must be string");
  if (typeof dimensions !== "number" || !Number.isInteger(dimensions) || dimensions < 0) {
    throw new Error("Invalid vector index: dimensions must be a non-negative integer");
  }
  if (!Array.isArray(value.entries)) throw new Error("Invalid vector index: entries must be array");

  const entries = value.entries.map((entry, index) => parseVectorEntry(entry, index));
  return {
    generated_at: generatedAt,
    model,
    dimensions,
    entries,
    stats: isRecord(value.stats)
      ? {
          chunks: numberOrZero(value.stats.chunks),
          embedded: numberOrZero(value.stats.embedded),
          reused: numberOrZero(value.stats.reused),
          stale: numberOrZero(value.stats.stale),
          orphan: numberOrZero(value.stats.orphan),
        }
      : { chunks: entries.length, embedded: entries.length },
  };
}

function requiredStringField(
  value: Record<string, unknown>,
  field: string,
  index: number
): string {
  const raw = value[field];
  if (typeof raw !== "string") {
    throw new Error(`Invalid vector index entry ${index}: ${field} must be string`);
  }
  return raw;
}

function parseVectorEntry(value: unknown, index: number): KnowledgeVectorIndexEntry {
  if (!isRecord(value)) throw new Error(`Invalid vector index entry ${index}: expected object`);
  const required = ["id", "document_id", "source_path", "title", "type", "text", "content_hash"] as const;
  const strings = Object.fromEntries(
    required.map((field) => [field, requiredStringField(value, field, index)])
  ) as Record<(typeof required)[number], string>;
  if (!Array.isArray(value.embedding)) throw new Error(`Invalid vector index entry ${index}: embedding must be array`);
  return {
    id: strings.id,
    document_id: strings.document_id,
    source_path: strings.source_path,
    title: strings.title,
    type: strings.type as KnowledgeVectorIndexEntry["type"],
    tags: asStringArray(value.tags),
    tier: nullableString(value.tier),
    truth_level: nullableString(value.truth_level),
    related: asStringArray(value.related),
    text: strings.text,
    content_hash: strings.content_hash,
    embedding: value.embedding.filter((item): item is number => typeof item === "number"),
  };
}

export function vectorResultsToKnowledgeEntries(
  results: VectorSearchResult[],
  lexicalIndex: KnowledgeIndex
): KnowledgeIndexEntry[] {
  const byId = new Map(lexicalIndex.entries.map((entry) => [entry.id, entry]));
  const out: KnowledgeIndexEntry[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    if (seen.has(result.document_id)) continue;
    const entry = byId.get(result.document_id);
    if (!entry) continue;
    out.push(entry);
    seen.add(result.document_id);
  }

  return out;
}

function chunksFromKnowledgeDocument(doc: KnowledgeDocument): KnowledgeChunk[] {
  if (doc.type === "fact" || doc.type === "locked") {
    return [chunkFromDocument(doc, "body", doc.title, doc.body)];
  }

  const sections = splitMarkdownSections(doc.body);
  return sections.map((section, index) =>
    chunkFromDocument(
      doc,
      section.slug || `section-${index + 1}`,
      section.title ? `${doc.title} / ${section.title}` : doc.title,
      [doc.title, section.title, section.text].filter(Boolean).join("\n\n")
    )
  );
}

function chunkFromDocument(doc: KnowledgeDocument, suffix: string, title: string, text: string): KnowledgeChunk {
  return {
    id: `${doc.id}#${safeId(suffix)}`,
    document_id: doc.id,
    source_path: doc.sourcePath,
    title,
    type: doc.type,
    tags: asStringArray(doc.metadata.tags),
    tier: nullableString(doc.metadata.tier),
    truth_level: nullableString(doc.metadata.truth_level),
    related: asStringArray(doc.metadata.related),
    text: text.trim(),
    content_hash: hashText(`${doc.contentHash}:${suffix}:${text}`),
  };
}

function loadNpcProfileChunks(rootDir: string): KnowledgeChunk[] {
  return NPC_PROFILE_DIRS.flatMap((directory) => {
    const absolute = path.join(rootDir, directory);
    if (!fs.existsSync(absolute)) return [];
    return listMarkdownFiles(absolute)
      .filter((filePath) => {
        if (directory === "npcs") return path.basename(filePath) === "character.md";
        return path.basename(filePath).toLowerCase() !== "readme.md";
      })
      .flatMap((filePath) => chunksFromNpcProfile(filePath, rootDir));
  });
}

function chunksFromNpcProfile(filePath: string, rootDir: string): KnowledgeChunk[] {
  const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const sourcePath = toPosixPath(path.relative(rootDir, filePath));
  const title = firstHeading(raw) || path.basename(filePath, ".md");
  const documentId = npcProfileDocumentId(sourcePath);
  const contentHash = hashText(raw);
  const sections = splitMarkdownSections(raw);

  return sections.map((section, index) => {
    const sectionId = section.slug || `section-${index + 1}`;
    const text = [title, section.title, section.text].filter(Boolean).join("\n\n").trim();
    return {
      id: `${documentId}#${safeId(sectionId)}`,
      document_id: documentId,
      source_path: sourcePath,
      title: section.title ? `${title} / ${section.title}` : title,
      type: "npc_profile",
      tags: ["npc", "профиль", "первый_город"],
      tier: null,
      truth_level: null,
      related: [],
      text,
      content_hash: hashText(`${contentHash}:${sectionId}:${text}`),
    };
  });
}

function splitMarkdownSections(markdown: string): Array<{ title: string; slug: string; text: string }> {
  const lines = markdown.trim().split(/\r?\n/);
  const sections: Array<{ title: string; slug: string; text: string }> = [];
  let title = "";
  let buffer: string[] = [];

  for (const line of lines) {
    const heading = line.match(/^#{1,3}\s+(.+)$/);
    if (heading) {
      if (buffer.length > 0 || title) {
        sections.push({ title, slug: safeId(title || "intro"), text: buffer.join("\n").trim() });
      }
      title = heading[1]?.trim() ?? "";
      buffer = [line];
      continue;
    }
    buffer.push(line);
  }

  if (buffer.length > 0 || title) {
    sections.push({ title, slug: safeId(title || "intro"), text: buffer.join("\n").trim() });
  }

  return sections.length > 0 ? sections : [{ title: "", slug: "body", text: markdown.trim() }];
}

function firstHeading(markdown: string): string | null {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? null;
}

function buildLexicalScores(index: KnowledgeIndex | undefined, query: string, limit: number): Map<string, number> {
  if (!index) return new Map();
  return new Map(searchKnowledgeIndex(index, query, { limit }).map((entry) => [entry.id, entry.score]));
}

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) {
    sum += (a[index] ?? 0) * (b[index] ?? 0);
  }
  return sum;
}

function safeReadVectorIndex(indexPath: string): KnowledgeVectorIndex | null {
  try {
    return readKnowledgeVectorIndex(indexPath);
  } catch {
    return null;
  }
}

function countStaleChunks(chunks: KnowledgeChunk[], vectorIndex: KnowledgeVectorIndex): number {
  const entriesById = new Map(vectorIndex.entries.map((entry) => [entry.id, entry]));
  return chunks.filter((chunk) => {
    const entry = entriesById.get(chunk.id);
    return Boolean(entry && entry.content_hash !== chunk.content_hash);
  }).length;
}

function countOrphanEntries(chunks: KnowledgeChunk[], vectorIndex: KnowledgeVectorIndex): number {
  const chunkIds = new Set(chunks.map((chunk) => chunk.id));
  return vectorIndex.entries.filter((entry) => !chunkIds.has(entry.id)).length;
}

function isValidVectorEntry(entry: KnowledgeVectorIndexEntry, dimensions: number): boolean {
  return entry.embedding.length === dimensions && entry.embedding.every(Number.isFinite);
}

function health(
  status: VectorIndexHealth["status"],
  indexPath: string,
  expectedModel: string,
  actualModel: string | null,
  dimensions: number | null,
  chunks: KnowledgeChunk[],
  entries: number,
  extra: Partial<VectorIndexHealth> = {}
): VectorIndexHealth {
  return {
    status,
    ok: status === "ok",
    index_path: indexPath,
    expected_model: expectedModel,
    actual_model: actualModel,
    dimensions,
    chunks: chunks.length,
    entries,
    missing_chunks: extra.missing_chunks ?? 0,
    stale_chunks: extra.stale_chunks ?? 0,
    orphan_entries: extra.orphan_entries ?? 0,
    invalid_entries: extra.invalid_entries ?? 0,
    message: extra.message,
  };
}

function listMarkdownFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(absolute);
      return entry.isFile() && entry.name.endsWith(".md") ? [absolute] : [];
    })
    .sort();
}

function npcProfileDocumentId(sourcePath: string): string {
  if (sourcePath.startsWith("npcs/")) {
    const [, npcId] = sourcePath.split("/");
    return `npc_profile_${safeId(npcId ?? path.basename(sourcePath, ".md"))}`;
  }
  return `npc_profile_${safeId(path.basename(sourcePath, ".md"))}`;
}

function safeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "body";
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function nullableString(value: unknown): string | null {
  if (typeof value === "boolean") return String(value);
  return typeof value === "string" ? value : null;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
