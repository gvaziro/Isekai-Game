import type { NpcBundle } from "@/src/server/types";
import { loadNpc, npcBundleVersion } from "@/src/server/npc-loader";

const MAX_ENTRIES = 64;

type Cached = {
  ver: string;
  value: NpcBundle;
};

/** LRU по порядку вставки Map (перезапись переносит в конец). */
const npcCache = new Map<string, Cached>();

export async function loadNpcCached(id: string): Promise<NpcBundle> {
  const ver = await npcBundleVersion(id);
  const hit = npcCache.get(id);
  if (hit && hit.ver === ver) {
    npcCache.delete(id);
    npcCache.set(id, hit);
    return hit.value;
  }

  const value = await loadNpc(id);
  npcCache.delete(id);
  npcCache.set(id, { ver, value });

  while (npcCache.size > MAX_ENTRIES) {
    const oldest = npcCache.keys().next().value as string | undefined;
    if (!oldest) break;
    npcCache.delete(oldest);
  }

  return value;
}
