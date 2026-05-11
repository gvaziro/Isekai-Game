import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildKnowledgeIndex } from "@/src/knowledge/knowledgeBase";
import {
  formatNpcKnowledgeForPrompt,
  selectNpcKnowledge,
  selectNpcKnowledgeHybrid,
} from "@/src/server/npc-knowledge";
import type { NpcBundle } from "@/src/server/types";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("npc knowledge selection", () => {
  it("Елена получает только common/rumor и не получает blocked hidden-факты", () => {
    const entries = selectNpcKnowledge(elenaNpc(), "почему деревня заперта туман дорога", {
      limit: 12,
    });

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((entry) => entry.tier === "village_common" || entry.tier === "village_rumor")).toBe(true);
    expect(entries.map((entry) => entry.id)).not.toContain("goblin_king_controls_fog");
  });

  it("Маркус получает professional про безопасность, но не forbidden истину", () => {
    const entries = selectNpcKnowledge(marcusNpc(), "катакомбы дорога безопасность", {
      limit: 12,
    });
    const ids = entries.map((entry) => entry.id);

    expect(ids).toContain("catacombs_supply_ether_traces");
    expect(entries.some((entry) => entry.tier === "forbidden")).toBe(false);
    expect(ids).not.toContain("fog_not_cleared_until_goblin_king_defeated");
  });

  it("Игорь ранжирует слухи и торговые находки под запрос игрока", () => {
    const entries = selectNpcKnowledge(igorNpc(), "странные покупки катакомбы товар", {
      limit: 6,
    });
    const ids = entries.map((entry) => entry.id);

    expect(ids.slice(0, 3)).toContain("strange_purchases_hint_at_catacombs");
    expect(ids).toContain("igor_collects_item_rumors");
  });

  it("blocked_facts исключаются даже если tier и tags подходят", () => {
    const npc = igorNpc({
      knowledge: {
        tier_access: ["village_common", "village_rumor", "hidden"],
        preferred_tags: ["король_гоблинов", "туман"],
        known_facts: ["goblin_king_controls_fog"],
        blocked_facts: ["goblin_king_controls_fog"],
        reveal_style: "rumor_trade",
      },
    });

    const entries = selectNpcKnowledge(npc, "король гоблинов туман", { limit: 6 });

    expect(entries.map((entry) => entry.id)).not.toContain("goblin_king_controls_fog");
  });

  it("если knowledge-index.json отсутствует, собирает Markdown на лету", () => {
    const root = makeKnowledgeRoot([
      {
        relativePath: "world/facts/local.md",
        body: fact("local_fact", { tags: "[туман]", text: "Локальный туман виден у дороги." }),
      },
    ]);
    const npc = baseNpc({
      tier_access: ["village_common"],
      preferred_tags: ["туман"],
      known_facts: [],
      blocked_facts: [],
      reveal_style: "practical",
    });

    const entries = selectNpcKnowledge(npc, "туман", {
      rootDir: root,
      indexPath: path.join(root, "missing-index.json"),
    });

    expect(entries.map((entry) => entry.id)).toContain("local_fact");
  });

  it("hybrid selection без OPENAI_API_KEY сохраняет lexical fallback", async () => {
    const oldKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const lexical = selectNpcKnowledge(elenaNpc(), "почему деревня заперта туман дорога", {
        limit: 6,
      });
      const hybrid = await selectNpcKnowledgeHybrid(elenaNpc(), "почему деревня заперта туман дорога", {
        limit: 6,
      });

      expect(hybrid.map((entry) => entry.id)).toEqual(lexical.map((entry) => entry.id));
    } finally {
      if (oldKey) process.env.OPENAI_API_KEY = oldKey;
    }
  });

  it("hybrid selection с битым vector index сохраняет lexical fallback", async () => {
    const root = makeKnowledgeRoot([
      {
        relativePath: "world/facts/local.md",
        body: fact("local_fact", { tags: "[туман]", text: "Локальный туман виден у дороги." }),
      },
    ]);
    const vectorIndexPath = path.join(root, "knowledge-vector-index.json");
    fs.writeFileSync(vectorIndexPath, "{ nope", "utf8");
    const oldKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    try {
      const npc = baseNpc({
        tier_access: ["village_common"],
        preferred_tags: ["туман"],
        known_facts: [],
        blocked_facts: [],
        reveal_style: "practical",
      });
      const lexical = selectNpcKnowledge(npc, "туман", {
        rootDir: root,
        indexPath: path.join(root, "missing-index.json"),
      });
      const hybrid = await selectNpcKnowledgeHybrid(npc, "туман", {
        rootDir: root,
        indexPath: path.join(root, "missing-index.json"),
        vectorIndexPath,
      });

      expect(hybrid.map((entry) => entry.id)).toEqual(lexical.map((entry) => entry.id));
    } finally {
      if (oldKey) process.env.OPENAI_API_KEY = oldKey;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("formatNpcKnowledgeForPrompt помечает hidden/forbidden как непрямое знание", () => {
    const entry = buildKnowledgeIndex(process.cwd()).entries.find((item) => item.id === "goblin_king_controls_fog");
    expect(entry).toBeDefined();

    const block = formatNpcKnowledgeForPrompt([entry!], marcusNpc());

    expect(block).toContain("=== Знания NPC сейчас ===");
    expect(block).toContain("Не раскрывай это прямо");
  });
});

function elenaNpc(): NpcBundle {
  return npcFromTraits("elena");
}

function marcusNpc(): NpcBundle {
  return npcFromTraits("marcus");
}

function igorNpc(extraTraits: Record<string, unknown> = {}): NpcBundle {
  const npc = npcFromTraits("igor");
  return { ...npc, traits: { ...npc.traits, ...extraTraits } };
}

function npcFromTraits(id: "elena" | "marcus" | "igor"): NpcBundle {
  const traits = JSON.parse(fs.readFileSync(path.join(process.cwd(), "npcs", id, "traits.json"), "utf8")) as Record<
    string,
    unknown
  >;
  return {
    id,
    traits,
    characterMd: `${id} profile`,
    events: [],
    route: { spawn: { x: 0, y: 0 }, speed: 1, idleMs: [1, 2], waypoints: [] },
  };
}

function baseNpc(knowledge: Record<string, unknown>): NpcBundle {
  return {
    id: "test",
    traits: { name: "Test", knowledge },
    characterMd: "Test NPC",
    events: [],
    route: { spawn: { x: 0, y: 0 }, speed: 1, idleMs: [1, 2], waypoints: [] },
  };
}

function makeKnowledgeRoot(files: Array<{ relativePath: string; body: string }>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "last-summon-npc-kb-"));
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

function fact(id: string, options: { tags: string; text: string }): string {
  return `---
id: ${id}
title: Факт ${id}
type: fact
tier: village_common
tags: ${options.tags}
truth_level: true
related: []
contradicts: []
locked: false
canonical_source: test
created_at: 2026-05-08
last_validated: 2026-05-08
---

${options.text}
`;
}
