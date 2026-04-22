import { NPC_REPLY_MAX_CHARS } from "@/src/game/constants/dialogue";

export function clipNpcReply(text: string): string {
  if (text.length <= NPC_REPLY_MAX_CHARS) return text;
  return `${text.slice(0, NPC_REPLY_MAX_CHARS)}…`;
}
