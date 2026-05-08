/** Макс. длина реплики NPC (символы) — UI и `/api/chat/[npcId]` используют одно значение. */
export const NPC_REPLY_MAX_CHARS = 360;

/** Оценка верхней границы токенов для короткой реплики (дополняет обрезку по символам). */
export const NPC_REPLY_MAX_TOKENS = 200;

/** Верхняя граница токенов для structured JSON (reply + 3 suggestions). */
export const NPC_STRUCTURED_MAX_COMPLETION_TOKENS = 420;
