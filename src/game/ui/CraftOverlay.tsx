"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getRecipesForStation } from "@/src/game/data/recipes";
import { getCuratedItem } from "@/src/game/data/itemRegistry";
import { ITEM_ATLAS } from "@/src/game/data/items.generated";
import {
  ItemAtlasIcon,
  type ItemAtlasFramesFile,
} from "@/src/game/ui/ItemAtlasIcon";
import {
  GATHER_PROFESSION_LABELS,
  gatherProfessionIdForCraftStation,
  maxRecipeInputLinesForCraftingLevel,
  minCraftingLevelForRecipeInputLines,
  recipeInputLinesAllowed,
} from "@/src/game/data/professions";
import { useGameStore } from "@/src/game/state/gameStore";
import {
  cloneInventorySlots,
  simulateCraftOutputs,
} from "@/src/game/systems/craftInventory";
import { PaperModalChrome } from "@/src/game/ui/paper/PaperChrome";
import { PaperButton } from "@/src/game/ui/paper/PaperButton";
import { PaperSectionLabel } from "@/src/game/ui/paper/PaperSectionLabel";
import { PaperSlotChrome } from "@/src/game/ui/paper/PaperSlotChrome";

function craftToast(message: string): void {
  window.dispatchEvent(
    new CustomEvent("last-summon-craft-toast", { detail: { message } })
  );
}

export default function CraftOverlay({
  open,
  stationId,
  stationLabel,
  onClose,
}: {
  open: boolean;
  stationId: string;
  stationLabel: string;
  onClose: () => void;
}) {
  const inventorySlots = useGameStore((s) => s.inventorySlots);
  const gold = useGameStore((s) => s.character.gold);
  const craftProfessionId = useMemo(
    () => gatherProfessionIdForCraftStation(stationId),
    [stationId]
  );
  const professionLevel = useGameStore(
    (s) => s.professions[craftProfessionId].level
  );
  const professionLabel = GATHER_PROFESSION_LABELS[craftProfessionId];
  const tryCraftRecipe = useGameStore((s) => s.tryCraftRecipe);

  const [atlas, setAtlas] = useState<ItemAtlasFramesFile | null>(null);

  const recipes = useMemo(
    () => getRecipesForStation(stationId),
    [stationId]
  );

  useEffect(() => {
    if (!open || !ITEM_ATLAS.available) return;
    let cancelled = false;
    void fetch(ITEM_ATLAS.jsonUrl)
      .then((r) => r.json())
      .then((j: ItemAtlasFramesFile) => {
        if (!cancelled) setAtlas(j);
      })
      .catch(() => {
        if (!cancelled) setAtlas(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  const canCraftRecipe = useCallback(
    (recipeId: string) => {
      const list = getRecipesForStation(stationId);
      const recipe = list.find((r) => r.id === recipeId);
      if (!recipe) return false;
      if (!recipeInputLinesAllowed(professionLevel, recipe.inputs.length)) {
        return false;
      }
      const goldCost = Math.max(0, Math.floor(recipe.goldCost ?? 0));
      if (goldCost > gold) return false;
      const clone = cloneInventorySlots(inventorySlots);
      return simulateCraftOutputs(clone, recipe) !== null;
    },
    [stationId, gold, inventorySlots, professionLevel]
  );

  const cell = 36;

  const onCraft = (recipeId: string) => {
    const r = tryCraftRecipe(recipeId, stationId);
    if (r.materialsLost) {
      craftToast(r.reason ?? "Попытка провалилась — материалы потеряны.");
      return;
    }
    if (!r.ok) {
      craftToast(r.reason ?? "Не удалось создать предмет");
      return;
    }
    craftToast(r.successMessage ?? "Готово.");
  };

  if (!open || !stationId) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[92]">
      <PaperModalChrome title={stationLabel} onClose={onClose}>
        <div className="max-h-[min(70vh,520px)] overflow-y-auto pr-1">
          <p className="mb-2 text-[11px] leading-snug text-[#5c5346]">
            {professionLabel}: ур.{" "}
            <span className="font-mono text-[#3d2914]">{professionLevel}</span> · до{" "}
            {maxRecipeInputLinesForCraftingLevel(professionLevel)} компонентов в
            рецепте
          </p>
          <p className="mb-3 text-[11px] text-[#5c5346]">
            Золото:{" "}
            <span className="font-mono tabular-nums text-[#3d2914]">
              {Math.floor(gold)}
            </span>
          </p>
          <p className="mb-3 text-[10px] leading-snug text-[#7a7262]">
            Иногда попытка не удаётся — ингредиенты пропадают без результата (золото за
            рецепт при этом не списывается). Шанс срыва падает с ростом уровня этой
            профессии.
          </p>

          {recipes.length === 0 ? (
            <p className="text-sm text-[#6d6658]">
              Для этой станции пока нет рецептов.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {recipes.map((recipe) => {
                const ok = canCraftRecipe(recipe.id);
                const professionOk = recipeInputLinesAllowed(
                  professionLevel,
                  recipe.inputs.length
                );
                const needCraftLv = minCraftingLevelForRecipeInputLines(
                  recipe.inputs.length
                );
                return (
                  <div
                    key={recipe.id}
                    className={`rounded-md border border-[#5c4a32]/30 bg-[rgba(42,36,28,0.05)] px-3 py-2 ${
                      !professionOk ? "opacity-80" : ""
                    }`}
                  >
                    {!professionOk ? (
                      <p className="mb-1.5 text-[10px] text-amber-800/95">
                        Нужен уровень «{professionLabel}» {needCraftLv}{" "}
                        (компонентов: {recipe.inputs.length})
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-medium text-[#3d2914]">
                        {recipe.label ?? recipe.id}
                      </div>
                      <PaperButton
                        type="button"
                        variant="accent"
                        className="!px-2 !py-0.5 text-[10px]"
                        disabled={!ok}
                        onClick={() => onCraft(recipe.id)}
                      >
                        Создать
                      </PaperButton>
                    </div>
                    {(recipe.goldCost ?? 0) > 0 ? (
                      <p className="mt-1 text-[11px] text-[#8a8270]">
                        Золото: {recipe.goldCost}
                      </p>
                    ) : null}

                    <div className="mt-2">
                      <PaperSectionLabel>Нужно</PaperSectionLabel>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {recipe.inputs.map((line, i) => {
                        const def = getCuratedItem(line.curatedId);
                        return (
                          <div
                            key={`in-${i}`}
                            className="flex items-end gap-1.5 text-[11px]"
                          >
                            <PaperSlotChrome>
                              <ItemAtlasIcon
                                atlas={atlas}
                                frameKey={def?.atlasFrame ?? null}
                                cell={cell}
                              />
                            </PaperSlotChrome>
                            <div>
                              <div className="max-w-[8rem] truncate text-[#3d2914]">
                                {def?.name ?? line.curatedId}
                              </div>
                              <div className="font-mono text-[#6d6658]">
                                ×{line.qty}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-2">
                      <PaperSectionLabel>Получите</PaperSectionLabel>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {recipe.outputs.map((line, i) => {
                        const def = getCuratedItem(line.curatedId);
                        return (
                          <div
                            key={`out-${i}`}
                            className="flex items-end gap-1.5 text-[11px]"
                          >
                            <PaperSlotChrome>
                              <ItemAtlasIcon
                                atlas={atlas}
                                frameKey={def?.atlasFrame ?? null}
                                cell={cell}
                              />
                            </PaperSlotChrome>
                            <div>
                              <div className="max-w-[8rem] truncate text-[#3d2914]">
                                {def?.name ?? line.curatedId}
                              </div>
                              <div className="font-mono text-[#6d6658]">
                                ×{line.qty}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PaperModalChrome>
    </div>
  );
}
