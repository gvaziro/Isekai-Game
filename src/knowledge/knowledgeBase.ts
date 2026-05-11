import fs from "node:fs";
import path from "node:path";
import { parseMarkdownDocument } from "./frontmatter";
import type {
  Frontmatter,
  KnowledgeDocument,
  KnowledgeIndex,
  KnowledgeIndexEntry,
  KnowledgeStats,
  SearchFilters,
  SearchResult,
  ValidationIssue,
  ValidationResult,
} from "./types";

const DOCUMENT_DIRS = ["world/facts", "world/entities", "world/books", "world/locked"];

const REQUIRED_FIELDS: Record<string, string[]> = {
  fact: [
    "id",
    "title",
    "type",
    "tier",
    "tags",
    "truth_level",
    "related",
    "locked",
    "canonical_source",
    "created_at",
    "last_validated",
  ],
  locked: [
    "id",
    "title",
    "type",
    "tier",
    "tags",
    "truth_level",
    "related",
    "locked",
    "canonical_source",
    "created_at",
    "last_validated",
  ],
  entity: [
    "id",
    "title",
    "type",
    "entity_kind",
    "canonical_facts",
    "disputed_facts",
    "open_questions",
    "related_entities",
    "locked_aspects",
  ],
  book: ["id", "title", "type", "category", "truth_level", "location", "contains_facts", "unlocks"],
};

const FACT_TRUTH_LEVELS = new Set(["true", "partial", "distorted", "false", "encoded"]);
const BOOK_TRUTH_LEVELS = new Set(["subjective", "official_distorted", "hidden_truth", "encoded_truth"]);
const TIERS = new Set(["village_common", "village_rumor", "professional", "hidden", "forbidden"]);
const BOOK_CATEGORIES = new Set(["personal_diary", "official_chronicle", "forbidden", "folklore"]);
const ENTITY_KINDS = new Set(["character", "location", "organization", "concept", "item"]);

export function loadKnowledgeDocuments(rootDir: string): KnowledgeDocument[] {
  return DOCUMENT_DIRS.flatMap((directory) => {
    const absoluteDir = path.join(rootDir, directory);
    if (!fs.existsSync(absoluteDir)) return [];
    return listMarkdownFiles(absoluteDir).map((filePath) => parseMarkdownDocument(filePath, rootDir));
  }).sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
}

export function validateKnowledgeBase(options: {
  rootDir: string;
  previousIndexPath?: string;
  allowLockedChanges?: boolean;
}): ValidationResult {
  const documents = loadKnowledgeDocuments(options.rootDir);
  const issues: ValidationIssue[] = [];
  const ids = new Map<string, KnowledgeDocument>();

  for (const doc of documents) {
    if (!doc.id) {
      issues.push(issue(doc, "Missing required field: id"));
      continue;
    }
    if (ids.has(doc.id)) {
      issues.push(issue(doc, `Duplicate id: ${doc.id}`));
      continue;
    }
    ids.set(doc.id, doc);
  }

  for (const doc of documents) {
    validateRequiredFields(doc, issues);
    validateKnownEnums(doc, issues);
    validateReferences(doc, ids, issues);
  }

  if (!options.allowLockedChanges && options.previousIndexPath) {
    validateLockedChanges(documents, options.previousIndexPath, issues);
  }

  const stats = buildStats(documents, issues);

  return {
    ok: issues.length === 0,
    issues,
    stats,
    documents,
  };
}

export function buildKnowledgeIndex(rootDir: string, documents = loadKnowledgeDocuments(rootDir)): KnowledgeIndex {
  const entries = documents.map(toIndexEntry);
  return {
    generated_at: new Date().toISOString(),
    entries,
    stats: buildStats(documents, []),
  };
}

export function writeKnowledgeIndex(rootDir: string, outputPath = path.join(rootDir, "knowledge-index.json")): KnowledgeIndex {
  const validation = validateKnowledgeBase({ rootDir });
  if (!validation.ok) {
    throw new Error(formatValidationIssues(validation.issues));
  }

  const index = buildKnowledgeIndex(rootDir, validation.documents);
  fs.writeFileSync(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return index;
}

export function readKnowledgeIndex(indexPath: string): KnowledgeIndex {
  return JSON.parse(fs.readFileSync(indexPath, "utf8")) as KnowledgeIndex;
}

export function searchKnowledgeIndex(index: KnowledgeIndex, query: string, filters: SearchFilters = {}): SearchResult[] {
  const queryTokens = tokenize(query);
  const limit = filters.limit ?? 10;

  return index.entries
    .filter((entry) => matchesFilters(entry, filters))
    .map((entry) => ({
      ...entry,
      score: scoreEntry(entry, queryTokens, query),
    }))
    .filter((entry) => queryTokens.length === 0 || entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues.map((issue) => `${issue.file}: ${issue.message}`).join("\n");
}

export function formatStats(stats: KnowledgeStats): string {
  return [
    `facts: ${stats.facts}`,
    `entities: ${stats.entities}`,
    `books: ${stats.books}`,
    `locked: ${stats.locked}`,
    `broken_links: ${stats.broken_links}`,
  ].join(", ");
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

function validateRequiredFields(doc: KnowledgeDocument, issues: ValidationIssue[]): void {
  const required = REQUIRED_FIELDS[doc.type] ?? REQUIRED_FIELDS.fact;
  for (const field of required) {
    if (doc.metadata[field] === undefined) {
      issues.push(issue(doc, `Missing required field: ${field}`));
    }
  }
}

function validateKnownEnums(doc: KnowledgeDocument, issues: ValidationIssue[]): void {
  if ((doc.type === "fact" || doc.type === "locked") && !TIERS.has(asString(doc.metadata.tier))) {
    issues.push(issue(doc, `Unknown tier: ${String(doc.metadata.tier)}`));
  }

  if ((doc.type === "fact" || doc.type === "locked") && !FACT_TRUTH_LEVELS.has(asString(doc.metadata.truth_level))) {
    issues.push(issue(doc, `Unknown truth_level: ${String(doc.metadata.truth_level)}`));
  }

  if (doc.type === "book" && !BOOK_TRUTH_LEVELS.has(asString(doc.metadata.truth_level))) {
    issues.push(issue(doc, `Unknown truth_level: ${String(doc.metadata.truth_level)}`));
  }

  if (doc.type === "book" && !BOOK_CATEGORIES.has(asString(doc.metadata.category))) {
    issues.push(issue(doc, `Unknown category: ${String(doc.metadata.category)}`));
  }

  if (doc.type === "entity" && !ENTITY_KINDS.has(asString(doc.metadata.entity_kind))) {
    issues.push(issue(doc, `Unknown entity_kind: ${String(doc.metadata.entity_kind)}`));
  }

  if ((doc.type === "fact" || doc.type === "locked") && typeof doc.metadata.locked !== "boolean") {
    issues.push(issue(doc, "Field locked must be boolean"));
  }
}

function validateReferences(
  doc: KnowledgeDocument,
  ids: Map<string, KnowledgeDocument>,
  issues: ValidationIssue[]
): void {
  for (const field of ["related", "contradicts", "contains_facts", "canonical_facts", "disputed_facts"]) {
    for (const ref of asStringArray(doc.metadata[field])) {
      if (!ids.has(ref)) {
        issues.push(issue(doc, `Broken reference in ${field}: ${ref}`));
      }
    }
  }
}

function validateLockedChanges(
  documents: KnowledgeDocument[],
  previousIndexPath: string,
  issues: ValidationIssue[]
): void {
  if (!fs.existsSync(previousIndexPath)) return;

  const previousEntries = readKnowledgeIndex(previousIndexPath).entries;
  const previousById = new Map(previousEntries.map((entry) => [entry.id, entry]));

  for (const doc of documents) {
    if (doc.metadata.locked !== true) continue;
    const previous = previousById.get(doc.id);
    if (previous?.locked && previous.content_hash !== doc.contentHash) {
      issues.push(issue(doc, `Locked document changed without override: ${doc.id}`));
    }
  }
}

function toIndexEntry(doc: KnowledgeDocument): KnowledgeIndexEntry {
  return {
    id: doc.id,
    type: doc.type,
    title: doc.title,
    tags: asStringArray(doc.metadata.tags),
    tier: nullableString(doc.metadata.tier),
    truth_level: nullableString(doc.metadata.truth_level),
    related: asStringArray(doc.metadata.related),
    body: doc.body,
    source_path: doc.sourcePath,
    content_hash: doc.contentHash,
    locked: doc.metadata.locked === true,
  };
}

function buildStats(documents: KnowledgeDocument[], issues: ValidationIssue[]): KnowledgeStats {
  return {
    facts: documents.filter((doc) => doc.type === "fact").length,
    entities: documents.filter((doc) => doc.type === "entity").length,
    books: documents.filter((doc) => doc.type === "book").length,
    locked: documents.filter((doc) => doc.metadata.locked === true || doc.type === "locked").length,
    broken_links: issues.filter((item) => item.message.startsWith("Broken reference")).length,
  };
}

function matchesFilters(entry: KnowledgeIndexEntry, filters: SearchFilters): boolean {
  if (filters.id && entry.id !== filters.id) return false;
  if (filters.type && entry.type !== filters.type) return false;
  if (filters.tag && !entry.tags.includes(filters.tag)) return false;
  if (filters.related && !entry.related.includes(filters.related) && entry.id !== filters.related) return false;
  if (filters.tier && entry.tier !== filters.tier) return false;
  return true;
}

function scoreEntry(entry: KnowledgeIndexEntry, queryTokens: string[], rawQuery: string): number {
  if (queryTokens.length === 0) return 1;

  const haystack = `${entry.id} ${entry.title} ${entry.tags.join(" ")} ${entry.related.join(" ")} ${entry.body}`.toLowerCase();
  const haystackTokens = new Set(tokenize(haystack));
  const tokenMatches = queryTokens.filter((token) => haystackTokens.has(token)).length;
  const phraseBoost = rawQuery.trim() && haystack.includes(rawQuery.toLowerCase().trim()) ? 2 : 0;
  const titleBoost = queryTokens.some((token) => entry.title.toLowerCase().includes(token)) ? 1 : 0;

  return tokenMatches + phraseBoost + titleBoost;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}_]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function issue(doc: KnowledgeDocument, message: string): ValidationIssue {
  return { file: doc.sourcePath, message };
}

function asString(value: unknown): string {
  if (typeof value === "boolean") return String(value);
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  if (typeof value === "boolean") return String(value);
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
