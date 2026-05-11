import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildKnowledgeVectorIndex,
  checkKnowledgeVectorIndex,
  collectKnowledgeChunks,
  searchKnowledgeVectorIndex,
} from "@/src/knowledge/vectorIndex";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("knowledge vector index", () => {
  it("чанкует fact целиком, а NPC profile по markdown-секциям", () => {
    const root = makeRoot([
      { relativePath: "world/facts/fog.md", body: fact("fog_fact", "Деревня закрыта туманом.") },
      {
        relativePath: "docs/first-city-npcs/arden.md",
        body: `# Арден Копченый

## Суть персонажа

Хозяин таверны.

## Что ты знаешь

Знает слухи гильдейской улицы.
`,
      },
    ]);

    const chunks = collectKnowledgeChunks(root);
    const factChunks = chunks.filter((chunk) => chunk.document_id === "fog_fact");
    const profileChunks = chunks.filter((chunk) => chunk.document_id === "npc_profile_arden");

    expect(factChunks).toHaveLength(1);
    expect(factChunks[0]?.text).toContain("Деревня закрыта туманом.");
    expect(profileChunks.length).toBeGreaterThanOrEqual(3);
    expect(profileChunks.map((chunk) => chunk.title).join("\n")).toContain("Что ты знаешь");
    expect(profileChunks.every((chunk) => chunk.type === "npc_profile")).toBe(true);
  });

  it("переиспользует embeddings для неизменившихся чанков и пересчитывает измененные", async () => {
    const root = makeRoot([{ relativePath: "world/facts/fog.md", body: fact("fog_fact", "Старый текст.") }]);
    const indexPath = path.join(root, "knowledge-vector-index.json");
    let calls = 0;
    const embed = async (texts: string[]) => {
      calls += texts.length;
      return texts.map(fakeEmbedding);
    };

    const first = await buildKnowledgeVectorIndex({ rootDir: root, indexPath, model: "test-embed", embedTexts: embed });
    const second = await buildKnowledgeVectorIndex({ rootDir: root, indexPath, model: "test-embed", embedTexts: embed });
    fs.writeFileSync(path.join(root, "world/facts/fog.md"), fact("fog_fact", "Новый текст."), "utf8");
    const third = await buildKnowledgeVectorIndex({ rootDir: root, indexPath, model: "test-embed", embedTexts: embed });

    expect(first.stats.embedded).toBe(1);
    expect(second.stats.embedded).toBe(0);
    expect(third.stats.embedded).toBe(1);
    expect(calls).toBe(2);
  });

  it("вызывает embedder батчами", async () => {
    const root = makeRoot([
      { relativePath: "world/facts/a.md", body: fact("a", "A") },
      { relativePath: "world/facts/b.md", body: fact("b", "B") },
      { relativePath: "world/facts/c.md", body: fact("c", "C") },
    ]);
    const batches: number[] = [];

    await buildKnowledgeVectorIndex({
      rootDir: root,
      indexPath: path.join(root, "knowledge-vector-index.json"),
      model: "test-embed",
      batchSize: 2,
      embedTexts: async (texts) => {
        batches.push(texts.length);
        return texts.map(fakeEmbedding);
      },
    });

    expect(batches).toEqual([2, 1]);
  });

  it("health сообщает missing, stale, orphan и invalid состояния", async () => {
    const root = makeRoot([{ relativePath: "world/facts/fog.md", body: fact("fog_fact", "Старый текст.") }]);
    const indexPath = path.join(root, "knowledge-vector-index.json");

    expect(checkKnowledgeVectorIndex({ rootDir: root, indexPath, expectedModel: "test-embed" }).status).toBe("missing");

    const index = await buildKnowledgeVectorIndex({
      rootDir: root,
      indexPath,
      model: "test-embed",
      embedTexts: async (texts) => texts.map(fakeEmbedding),
    });
    fs.writeFileSync(path.join(root, "world/facts/fog.md"), fact("fog_fact", "Новый текст."), "utf8");
    expect(checkKnowledgeVectorIndex({ rootDir: root, indexPath, expectedModel: "test-embed" }).status).toBe("stale");

    fs.writeFileSync(path.join(root, "world/facts/fog.md"), fact("fog_fact", "Старый текст."), "utf8");
    index.entries.push(entry("orphan#body", "orphan", [1, 0, 0], "orphan"));
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    const orphanHealth = checkKnowledgeVectorIndex({ rootDir: root, indexPath, expectedModel: "test-embed" });
    expect(orphanHealth.status).toBe("stale");
    expect(orphanHealth.orphan_entries).toBe(1);

    index.entries[0]!.embedding = [Number.NaN];
    fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    expect(checkKnowledgeVectorIndex({ rootDir: root, indexPath, expectedModel: "test-embed" }).status).toBe("dimension_mismatch");
  });

  it("health сообщает invalid для битого JSON и model_mismatch для другой модели", async () => {
    const root = makeRoot([{ relativePath: "world/facts/fog.md", body: fact("fog_fact", "Текст.") }]);
    const indexPath = path.join(root, "knowledge-vector-index.json");
    fs.writeFileSync(indexPath, "{ nope", "utf8");

    expect(checkKnowledgeVectorIndex({ rootDir: root, indexPath, expectedModel: "test-embed" }).status).toBe("invalid");

    await buildKnowledgeVectorIndex({
      rootDir: root,
      indexPath,
      model: "other-model",
      embedTexts: async (texts) => texts.map(fakeEmbedding),
    });

    expect(checkKnowledgeVectorIndex({ rootDir: root, indexPath, expectedModel: "test-embed" }).status).toBe("model_mismatch");
  });

  it("семантически ранжирует локальные векторы и учитывает lexical boost", () => {
    const vectorIndex = {
      generated_at: "2026-05-08T00:00:00.000Z",
      model: "test-embed",
      dimensions: 3,
      entries: [
        entry("a#body", "a", [1, 0, 0], "Таверна и слухи гильдии."),
        entry("b#body", "b", [0, 1, 0], "Лес и грибы."),
      ],
      stats: { chunks: 2, embedded: 2 },
    };

    const results = searchKnowledgeVectorIndex(vectorIndex, [1, 0, 0], "таверна слухи", { limit: 2 });

    expect(results[0]?.document_id).toBe("a");
    expect(results[0]?.vector_score).toBeGreaterThan(results[1]?.vector_score ?? -1);
  });
});

function makeRoot(files: Array<{ relativePath: string; body: string }>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "last-summon-vector-"));
  tempRoots.push(root);

  for (const directory of ["world/facts", "world/entities", "world/books", "world/locked", "docs/first-city-npcs"]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }

  for (const file of files) {
    const absolutePath = path.join(root, file.relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, file.body, "utf8");
  }

  return root;
}

function fact(id: string, text: string): string {
  return `---
id: ${id}
title: Факт ${id}
type: fact
tier: village_common
tags: [туман]
truth_level: true
related: []
contradicts: []
locked: false
canonical_source: test
created_at: 2026-05-08
last_validated: 2026-05-08
---

${text}
`;
}

function fakeEmbedding(text: string): number[] {
  return [text.includes("Новый") ? 0.5 : 1, 0, 0];
}

function entry(id: string, documentId: string, embedding: number[], text: string) {
  return {
    id,
    document_id: documentId,
    source_path: `${documentId}.md`,
    title: documentId,
    type: "fact" as const,
    tags: [],
    tier: "village_common",
    truth_level: "true",
    related: [],
    text,
    content_hash: id,
    embedding,
  };
}
