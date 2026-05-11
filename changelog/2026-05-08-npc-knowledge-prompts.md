---
date: 2026-05-08
agent: codex
action: connect_npc_knowledge
target: npc_prompts
related_changes:
  - update:world/facts
  - update:npcs/*/traits.json
  - create:src/server/npc-knowledge.ts
  - update:src/server/prompt-builder.ts
reason: Подключить персональные срезы базы знаний к OpenAI NPC-промптам
---

Расширен набор фактов стартовой деревни и добавлен серверный подбор знаний для Елены, Маркуса и Игоря. Общий канон больше не вставляется в каждый NPC-промпт целиком; вместо него используется релевантный knowledge-срез по правам доступа NPC и текущей реплике игрока.
