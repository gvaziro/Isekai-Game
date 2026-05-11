---
date: 2026-05-08
agent: codex
action: harden_knowledge_vector_runtime
target: vector_knowledge_runtime
related_changes:
  - update:src/knowledge/vectorIndex.ts
  - update:src/knowledge/types.ts
  - update:src/knowledge/cli.ts
  - update:src/server/npc-knowledge.ts
  - update:package.json
  - update:.env.example
  - update:tests/vectorIndex.test.ts
  - update:tests/npcKnowledge.test.ts
reason: Сделать vector search наблюдаемым и безопасным для NPC runtime
---

Усилена диагностика локального vector index: добавлен health status для missing/stale/invalid/model_mismatch/dimension_mismatch, проверка stale/orphan/invalid chunks, CLI `kb:vector:check` и `kb:search:hybrid`. `kb:embed` теперь поддерживает batching через `EMBEDDING_BATCH_SIZE` и логирует reused/stale/orphan counts. NPC hybrid selection получил явные fallback-причины, `KNOWLEDGE_VECTOR_LOG=1`, отдельный `vectorIndexPath` и cache query embeddings.
