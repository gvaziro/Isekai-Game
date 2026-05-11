import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildKnowledgeIndex,
  searchKnowledgeIndex,
  validateKnowledgeBase,
} from "@/src/knowledge/knowledgeBase";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("knowledgeBase", () => {
  it("валидирует стартовую базу знаний", () => {
    const result = validateKnowledgeBase({ rootDir: process.cwd() });

    expect(result.ok).toBe(true);
    expect(result.stats.facts).toBeGreaterThanOrEqual(8);
    expect(result.stats.entities).toBeGreaterThanOrEqual(1);
    expect(result.stats.books).toBeGreaterThanOrEqual(1);
  });

  it("находит туман и Короля гоблинов текстовым поиском", () => {
    const validation = validateKnowledgeBase({ rootDir: process.cwd() });
    const index = buildKnowledgeIndex(process.cwd(), validation.documents);

    const results = searchKnowledgeIndex(index, "почему деревня заперта туман король гоблинов");
    const ids = results.map((entry) => entry.id);

    expect(ids).toContain("fog_blocks_village_road");
    expect(ids).toContain("goblin_king_controls_fog");
  });

  it("поддерживает структурный поиск по related и tier", () => {
    const validation = validateKnowledgeBase({ rootDir: process.cwd() });
    const index = buildKnowledgeIndex(process.cwd(), validation.documents);

    const related = searchKnowledgeIndex(index, "", { related: "goblin_king" });
    const common = searchKnowledgeIndex(index, "", { tier: "village_common" });

    expect(related.map((entry) => entry.id)).toContain("goblin_king_controls_fog");
    expect(common.map((entry) => entry.id)).toContain("fog_blocks_village_road");
  });

  it("падает на пропущенный id", () => {
    const root = makeKnowledgeRoot([
      {
        relativePath: "world/facts/no-id.md",
        body: `---
title: Без id
type: fact
tier: village_common
tags: [туман]
truth_level: true
related: []
locked: false
canonical_source: test
created_at: 2026-05-08
last_validated: 2026-05-08
---

Текст.
`,
      },
    ]);

    const result = validateKnowledgeBase({ rootDir: root });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Missing required field: id"))).toBe(true);
  });

  it("падает на дублирующийся id", () => {
    const root = makeKnowledgeRoot([
      { relativePath: "world/facts/a.md", body: fact("same_id") },
      { relativePath: "world/facts/b.md", body: fact("same_id") },
    ]);

    const result = validateKnowledgeBase({ rootDir: root });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Duplicate id: same_id"))).toBe(true);
  });

  it("падает на битую ссылку related", () => {
    const root = makeKnowledgeRoot([
      { relativePath: "world/facts/a.md", body: fact("a", { related: "[missing_id]" }) },
    ]);

    const result = validateKnowledgeBase({ rootDir: root });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Broken reference in related: missing_id"))).toBe(
      true
    );
  });

  it("падает на неизвестный truth_level", () => {
    const root = makeKnowledgeRoot([
      { relativePath: "world/facts/a.md", body: fact("a", { truthLevel: "unknown" }) },
    ]);

    const result = validateKnowledgeBase({ rootDir: root });

    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("Unknown truth_level: unknown"))).toBe(true);
  });

  it("блокирует изменение locked-факта без override", () => {
    const root = makeKnowledgeRoot([
      { relativePath: "world/facts/a.md", body: fact("a", { locked: true }) },
    ]);
    const indexPath = path.join(root, "knowledge-index.json");
    fs.writeFileSync(indexPath, `${JSON.stringify(buildKnowledgeIndex(root), null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(root, "world/facts/a.md"), fact("a", { locked: true, text: "Изменено." }), "utf8");

    const blocked = validateKnowledgeBase({ rootDir: root, previousIndexPath: indexPath });
    const allowed = validateKnowledgeBase({
      rootDir: root,
      previousIndexPath: indexPath,
      allowLockedChanges: true,
    });

    expect(blocked.ok).toBe(false);
    expect(blocked.issues.some((issue) => issue.message.includes("Locked document changed without override"))).toBe(
      true
    );
    expect(allowed.ok).toBe(true);
  });
});

function makeKnowledgeRoot(files: Array<{ relativePath: string; body: string }>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "last-summon-kb-"));
  tempRoots.push(root);

  for (const directory of ["world/facts", "world/entities", "world/books", "world/locked"]) {
    fs.mkdirSync(path.join(root, directory), { recursive: true });
  }

  for (const file of files) {
    const absolutePath = path.join(root, file.relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, file.body, "utf8");
  }

  return root;
}

function fact(
  id: string,
  options: { related?: string; truthLevel?: string; locked?: boolean; text?: string } = {}
): string {
  return `---
id: ${id}
title: Факт ${id}
type: fact
tier: village_common
tags: [туман]
truth_level: ${options.truthLevel ?? "true"}
related: ${options.related ?? "[]"}
contradicts: []
locked: ${options.locked ?? false}
canonical_source: test
created_at: 2026-05-08
last_validated: 2026-05-08
---

${options.text ?? "Текст."}
`;
}
