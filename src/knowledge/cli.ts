import path from "node:path";
import { createRequire } from "node:module";
import {
  formatStats,
  formatValidationIssues,
  buildKnowledgeIndex,
  readKnowledgeIndex,
  searchKnowledgeIndex,
  validateKnowledgeBase,
  writeKnowledgeIndex,
} from "./knowledgeBase";
import {
  buildKnowledgeVectorIndex,
  checkKnowledgeVectorIndex,
  collectKnowledgeChunks,
  filterVectorIndexToCurrentChunks,
  getEmbeddingModel,
  getVectorIndexPath,
  readKnowledgeVectorIndex,
  searchKnowledgeVectorIndex,
} from "./vectorIndex";
import { createEmbeddings } from "@/src/server/openai";
import type { KnowledgeType, SearchFilters } from "./types";

const rootDir = process.cwd();
const indexPath = path.join(rootDir, "knowledge-index.json");
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as {
  loadEnvConfig: (dir: string) => unknown;
};

loadEnvConfig(rootDir);

main(process.argv.slice(2));

function main(args: string[]): void {
  const [command = "help", ...rest] = args;

  if (command === "validate") {
    const allowLockedChanges = rest.includes("--allow-locked");
    const validation = validateKnowledgeBase({
      rootDir,
      previousIndexPath: indexPath,
      allowLockedChanges,
    });

    if (!validation.ok) {
      console.error(formatValidationIssues(validation.issues));
      process.exitCode = 1;
      return;
    }

    console.log(`Knowledge base valid (${formatStats(validation.stats)})`);
    return;
  }

  if (command === "index") {
    const index = writeKnowledgeIndex(rootDir, indexPath);
    console.log(`Wrote knowledge-index.json (${formatStats(index.stats)})`);
    return;
  }

  if (command === "search") {
    const { query, filters } = parseSearchArgs(rest);
    const index = readKnowledgeIndex(indexPath);
    const results = searchKnowledgeIndex(index, query, filters);

    for (const result of results) {
      console.log(
        `${result.id} [${result.type}] score=${result.score} tier=${result.tier ?? "-"} ${result.source_path}`
      );
      console.log(`  ${result.title}`);
    }

    if (results.length === 0) {
      console.log("No matches");
    }
    return;
  }

  if (command === "embed") {
    buildKnowledgeVectorIndex({
      rootDir,
      indexPath: getVectorIndexPath(rootDir),
      model: getEmbeddingModel(),
      embedTexts: (texts, model) => createEmbeddings({ model, input: texts }),
    })
      .then((index) => {
        console.log(
          `Wrote ${path.relative(rootDir, getVectorIndexPath(rootDir))} (${index.stats.chunks} chunks, ${index.stats.embedded} embedded, ${index.stats.reused ?? 0} reused, ${index.stats.stale ?? 0} stale, ${index.stats.orphan ?? 0} orphan, model=${index.model}, dimensions=${index.dimensions})`
        );
      })
      .catch((error: unknown) => {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(msg);
        process.exitCode = 1;
      });
    return;
  }

  if (command === "vector:check") {
    const health = checkKnowledgeVectorIndex({
      rootDir,
      indexPath: getVectorIndexPath(rootDir),
      expectedModel: getEmbeddingModel(),
    });
    console.log(formatVectorHealth(health));
    process.exitCode = health.ok ? 0 : 1;
    return;
  }

  if (command === "search:vector") {
    runVectorSearch(rest).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(msg);
      process.exitCode = 1;
    });
    return;
  }

  if (command === "search:hybrid") {
    runHybridSearch(rest).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(msg);
      process.exitCode = 1;
    });
    return;
  }

  printHelp();
}

function parseSearchArgs(args: string[]): { query: string; filters: SearchFilters } {
  const queryParts: string[] = [];
  const filters: SearchFilters = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];

    if (arg === "--tag" && next) {
      filters.tag = next;
      index += 1;
      continue;
    }
    if (arg === "--related" && next) {
      filters.related = next;
      index += 1;
      continue;
    }
    if (arg === "--tier" && next) {
      filters.tier = next;
      index += 1;
      continue;
    }
    if (arg === "--id" && next) {
      filters.id = next;
      index += 1;
      continue;
    }
    if (arg === "--type" && isKnowledgeType(next)) {
      filters.type = next;
      index += 1;
      continue;
    }
    if (arg === "--limit" && next) {
      filters.limit = Number(next);
      index += 1;
      continue;
    }

    if (arg) queryParts.push(arg);
  }

  return { query: queryParts.join(" "), filters };
}

async function runVectorSearch(args: string[]): Promise<void> {
  const { query, filters } = parseSearchArgs(args);
  const chunks = collectKnowledgeChunks(rootDir);
  const vectorIndex = filterVectorIndexToCurrentChunks(readKnowledgeVectorIndex(getVectorIndexPath(rootDir)), chunks);
  const lexicalIndex = buildKnowledgeIndex(rootDir);
  const [queryEmbedding] = await createEmbeddings({
    model: vectorIndex.model,
    input: [query],
  });
  const existingChunkIds = new Set(chunks.map((chunk) => chunk.id));
  const results = searchKnowledgeVectorIndex(vectorIndex, queryEmbedding ?? [], query, {
    limit: filters.limit ?? 10,
    lexicalIndex,
  }).filter((entry) => existingChunkIds.has(entry.id));

  for (const result of results) {
    console.log(
      `${result.id} [${result.type}] score=${result.score.toFixed(4)} vector=${result.vector_score.toFixed(4)} lexical=${result.lexical_score.toFixed(2)} ${result.source_path}`
    );
    console.log(`  ${result.title}`);
  }

  if (results.length === 0) {
    console.log("No matches");
  }
}

async function runHybridSearch(args: string[]): Promise<void> {
  const health = checkKnowledgeVectorIndex({
    rootDir,
    indexPath: getVectorIndexPath(rootDir),
    expectedModel: getEmbeddingModel(),
  });
  console.log(formatVectorHealth(health));

  const { query, filters } = parseSearchArgs(args);
  if (!health.ok) {
    console.log(`Fallback: vector search disabled (${health.status}).`);
    const index = readKnowledgeIndex(indexPath);
    const results = searchKnowledgeIndex(index, query, filters);
    for (const result of results) {
      console.log(`${result.id} [${result.type}] lexical=${result.score} ${result.source_path}`);
      console.log(`  ${result.title}`);
    }
    return;
  }

  await runVectorSearch(args);
}

function formatVectorHealth(health: ReturnType<typeof checkKnowledgeVectorIndex>): string {
  return [
    `Vector index: ${health.status}${health.ok ? "" : " (fallback expected)"}`,
    `  path: ${health.index_path}`,
    `  model: ${health.actual_model ?? "-"} (expected ${health.expected_model})`,
    `  dimensions: ${health.dimensions ?? "-"}`,
    `  chunks: ${health.chunks}, entries: ${health.entries}`,
    `  missing: ${health.missing_chunks}, stale: ${health.stale_chunks}, orphan: ${health.orphan_entries}, invalid: ${health.invalid_entries}`,
    health.message ? `  message: ${health.message}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function isKnowledgeType(value: string | undefined): value is KnowledgeType {
  return value === "fact" || value === "entity" || value === "book" || value === "locked";
}

function printHelp(): void {
  console.log(`Usage:
  npm run kb:validate
  npm run kb:index
  npm run kb:embed
  npm run kb:vector:check
  npm run kb:search -- "туман король гоблинов"
  npm run kb:search:vector -- "как город относится к новичкам из туманной деревни"
  npm run kb:search:hybrid -- "почему Мира не пускает новичков глубже"
  npm run kb:search -- --tag туман
  npm run kb:search -- --related goblin_king
  npm run kb:search -- --tier village_common`);
}
