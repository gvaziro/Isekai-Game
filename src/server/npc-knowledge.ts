import fs from "node:fs";
import path from "node:path";
import {
  buildKnowledgeIndex,
  readKnowledgeIndex,
  searchKnowledgeIndex,
} from "@/src/knowledge/knowledgeBase";
import type { KnowledgeIndex, KnowledgeIndexEntry } from "@/src/knowledge/types";
import {
  checkKnowledgeVectorIndex,
  collectKnowledgeChunks,
  filterVectorIndexToCurrentChunks,
  getVectorIndexPath,
  readKnowledgeVectorIndex,
  searchKnowledgeVectorIndex,
  vectorResultsToKnowledgeEntries,
} from "@/src/knowledge/vectorIndex";
import { createEmbeddings } from "@/src/server/openai";
import type { NpcBundle } from "@/src/server/types";
import { createHash } from "node:crypto";

export type NpcRevealStyle = "practical" | "guarded" | "rumor_trade";

export type NpcKnowledgeConfig = {
  tier_access: string[];
  preferred_tags: string[];
  known_facts: string[];
  blocked_facts: string[];
  reveal_style: NpcRevealStyle;
};

export type SelectNpcKnowledgeOptions = {
  rootDir?: string;
  indexPath?: string;
  vectorIndexPath?: string;
  limit?: number;
};

const DEFAULT_LIMIT = 6;
const QUERY_EMBEDDING_CACHE_LIMIT = 128;
let cachedIndex: { path: string; mtimeMs: number; index: KnowledgeIndex } | null = null;
const queryEmbeddingCache = new Map<string, number[]>();

export function getNpcKnowledgeConfig(npc: NpcBundle): NpcKnowledgeConfig {
  const raw = (npc.traits as { knowledge?: unknown }).knowledge;
  const obj = isRecord(raw) ? raw : {};
  return {
    tier_access: asStringArray(obj.tier_access),
    preferred_tags: asStringArray(obj.preferred_tags),
    known_facts: asStringArray(obj.known_facts),
    blocked_facts: asStringArray(obj.blocked_facts),
    reveal_style: asRevealStyle(obj.reveal_style),
  };
}

export function loadKnowledgeIndexForNpc(options: SelectNpcKnowledgeOptions = {}): KnowledgeIndex {
  const rootDir = options.rootDir ?? process.cwd();
  const indexPath = options.indexPath ?? path.join(rootDir, "knowledge-index.json");

  try {
    const stat = fs.statSync(indexPath);
    if (cachedIndex?.path === indexPath && cachedIndex.mtimeMs === stat.mtimeMs) {
      return cachedIndex.index;
    }
    const index = readKnowledgeIndex(indexPath);
    cachedIndex = { path: indexPath, mtimeMs: stat.mtimeMs, index };
    return index;
  } catch {
    return buildKnowledgeIndex(rootDir);
  }
}

export function selectNpcKnowledge(
  npc: NpcBundle,
  query: string,
  options: SelectNpcKnowledgeOptions = {}
): KnowledgeIndexEntry[] {
  return selectNpcKnowledgeLexical(npc, query, options);
}

export async function selectNpcKnowledgeHybrid(
  npc: NpcBundle,
  query: string,
  options: SelectNpcKnowledgeOptions = {}
): Promise<KnowledgeIndexEntry[]> {
  const lexical = selectNpcKnowledgeLexical(npc, query, options);
  if (!process.env.OPENAI_API_KEY) {
    logVectorFallback(npc.id, "missing", "OPENAI_API_KEY is not set");
    return lexical;
  }

  try {
    const rootDir = options.rootDir ?? process.cwd();
    const index = loadKnowledgeIndexForNpc(options);
    const vectorPath = options.vectorIndexPath ?? getVectorIndexPath(rootDir);
    const health = checkKnowledgeVectorIndex({ rootDir, indexPath: vectorPath });
    if (!health.ok) {
      logVectorFallback(npc.id, health.status, health.message);
      return lexical;
    }

    const safeVectorIndex = filterVectorIndexToCurrentChunks(
      readKnowledgeVectorIndex(vectorPath),
      collectKnowledgeChunks(rootDir)
    );
    const queryEmbedding = await getCachedQueryEmbedding(safeVectorIndex.model, query);
    if (!queryEmbedding || queryEmbedding.length !== safeVectorIndex.dimensions) {
      logVectorFallback(npc.id, "dimension_mismatch", "Query embedding dimensions do not match vector index.");
      return lexical;
    }

    const accessible = accessibleNpcKnowledgeEntries(npc, index);
    const allowedDocumentIds = new Set(accessible.map((entry) => entry.id));
    const vectorResults = searchKnowledgeVectorIndex(safeVectorIndex, queryEmbedding, query, {
      limit: (options.limit ?? DEFAULT_LIMIT) * 2,
      allowedDocumentIds,
      lexicalIndex: index,
    });
    const vectorEntries = vectorResultsToKnowledgeEntries(vectorResults, index);
    const picked = new Map<string, KnowledgeIndexEntry>();
    for (const entry of vectorEntries) {
      if (allowedDocumentIds.has(entry.id)) picked.set(entry.id, entry);
    }
    for (const entry of lexical) {
      if (picked.size >= (options.limit ?? DEFAULT_LIMIT)) break;
      picked.set(entry.id, entry);
    }
    return Array.from(picked.values()).slice(0, options.limit ?? DEFAULT_LIMIT);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logVectorFallback(npc.id, "embedding_error", msg);
    return lexical;
  }
}

function selectNpcKnowledgeLexical(
  npc: NpcBundle,
  query: string,
  options: SelectNpcKnowledgeOptions = {}
): KnowledgeIndexEntry[] {
  const config = getNpcKnowledgeConfig(npc);
  const index = loadKnowledgeIndexForNpc(options);
  const limit = options.limit ?? DEFAULT_LIMIT;
  const accessible = accessibleNpcKnowledgeEntries(npc, index);

  const accessibleIndex: KnowledgeIndex = {
    generated_at: index.generated_at,
    stats: index.stats,
    entries: accessible,
  };
  const ranked = searchKnowledgeIndex(accessibleIndex, query, { limit }).map(stripScore);
  const picked = new Map(ranked.map((entry) => [entry.id, entry]));

  if (picked.size < limit) {
    const fallback = [...accessible].sort(
      (a, b) => fallbackRank(b, config) - fallbackRank(a, config) || a.id.localeCompare(b.id)
    );
    for (const entry of fallback) {
      if (picked.size >= limit) break;
      picked.set(entry.id, entry);
    }
  }

  return Array.from(picked.values()).slice(0, limit);
}

function accessibleNpcKnowledgeEntries(npc: NpcBundle, index: KnowledgeIndex): KnowledgeIndexEntry[] {
  const config = getNpcKnowledgeConfig(npc);
  const blocked = new Set(config.blocked_facts);
  const known = new Set(config.known_facts);
  const tierAccess = new Set(config.tier_access);
  const preferredTags = new Set(config.preferred_tags);

  return index.entries.filter((entry) => {
    if (entry.type !== "fact") return false;
    if (blocked.has(entry.id)) return false;
    if (known.has(entry.id)) return true;
    const tierAllowed = entry.tier !== null && tierAccess.has(entry.tier);
    const tagAllowed = entry.tags.some((tag) => preferredTags.has(tag));
    return tierAllowed && tagAllowed;
  });
}

export function formatNpcKnowledgeForPrompt(entries: KnowledgeIndexEntry[], npc: NpcBundle): string {
  const config = getNpcKnowledgeConfig(npc);
  const styleHint = revealStyleHint(config.reveal_style);

  if (entries.length === 0) {
    return `
=== Знания NPC сейчас ===
Для текущей реплики нет подходящих фактов из базы знаний. Не выдумывай лор, причины тумана, устройство катакомб или новые события; отвечай только из профиля, последних событий и состояния мира.
`.trim();
  }

  const facts = entries.map((entry, index) => {
    const caution =
      entry.tier === "hidden" || entry.tier === "forbidden"
        ? " Не раскрывай это прямо; используй только как внутреннее ограничение или осторожный намек."
        : "";
    return `${index + 1}. ${entry.title} (${entry.id}; tier=${entry.tier ?? "-"}; truth=${entry.truth_level ?? "-"})${caution}\n${clipBody(entry.body)}`;
  });

  return `
=== Знания NPC сейчас ===
Это личный срез знаний этого NPC, а не энциклопедия. Отвечай в характере, не цитируй базу дословно и не перечисляй факты списком. Если игрок спрашивает о том, чего нет ниже, не выдумывай.
Стиль раскрытия: ${styleHint}

${facts.join("\n\n")}
`.trim();
}

function fallbackRank(entry: KnowledgeIndexEntry, config: NpcKnowledgeConfig): number {
  let score = 0;
  if (config.known_facts.includes(entry.id)) score += 8;
  score += entry.tags.filter((tag) => config.preferred_tags.includes(tag)).length * 2;
  if (entry.tier === "village_common") score += 2;
  if (entry.tier === "village_rumor") score += 1;
  return score;
}

function stripScore(entry: KnowledgeIndexEntry & { score?: number }): KnowledgeIndexEntry {
  const { score: _score, ...rest } = entry;
  return rest;
}

function clipBody(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  if (oneLine.length <= 320) return oneLine;
  return `${oneLine.slice(0, 317).trim()}...`;
}

function revealStyleHint(style: NpcRevealStyle): string {
  if (style === "guarded") {
    return "осторожно и практично; говори о рисках, правилах и наблюдениях, без тайных объяснений.";
  }
  if (style === "rumor_trade") {
    return "через слухи, сделки и странные детали; отделяй проверенное от байки.";
  }
  return "коротко и по делу; превращай знание в понятное поручение или совет.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asRevealStyle(value: unknown): NpcRevealStyle {
  if (value === "guarded" || value === "rumor_trade" || value === "practical") return value;
  return "practical";
}

async function getCachedQueryEmbedding(model: string, query: string): Promise<number[]> {
  const key = `${model}:${hash(query)}`;
  const cached = queryEmbeddingCache.get(key);
  if (cached) return cached;
  const [embedding] = await createEmbeddings({ model, input: [query] });
  if (!embedding) return [];
  queryEmbeddingCache.set(key, embedding);
  if (queryEmbeddingCache.size > QUERY_EMBEDDING_CACHE_LIMIT) {
    const first = queryEmbeddingCache.keys().next().value as string | undefined;
    if (first) queryEmbeddingCache.delete(first);
  }
  return embedding;
}

function logVectorFallback(npcId: string, reason: string, message?: string): void {
  if (process.env.KNOWLEDGE_VECTOR_LOG !== "1") return;
  console.warn("[npc-knowledge] vector fallback", { npcId, reason, message });
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
