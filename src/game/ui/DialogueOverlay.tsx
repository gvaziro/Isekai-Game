"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { z } from "zod";
import { NPC_REPLY_MAX_CHARS } from "@/src/game/constants/dialogue";
import { DUNGEON_MAX_FLOOR } from "@/src/game/data/dungeonFloorScaling";
import { getShopByNpc } from "@/src/game/data/shops";
import { buildShopPromptSnapshot } from "@/src/game/data/shopPromptSnapshot";
import {
  NpcChatClientResponseSchema,
} from "@/src/game/data/npcChatStructured";
import { QUESTS_BY_ID } from "@/src/game/data/quests";
import { useGameStore } from "@/src/game/state/gameStore";
import { useLoreJournalStore } from "@/src/game/state/loreJournalStore";
import { useQuestStore } from "@/src/game/state/questStore";
import { hasStarterNpcAiLoreAccess } from "@/src/game/data/npcDialogueProgress";
import type { NpcDialogueScene } from "@/src/game/types";
import { clipNpcReply } from "@/src/game/ui/npcReplyClip";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import "@/src/game/ui/paper-ui.css";

type Turn = { role: "user" | "assistant"; content: string };
type ScriptChoice = NonNullable<NpcDialogueScene["steps"][number]>["choices"][number];

const ApiErrorBodySchema = z.object({ error: z.string() });

function unlockLoreFromIntro(npcId: string, ids?: readonly string[]): void {
  if (typeof window === "undefined" || !ids?.length) return;
  window.dispatchEvent(
    new CustomEvent("last-summon:lore-unlock", {
      detail: { factIds: ids, source: `npc_intro:${npcId}` },
    })
  );
}

function buildWorldSnapshotForNpcChat(): string {
  if (typeof window === "undefined") return "";
  const gs = useGameStore.getState();
  const qs = useQuestStore.getState();
  const act = qs.active;
  const activeStr = act
    ? `активный квест «${act.questId}», шаг ${act.stageIndex + 1}`
    : "нет активного квеста";
  return [
    `Имя игрока: ${gs.playerName}`,
    "NPC могут естественно обращаться к игроку по имени, если это уместно, но не должны повторять имя в каждой реплике.",
    `Локация игрока: ${gs.currentLocationId}`,
    `Туман на западной дороге: ${
      gs.villageFogLifted
        ? "рассеян — путь из деревни открыт"
        : "стоит — нужно победить Короля гоблинов на последнем этаже катакомб"
    }`,
    `Катакомбы: макс. зачищенный этаж ${gs.dungeonMaxClearedFloor} из ${DUNGEON_MAX_FLOOR}`,
    `Квесты: ${activeStr}; завершённые: ${qs.completedQuestIds.join(", ") || "—"}`,
  ].join("\n");
}

function buildShopSnapshotForNpcChat(npcId: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  const shop = getShopByNpc(npcId);
  if (!shop) return undefined;
  const gs = useGameStore.getState();
  return buildShopPromptSnapshot({
    shop,
    runtime: gs.shops[shop.id],
    characterLevel: gs.character.level,
    gold: gs.character.gold,
  });
}

function NpcMessageBody({ content }: { content: string }) {
  const trimmed = content.trim();
  if (!trimmed) {
    return (
      <span className="text-[#7f735f] italic">
        Модель не вернула текст. Повторите сообщение или смените фразу.
      </span>
    );
  }
  return (
    <span className="whitespace-pre-wrap break-words">
      {clipNpcReply(content)}
    </span>
  );
}

function NpcPortrait({
  npcId,
  displayName,
}: {
  npcId: string;
  displayName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const name = displayName ?? npcId;
  const src = `/assets/characters/${npcId}/rotations/south.png`;

  return (
    <div className="paper-pixelated flex w-full shrink-0 flex-row items-center gap-2 border-b border-[#5c4a32]/25 pb-2 sm:w-[8.5rem] sm:flex-col sm:border-b-0 sm:border-r sm:pb-0 sm:pr-3">
      <div className="relative flex h-16 w-16 shrink-0 items-end justify-center overflow-hidden rounded-sm border-2 border-[#5c4a32]/55 bg-[#d7c8a9] shadow-inner sm:h-28 sm:w-28">
        {!failed ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- пиксельный спрайт из /public */}
            <img
              src={src}
              alt={name}
              width={68}
              height={68}
              decoding="async"
              className="h-[88%] w-[88%] object-contain [image-rendering:pixelated]"
              onError={() => setFailed(true)}
            />
          </>
        ) : (
          <span className="px-2 text-center text-[10px] font-semibold leading-tight text-[#5c4a32]">
            {name}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 text-left sm:text-center">
        <p className="truncate text-sm font-semibold leading-tight text-[#2a241c] sm:text-base">
          {name}
        </p>
        <p className="mt-0.5 text-[10px] uppercase leading-tight tracking-wide text-[#7a6b55]">
          NPC
        </p>
      </div>
    </div>
  );
}

function DialogueFrame({
  children,
  npcId,
  displayName,
  loading,
  summarizing,
  onSummarize,
  onClose,
}: {
  children: ReactNode;
  npcId: string;
  displayName?: string;
  loading: boolean;
  summarizing: boolean;
  onSummarize: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[100] flex items-end justify-center bg-black/30 px-2 pb-2 pt-12 backdrop-blur-[1px] sm:px-4 sm:pb-4"
      role="presentation"
    >
      <section
        className="paper-pixelated paper-parchment-bg flex max-h-[48vh] min-h-[15rem] w-full max-w-[min(960px,calc(100vw-16px))] flex-col overflow-hidden border-2 border-[#5c4a32]/45 px-3 py-3 text-[#2a241c] shadow-2xl sm:max-h-[38vh] sm:max-w-[min(960px,calc(100vw-32px))] sm:px-4"
        aria-label={`Диалог с ${displayName ?? npcId}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex shrink-0 items-start justify-between gap-2 border-b border-[#5c4a32]/25 pb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7a6b55]">
              Разговор
            </p>
            <h2 className="truncate text-base font-semibold leading-tight text-[#2a241c] sm:text-lg">
              {displayName ?? npcId}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <PaperButton
              type="button"
              variant="accent"
              disabled={summarizing || loading}
              className="px-2 py-1 text-[10px] sm:text-[11px]"
              onClick={onSummarize}
            >
              {summarizing ? "Сохранение..." : "Завершить"}
            </PaperButton>
            <PaperButton
              type="button"
              variant="close"
              disabled={summarizing}
              className="px-2 py-1 text-[10px] sm:text-[11px]"
              onClick={onClose}
            >
              Esc
            </PaperButton>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}

function DialogueHistory({
  msgs,
  loading,
  endRef,
}: {
  msgs: Turn[];
  loading: boolean;
  endRef: RefObject<HTMLDivElement | null>;
}) {
  if (msgs.length === 0 && !loading) return null;

  return (
    <div className="paper-scroll min-h-[3.5rem] flex-1 space-y-1.5 overflow-y-auto rounded-sm border border-[#5c4a32]/20 bg-[rgba(42,36,28,0.055)] px-2 py-1.5">
      {msgs.map((m, i) => (
        <div
          key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
          className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 text-xs leading-relaxed sm:grid-cols-[4rem_minmax(0,1fr)]"
        >
          <span
            className={
              m.role === "user"
                ? "font-semibold text-[#1b6b52]"
                : "font-semibold text-[#7a5218]"
            }
          >
            {m.role === "user" ? "Вы" : "NPC"}
          </span>
          <p className="min-w-0 whitespace-pre-wrap break-words text-[#3d362c]">
            {m.role === "user" ? m.content : <NpcMessageBody content={m.content} />}
          </p>
        </div>
      ))}
      {loading ? (
        <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-2 text-xs leading-relaxed sm:grid-cols-[4rem_minmax(0,1fr)]">
          <span className="font-semibold text-[#7a5218]">NPC</span>
          <p className="animate-pulse text-[#6d6658]">Печатает...</p>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}

function ScriptedChoices({
  choices,
  disabled,
  onChoose,
}: {
  choices: ScriptChoice[];
  disabled: boolean;
  onChoose: (choice: ScriptChoice) => void;
}) {
  return (
    <div className="grid shrink-0 gap-1.5 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
      {choices.map((choice) => (
        <button
          key={choice.label}
          type="button"
          disabled={disabled}
          className="min-h-10 rounded-sm border-2 border-[#1b6b52]/75 bg-[#f4ecd8]/92 px-3 py-2 text-left text-xs font-semibold leading-snug text-[#1a3228] shadow-sm transition-colors hover:bg-[#dcefdc] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1b6b52] disabled:opacity-45 sm:text-[13px]"
          onClick={() => onChoose(choice)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

function DialogueActions({
  shopAvailable,
  disabled,
  onOpenShop,
}: {
  shopAvailable: boolean;
  disabled: boolean;
  onOpenShop?: () => void;
}) {
  if (!shopAvailable || !onOpenShop) return null;

  return (
    <div className="grid shrink-0 gap-1.5 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
      <button
        type="button"
        disabled={disabled}
        className="min-h-10 rounded-sm border-2 border-[#7a5218]/75 bg-[#f6e3bc]/95 px-3 py-2 text-left text-xs font-semibold leading-snug text-[#4c3210] shadow-sm transition-colors hover:bg-[#efd198] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7a5218] disabled:opacity-45 sm:text-[13px]"
        onClick={onOpenShop}
      >
        Торговля
      </button>
    </div>
  );
}

function AiInputBar({
  inputRef,
  input,
  setInput,
  canChat,
  scriptedActive,
  aiLoreUnlocked,
  loading,
  summarizing,
  onSend,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  input: string;
  setInput: (value: string) => void;
  canChat: boolean;
  scriptedActive: boolean;
  aiLoreUnlocked: boolean;
  loading: boolean;
  summarizing: boolean;
  onSend: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-2 border-t border-[#5c4a32]/25 pt-2">
      <input
        ref={inputRef}
        className="min-w-0 flex-1 rounded-sm border-2 border-[#5c4a32]/45 bg-[#f8f0dc] px-3 py-2 text-sm text-[#2a241c] outline-none placeholder:text-[#8a8270] focus:border-[#1b6b52] disabled:bg-[#d8ccb8]/70 disabled:text-[#7f735f]"
        placeholder={
          scriptedActive
            ? "Сначала выберите ответ по текущей задаче..."
            : aiLoreUnlocked
              ? "Спросить NPC..."
              : "Свободный разговор откроется после первых записей в дневнике..."
        }
        value={input}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={loading || summarizing || !canChat}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Tab") {
            e.preventDefault();
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        onKeyUp={(e) => e.stopPropagation()}
      />
      <PaperButton
        type="button"
        variant="accent"
        disabled={loading || summarizing || !input.trim() || !canChat}
        className="shrink-0 px-3 py-2 text-[11px] sm:px-4"
        onClick={onSend}
      >
        Отправить
      </PaperButton>
    </div>
  );
}

export default function DialogueOverlay({
  npcId,
  displayName,
  scriptedScenes,
  onOpenShop,
  onClose,
}: {
  npcId: string;
  /** Имя из traits.json (через GET /api/npcs) */
  displayName?: string;
  /** Квестовые scripted-сцены из `dialogue_scripts.json`. */
  scriptedScenes?: ReadonlyArray<NpcDialogueScene>;
  onOpenShop?: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Turn[]>([]);
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [scriptStepId, setScriptStepId] = useState<string | null>(null);
  const [hasAiConversation, setHasAiConversation] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const unlockedFactIds = useLoreJournalStore((s) => s.unlockedFactIds);
  const activeQuest = useQuestStore((s) => s.active);
  const activeQuestDef = activeQuest ? QUESTS_BY_ID[activeQuest.questId] : null;
  const activeStage = activeQuestDef?.stages[activeQuest?.stageIndex ?? -1];
  const shopAvailable = Boolean(getShopByNpc(npcId));
  const activeTalkToNpcId =
    activeStage?.objective.kind === "talk_to"
      ? activeStage.objective.npcId
      : null;
  const scriptedScene =
    activeQuest &&
    activeStage &&
    activeTalkToNpcId === npcId &&
    scriptedScenes
      ? scriptedScenes.find(
          (s) =>
            s.questId === activeQuest.questId &&
            s.stageId === activeStage.id
        )
      : undefined;
  const scriptedActive = Boolean(scriptedScene);
  const aiLoreUnlocked = hasStarterNpcAiLoreAccess(unlockedFactIds);
  const aiChatAvailable = !scriptedActive && aiLoreUnlocked;
  const currentScriptStep =
    scriptedActive && scriptedScene
      ? scriptedScene.steps.find((s) => s.id === scriptStepId) ??
        scriptedScene.steps[0]
      : undefined;

  useEffect(() => {
    if (aiChatAvailable) inputRef.current?.focus();
  }, [aiChatAvailable]);

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, loading]);

  const close = useCallback(() => {
    setError(null);
    window.dispatchEvent(
      new CustomEvent("npc-dialogue-close", { detail: { npcId } })
    );
    window.dispatchEvent(
      new CustomEvent("last-summon:dialogue-close", { detail: { npcId } })
    );
    onClose();
  }, [npcId, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [close]);

  async function summarizeAndClose(): Promise<void> {
    setError(null);
    if (!hasAiConversation) {
      close();
      return;
    }
    setSummarizing(true);
    try {
      const res = await fetch(`/api/npc/${npcId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "summarize_dialogue",
          transcript: msgs.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      if (!res.ok) {
        setError(`Не удалось сохранить саммари: ${res.status}`);
        return;
      }
    } catch {
      setError("Ошибка сети при сохранении саммари.");
      return;
    } finally {
      setSummarizing(false);
    }
    close();
  }

  async function sendUserMessage(
    raw: string,
    opts?: { restoreInputOnError?: string }
  ): Promise<void> {
    const text = raw.trim();
    if (!text || loading || summarizing || !aiChatAvailable) return;

    chatAbortRef.current?.abort();
    const ac = new AbortController();
    chatAbortRef.current = ac;

    setLoading(true);
    setError(null);

    try {
      const history = msgs.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch(`/api/chat/${npcId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history,
          worldSnapshot: buildWorldSnapshotForNpcChat(),
          shopSnapshot: buildShopSnapshotForNpcChat(npcId),
        }),
        signal: ac.signal,
      });

      let rawBody: unknown;
      try {
        rawBody = await res.json();
      } catch {
        setError("Сервер вернул не-JSON ответ.");
        if (opts?.restoreInputOnError !== undefined) {
          setInput(opts.restoreInputOnError);
        }
        return;
      }

      if (!res.ok) {
        const errParsed = ApiErrorBodySchema.safeParse(rawBody);
        setError(
          errParsed.success
            ? errParsed.data.error
            : `Запрос не удался (${res.status}).`
        );
        if (opts?.restoreInputOnError !== undefined) {
          setInput(opts.restoreInputOnError);
        }
        return;
      }

      const dataParsed = NpcChatClientResponseSchema.safeParse(rawBody);
      if (!dataParsed.success) {
        setError("Некорректный ответ сервера (ожидался JSON с reply и suggestions).");
        if (opts?.restoreInputOnError !== undefined) {
          setInput(opts.restoreInputOnError);
        }
        return;
      }

      const { reply, suggestions } = dataParsed.data;
      setHasAiConversation(true);
      setMsgs((m) => [
        ...m,
        { role: "user", content: text },
        { role: "assistant", content: reply },
      ]);
      setSuggestedReplies(suggestions);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return;
      }
      setError("Сеть или сервер недоступны.");
      if (opts?.restoreInputOnError !== undefined) {
        setInput(opts.restoreInputOnError);
      }
    } finally {
      setLoading(false);
    }
  }

  async function send(): Promise<void> {
    const text = input.trim();
    if (!text || loading || summarizing || !aiChatAvailable) return;
    setInput("");
    await sendUserMessage(text, { restoreInputOnError: text });
  }

  function completeScriptedScene(scene: NpcDialogueScene): void {
    window.dispatchEvent(
      new CustomEvent("last-summon:npc-script-completed", {
        detail: {
          npcId,
          questId: scene.questId,
          stageId: scene.stageId,
          sceneId: scene.id,
        },
      })
    );
    setScriptStepId(null);
  }

  function chooseScriptReply(choice: ScriptChoice): void {
    if (!scriptedScene || !currentScriptStep) return;

    const grants = choice.grantItems;
    if (grants?.length) {
      const failed: string[] = [];
      for (const g of grants) {
        const r = useGameStore.getState().tryAddItem(g.curatedId, g.qty);
        if (!r.ok) failed.push(r.reason ?? g.curatedId);
      }
      if (failed.length > 0) {
        window.dispatchEvent(
          new CustomEvent("last-summon-toast", {
            detail: { message: failed.join(" · ") },
          })
        );
      }
    }

    const takes = choice.takeItems;
    if (takes?.length) {
      const r = useGameStore.getState().tryRemoveCuratedLines(takes);
      if (!r.ok) {
        window.dispatchEvent(
          new CustomEvent("last-summon-toast", {
            detail: {
              message: r.reason ?? "Не удалось забрать предметы.",
            },
          })
        );
      }
    }

    unlockLoreFromIntro(npcId, choice.unlockLoreFactIds);
    setSuggestedReplies([]);

    if (choice.complete) {
      completeScriptedScene(scriptedScene);
      return;
    }

    const next =
      choice.nextStepId &&
      scriptedScene.steps.some((step) => step.id === choice.nextStepId)
        ? choice.nextStepId
        : null;
    if (next) {
      setScriptStepId(next);
      return;
    }

    completeScriptedScene(scriptedScene);
  }

  return (
    <DialogueFrame
      npcId={npcId}
      displayName={displayName}
      loading={loading}
      summarizing={summarizing}
      onSummarize={() => void summarizeAndClose()}
      onClose={close}
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row"
        onMouseDown={() => {
          if (aiChatAvailable) inputRef.current?.focus();
        }}
        role="presentation"
      >
        <NpcPortrait npcId={npcId} displayName={displayName} />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          {error ? (
            <div className="shrink-0 rounded-sm border-2 border-[#8b2f24]/60 bg-[#f2d5c8] px-3 py-2 text-xs font-semibold leading-snug text-[#6f241d]">
              {error}
            </div>
          ) : null}

          {currentScriptStep ? (
            <div className="shrink-0 rounded-sm border border-[#5c4a32]/20 bg-[rgba(255,255,255,0.18)] px-3 py-2">
              <p className="whitespace-pre-wrap break-words text-[15px] font-medium leading-relaxed text-[#2a241c] sm:text-base">
                {currentScriptStep.npcText}
              </p>
            </div>
          ) : null}

          {!scriptedActive ? (
            <DialogueHistory msgs={msgs} loading={loading} endRef={endRef} />
          ) : null}

          {!aiChatAvailable && !scriptedActive ? (
            <div className="shrink-0 rounded-sm border border-[#9b6a20]/45 bg-[#f2dfb8]/75 px-3 py-2 text-xs leading-relaxed text-[#5f451c]">
              Свободный разговор откроется, когда в дневнике появятся первые
              записи о деревне, тумане и самом дневнике.
            </div>
          ) : null}

          {currentScriptStep ? (
            <ScriptedChoices
              choices={currentScriptStep.choices}
              disabled={summarizing}
              onChoose={chooseScriptReply}
            />
          ) : null}

          <DialogueActions
            shopAvailable={shopAvailable}
            disabled={summarizing}
            onOpenShop={onOpenShop}
          />

          {aiChatAvailable && suggestedReplies.length === 3 ? (
            <div className="grid shrink-0 gap-1.5 sm:grid-cols-3">
              {suggestedReplies.map((s, i) => (
                <button
                  key={`${i}-${s.slice(0, 24)}`}
                  type="button"
                  disabled={loading || summarizing}
                  className="rounded-sm border border-[#1b6b52]/65 bg-[#e7f0d8]/90 px-2.5 py-1.5 text-left text-[11px] font-semibold leading-snug text-[#1a3228] transition-colors hover:bg-[#d4ebcf] disabled:opacity-45"
                  onClick={() => void sendUserMessage(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}

          <AiInputBar
            inputRef={inputRef}
            input={input}
            setInput={setInput}
            canChat={aiChatAvailable}
            scriptedActive={scriptedActive}
            aiLoreUnlocked={aiLoreUnlocked}
            loading={loading}
            summarizing={summarizing}
            onSend={() => void send()}
          />

          <p className="shrink-0 text-center text-[10px] leading-tight text-[#7a6b55]">
            Enter — отправить · Esc — закрыть · ответ NPC до{" "}
            {NPC_REPLY_MAX_CHARS} символов
          </p>
        </div>
      </div>
    </DialogueFrame>
  );
}
