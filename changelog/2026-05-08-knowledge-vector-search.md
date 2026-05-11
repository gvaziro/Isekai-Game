---
date: 2026-05-08
agent: codex
action: add_knowledge_vector_search
target: src/knowledge/vectorIndex.ts
related_changes:
  - update:src/knowledge/types.ts
  - update:src/knowledge/cli.ts
  - update:src/server/npc-knowledge.ts
  - update:src/server/prompt-builder.ts
  - update:app/api/chat/[npcId]/route.ts
  - update:package.json
  - update:.env.example
  - update:.gitignore
reason: Добавить v1 локального JSON-векторного поиска по лору и гибридное подключение к NPC knowledge selection
---

Добавлен локальный `knowledge-vector-index.json` для embeddings, CLI-команды `kb:embed` и `kb:search:vector`, чанкинг `world/*`, runtime `npcs/*/character.md` и лор-профилей `docs/first-city-npcs/*.md`. NPC-подбор знаний получил async hybrid-путь: vector similarity + lexical boost + существующие фильтры доступа, с fallback на прежний текстовый поиск при отсутствии ключа, индекса или успешного embedding-запроса.
