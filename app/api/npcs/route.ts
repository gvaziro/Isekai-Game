import { NextResponse } from "next/server";
import {
  listNpcIds,
  loadNpcBarksOnly,
  loadNpcDialogueScriptsOnly,
  loadNpcDisplayName,
  loadNpcRouteOnly,
} from "@/src/server/npc-loader";

export const runtime = "nodejs";

export async function GET() {
  const ids = await listNpcIds();
  const npcs = await Promise.all(
    ids.map(async (id) => {
      const [route, displayName, barks, dialogueScripts] = await Promise.all([
        loadNpcRouteOnly(id),
        loadNpcDisplayName(id),
        loadNpcBarksOnly(id),
        loadNpcDialogueScriptsOnly(id),
      ]);
      return {
        id,
        route,
        displayName,
        ...(barks.length > 0 ? { barks } : {}),
        ...(dialogueScripts && dialogueScripts.openers.length > 0
          ? { dialogueScripts }
          : {}),
      };
    })
  );
  return NextResponse.json(npcs);
}
