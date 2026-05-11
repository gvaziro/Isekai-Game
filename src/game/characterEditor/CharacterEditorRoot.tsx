"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import type { CharacterPackJson } from "@/src/game/load/mergeAssetManifestExtras";
import {
  deleteProfile,
  emptyPack,
  getProfile,
  listProfiles,
  mergeAllProfilesToPack,
  pickUniqueSlug,
  putProfile,
  sanitizeSlug,
  type CharacterEditorRole,
  type CharacterProfileRecord,
} from "@/src/game/characterEditor/characterProfileDb";
import type {
  AssetManifest,
  AssetManifestAnimEntry,
  AssetManifestLoadEntry,
  AssetManifestLoadSpritesheet,
} from "@/src/game/types";

const LEGACY_STORAGE_KEY = "last-summon-character-editor-draft-v1";
const LAST_SLUG_KEY = "last-summon-character-editor-active-slug";

const IMAGE_MIME = /^image\/(png|webp|jpeg|gif)$/i;

function extractImageFiles(dt: DataTransfer | null): File[] {
  if (!dt?.files?.length) return [];
  return Array.from(dt.files).filter((f) => IMAGE_MIME.test(f.type));
}

function fileStem(name: string): string {
  return sanitizeSlug(name.replace(/\.[^.]+$/i, ""));
}

type SheetRow = {
  id: string;
  entry: AssetManifestLoadEntry;
  /** Локальный превью-URL (не попадает в JSON). */
  previewUrl?: string;
};

type UnitRow = { id: string; idleAnim: string; runAnim: string };
type MobRow = {
  id: string;
  idleAnim: string;
  runAnim: string;
  textureKeyIdle: string;
};

function newId(): string {
  return crypto.randomUUID();
}

function emptyEditorPack(): CharacterPackJson {
  return emptyPack();
}

function downloadBlob(filename: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function downloadJson(filename: string, data: unknown): void {
  downloadBlob(
    filename,
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  );
}

function isSpritesheet(
  e: AssetManifestLoadEntry
): e is AssetManifestLoadSpritesheet {
  return e.type === "spritesheet";
}

function packFromState(
  sheets: SheetRow[],
  anims: AssetManifestAnimEntry[],
  units: UnitRow[],
  mobs: MobRow[]
): CharacterPackJson {
  const load = sheets.map((s) => s.entry);
  const unitsObj: CharacterPackJson["units"] = {};
  for (const u of units) {
    const id = u.id.trim();
    if (!id) continue;
    unitsObj[id] = { idleAnim: u.idleAnim.trim(), runAnim: u.runAnim.trim() };
  }
  const mobsObj: CharacterPackJson["mobs"] = {};
  for (const m of mobs) {
    const id = m.id.trim();
    if (!id) continue;
    mobsObj[id] = {
      idleAnim: m.idleAnim.trim(),
      runAnim: m.runAnim.trim(),
      textureKeyIdle: m.textureKeyIdle.trim(),
    };
  }
  return {
    load,
    animations: anims.filter((a) => a.key.trim()),
    units: unitsObj,
    mobs: mobsObj,
  };
}

function hydrateFromPack(pack: CharacterPackJson): {
  sheets: SheetRow[];
  anims: AssetManifestAnimEntry[];
  units: UnitRow[];
  mobs: MobRow[];
} {
  const sheets: SheetRow[] = (pack.load ?? []).map((entry) => ({
    id: newId(),
    entry,
  }));
  const anims = [...(pack.animations ?? [])];
  const units: UnitRow[] = Object.entries(pack.units ?? {}).map(
    ([id, v]) => ({
      id,
      idleAnim: v.idleAnim,
      runAnim: v.runAnim,
    })
  );
  const mobs: MobRow[] = Object.entries(pack.mobs ?? {}).map(([id, v]) => ({
    id,
    idleAnim: v.idleAnim,
    runAnim: v.runAnim,
    textureKeyIdle: v.textureKeyIdle,
  }));
  return { sheets, anims, units, mobs };
}

function AnimationPreview({
  imageUrl,
  frameWidth,
  frameHeight,
  start,
  end,
  frameRate,
}: {
  imageUrl: string;
  frameWidth: number;
  frameHeight: number;
  start: number;
  end: number;
  frameRate: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fiRef = useRef(0);
  const lastRef = useRef(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frameWidth <= 0 || frameHeight <= 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = 2;
    canvas.width = frameWidth * scale;
    canvas.height = frameHeight * scale;
    ctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    let alive = true;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);
    fiRef.current = lo;
    lastRef.current = performance.now();

    const tick = (t: number) => {
      if (!alive) return;
      if (t - lastRef.current > 1000 / Math.max(1, frameRate)) {
        lastRef.current = t;
        fiRef.current = fiRef.current >= hi ? lo : fiRef.current + 1;
      }
      const cols = Math.max(1, Math.floor(img.naturalWidth / frameWidth));
      const fi = Math.min(hi, Math.max(lo, fiRef.current));
      const sx = (fi % cols) * frameWidth;
      const sy = Math.floor(fi / cols) * frameHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(
          img,
          sx,
          sy,
          frameWidth,
          frameHeight,
          0,
          0,
          canvas.width,
          canvas.height
        );
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    img.onload = () => {
      fiRef.current = lo;
      lastRef.current = performance.now();
      rafRef.current = requestAnimationFrame(tick);
    };
    img.src = imageUrl;
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [imageUrl, frameWidth, frameHeight, start, end, frameRate]);

  if (!imageUrl) {
    return <p className="text-[11px] text-zinc-500">Нет превью-URL листа</p>;
  }

  return (
    <canvas
      ref={canvasRef}
      className="rounded border border-zinc-600 bg-zinc-950"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

function FilmstripRangePicker({
  imageUrl,
  frameWidth,
  frameHeight,
  start,
  end,
  onChangeStart,
  onChangeEnd,
}: {
  imageUrl: string;
  frameWidth: number;
  frameHeight: number;
  start: number;
  end: number;
  onChangeStart: (n: number) => void;
  onChangeEnd: (n: number) => void;
}) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (frameWidth <= 0 || frameHeight <= 0) {
        setCount(0);
        return;
      }
      const cols = Math.floor(img.naturalWidth / frameWidth);
      const rows = Math.floor(img.naturalHeight / frameHeight);
      setCount(Math.max(0, cols * rows));
    };
    img.onerror = () => setCount(0);
    img.src = imageUrl;
  }, [imageUrl, frameWidth, frameHeight]);

  const thumb = 20;
  const scale = thumb / Math.max(frameWidth, 1);

  if (count <= 0 || !imageUrl) {
    return <p className="text-[11px] text-zinc-500">Кадры недоступны</p>;
  }

  const lo = Math.min(start, end);
  const hi = Math.max(start, end);

  return (
    <div className="flex flex-wrap gap-0.5 rounded border border-zinc-700 bg-zinc-900/80 p-1">
      {Array.from({ length: count }, (_, i) => {
        const inRange = i >= lo && i <= hi;
        return (
          <button
            key={i}
            type="button"
            title={`Кадр ${i}`}
            className={`relative shrink-0 rounded border ${
              i === start || i === end
                ? "border-amber-400 ring-1 ring-amber-500/50"
                : inRange
                  ? "border-emerald-700/80"
                  : "border-zinc-700"
            }`}
            style={{ width: frameWidth * scale, height: frameHeight * scale }}
            onClick={(e) => {
              if (e.shiftKey) onChangeEnd(i);
              else onChangeStart(i);
            }}
          >
            <FrameThumb
              imageUrl={imageUrl}
              frameWidth={frameWidth}
              frameHeight={frameHeight}
              index={i}
              scale={scale}
            />
          </button>
        );
      })}
      <p className="w-full pt-1 text-[10px] text-zinc-500">
        Клик — start, Shift+клик — end. Диапазон {lo}…{hi}
      </p>
    </div>
  );
}

function FrameThumb({
  imageUrl,
  frameWidth,
  frameHeight,
  index,
  scale,
}: {
  imageUrl: string;
  frameWidth: number;
  frameHeight: number;
  index: number;
  scale: number;
}) {
  const c = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = c.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = frameWidth * scale;
    canvas.height = frameHeight * scale;
    ctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const cols = Math.floor(img.naturalWidth / frameWidth);
      if (cols <= 0) return;
      const sx = (index % cols) * frameWidth;
      const sy = Math.floor(index / cols) * frameHeight;
      ctx.drawImage(
        img,
        sx,
        sy,
        frameWidth,
        frameHeight,
        0,
        0,
        canvas.width,
        canvas.height
      );
    };
    img.src = imageUrl;
  }, [imageUrl, frameWidth, frameHeight, index, scale]);

  return (
    <canvas
      ref={c}
      className="block h-full w-full"
      style={{ imageRendering: "pixelated" }}
    />
  );
}

export default function CharacterEditorRoot() {
  const [profiles, setProfiles] = useState<CharacterProfileRecord[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<CharacterEditorRole>("npc");
  const [gameId, setGameId] = useState("");

  const [sheets, setSheets] = useState<SheetRow[]>([]);
  const [anims, setAnims] = useState<AssetManifestAnimEntry[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [mobs, setMobs] = useState<MobRow[]>([]);
  const [manifestKeys, setManifestKeys] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const [cropFile, setCropFile] = useState<File | null>(null);
  const [cropUrl, setCropUrl] = useState<string | null>(null);
  const [cropSx, setCropSx] = useState(0);
  const [cropSy, setCropSy] = useState(0);
  const [cellW, setCellW] = useState(32);
  const [cellH, setCellH] = useState(32);
  const [cropCols, setCropCols] = useState(4);
  const [cropRows, setCropRows] = useState(1);
  const [stripFilename, setStripFilename] = useState("custom_strip.png");

  const [dndHoverSheets, setDndHoverSheets] = useState(false);
  const [dndHoverCrop, setDndHoverCrop] = useState(false);

  const sheetKeys = useMemo(
    () => sheets.map((s) => s.entry.key).filter(Boolean),
    [sheets]
  );
  const textureKeyOptions = useMemo(
    () => [...new Set([...manifestKeys, ...sheetKeys])].sort(),
    [manifestKeys, sheetKeys]
  );

  const loadDraft = useCallback((pack: CharacterPackJson) => {
    const h = hydrateFromPack(pack);
    setSheets(h.sheets);
    setAnims(h.anims);
    setUnits(h.units);
    setMobs(h.mobs);
  }, []);

  const refreshProfiles = useCallback(async () => {
    const list = await listProfiles();
    setProfiles(list);
    return list;
  }, []);

  const flushCurrentToDb = useCallback(async () => {
    if (!activeSlug) return;
    const pack = packFromState(sheets, anims, units, mobs);
    await putProfile({
      slug: activeSlug,
      displayName: displayName.trim() || activeSlug,
      role,
      gameId: gameId.trim(),
      pack,
      updatedAt: Date.now(),
    });
    await refreshProfiles();
  }, [
    activeSlug,
    displayName,
    role,
    gameId,
    sheets,
    anims,
    units,
    mobs,
    refreshProfiles,
  ]);

  const applyProfileRecord = useCallback((rec: CharacterProfileRecord) => {
    setActiveSlug(rec.slug);
    setDisplayName(rec.displayName);
    setRole(rec.role);
    setGameId(rec.gameId);
    loadDraft(rec.pack ?? emptyEditorPack());
    try {
      localStorage.setItem(LAST_SLUG_KEY, rec.slug);
    } catch {
      /* ignore */
    }
  }, [loadDraft]);

  useEffect(() => {
    void fetch("/assets/world/manifest.json")
      .then((r) => r.json())
      .then((data: AssetManifest) => {
        setManifestKeys((data.load ?? []).map((e) => e.key));
      })
      .catch(() => setManifestKeys([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let list = await listProfiles();
      if (cancelled) return;
      if (list.length === 0) {
        try {
          const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (raw) {
            const p = JSON.parse(raw) as CharacterPackJson;
            if (p && typeof p === "object") {
              const slug = pickUniqueSlug("imported", new Set());
              await putProfile({
                slug,
                displayName: "Импорт из старого черновика",
                role: "npc",
                gameId: "",
                pack: p,
                updatedAt: Date.now(),
              });
              localStorage.removeItem(LEGACY_STORAGE_KEY);
              list = await listProfiles();
              if (!cancelled) setStatus("Черновик из localStorage перенесён в профиль");
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      if (list.length === 0) {
        await putProfile({
          slug: "default",
          displayName: "Персонаж по умолчанию",
          role: "npc",
          gameId: "",
          pack: emptyPack(),
          updatedAt: Date.now(),
        });
        list = await listProfiles();
      }
      if (cancelled) return;
      setProfiles(list);
      const last = localStorage.getItem(LAST_SLUG_KEY);
      const rec =
        list.find((x) => x.slug === last) ?? list[0];
      if (rec) applyProfileRecord(rec);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyProfileRecord]);

  useEffect(() => {
    if (!cropFile) {
      setCropUrl(null);
      return;
    }
    const u = URL.createObjectURL(cropFile);
    setCropUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [cropFile]);

  const exportCurrentFragment = useCallback(() => {
    const pack = packFromState(sheets, anims, units, mobs);
    downloadJson(
      activeSlug ? `character-pack__${activeSlug}.json` : "character-pack-fragment.json",
      pack
    );
    setStatus("Скачан фрагмент текущего профиля");
  }, [sheets, anims, units, mobs, activeSlug]);

  const exportMergedAllProfiles = useCallback(async () => {
    await flushCurrentToDb();
    const list = await listProfiles();
    const merged = mergeAllProfilesToPack(list);
    downloadJson("character-pack.json", merged);
    setStatus(
      `Собрано ${list.length} профилей → character-pack.json (положите в public/assets/world/)`
    );
  }, [flushCurrentToDb]);

  const exportStripPng = useCallback(() => {
    if (!cropUrl) {
      setStatus("Выберите файл для нарезки");
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const n = cropCols * cropRows;
      canvas.width = n * cellW;
      canvas.height = cellH;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      let fi = 0;
      for (let r = 0; r < cropRows; r++) {
        for (let c = 0; c < cropCols; c++) {
          ctx.drawImage(
            img,
            cropSx + c * cellW,
            cropSy + r * cellH,
            cellW,
            cellH,
            fi * cellW,
            0,
            cellW,
            cellH
          );
          fi++;
        }
      }
      canvas.toBlob((blob) => {
        if (!blob) return;
        downloadBlob(stripFilename.replace(/[^\w.\-]+/g, "_") || "strip.png", blob);
        setStatus(
          `Скачан ${stripFilename} — положите в public/assets/world/units/custom/ и добавьте лист с тем же url`
        );
      }, "image/png");
    };
    img.onerror = () => setStatus("Ошибка загрузки картинки для нарезки");
    img.src = cropUrl;
  }, [cropUrl, cropSx, cropSy, cellW, cellH, cropCols, cropRows, stripFilename]);

  const addSheetSpritesheet = () => {
    const key = `custom_sheet_${sheets.length + 1}`;
    const entry: AssetManifestLoadSpritesheet = {
      key,
      type: "spritesheet",
      url: `/assets/world/units/custom/${key}.png`,
      frameWidth: 32,
      frameHeight: 32,
    };
    setSheets((s) => [...s, { id: newId(), entry }]);
  };

  const addAnim = () => {
    const k = `a-custom-${anims.length + 1}`;
    setAnims((a) => [
      ...a,
      {
        key: k,
        textureKey: sheetKeys[0] ?? manifestKeys[0] ?? "grass",
        start: 0,
        end: 3,
        frameRate: 8,
        repeat: -1,
      },
    ]);
  };

  const resolvePreviewUrl = (row: SheetRow): string => {
    if (row.previewUrl) return row.previewUrl;
    return row.entry.url.startsWith("/") ? row.entry.url : `/${row.entry.url}`;
  };

  const addSheetFromImageFile = useCallback(
    (file: File) => {
      const stem = fileStem(file.name);
      const prefix = activeSlug ? `${sanitizeSlug(activeSlug).slice(0, 24)}_` : "custom_";
      setSheets((prev) => {
        const taken = new Set(prev.map((s) => s.entry.key));
        const baseKey = `${prefix}${stem || "sheet"}`;
        const key = pickUniqueSlug(baseKey.replace(/-/g, "_"), taken);
        const url = `/assets/world/units/custom/${key}.png`;
        const previewUrl = URL.createObjectURL(file);
        const lastSp = [...prev].reverse().find((s) => isSpritesheet(s.entry));
        const fw =
          lastSp && isSpritesheet(lastSp.entry) ? lastSp.entry.frameWidth : 32;
        const fh =
          lastSp && isSpritesheet(lastSp.entry) ? lastSp.entry.frameHeight : 32;
        const entry: AssetManifestLoadSpritesheet = {
          key,
          type: "spritesheet",
          url,
          frameWidth: fw,
          frameHeight: fh,
        };
        return [...prev, { id: newId(), entry, previewUrl }];
      });
      setStatus(`Добавлен лист из «${file.name}»`);
    },
    [activeSlug]
  );

  const handleDropSheets = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDndHoverSheets(false);
    const files = extractImageFiles(e.dataTransfer);
    if (!files.length) {
      setStatus("Перетащите изображение (PNG, WebP, JPEG)");
      return;
    }
    for (const f of files) addSheetFromImageFile(f);
  };

  const handleDropCrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDndHoverCrop(false);
    const files = extractImageFiles(e.dataTransfer);
    const f = files[0];
    if (!f) {
      setStatus("Для нарезки перетащите одно изображение");
      return;
    }
    setCropFile(f);
    setStripFilename(
      f.name.replace(/\s+/g, "_").replace(/[^\w.\-]+/g, "_") || "source.png"
    );
    setStatus(`Нарезка: загружен ${f.name}`);
  };

  const switchToProfile = async (slug: string) => {
    if (slug === activeSlug) return;
    await flushCurrentToDb();
    const rec = await getProfile(slug);
    if (rec) applyProfileRecord(rec);
    await refreshProfiles();
  };

  const createNewProfile = async () => {
    await flushCurrentToDb();
    const list = await listProfiles();
    const taken = new Set(list.map((p) => p.slug));
    const slug = pickUniqueSlug("new_character", taken);
    await putProfile({
      slug,
      displayName: "Новый персонаж",
      role: "npc",
      gameId: "",
      pack: emptyPack(),
      updatedAt: Date.now(),
    });
    const next = await refreshProfiles();
    const rec = next.find((x) => x.slug === slug);
    if (rec) applyProfileRecord(rec);
    setStatus(`Создан профиль «${slug}»`);
  };

  const deleteActiveProfile = async () => {
    if (!activeSlug) return;
    if (profiles.length <= 1) {
      setStatus("Нельзя удалить последний профиль");
      return;
    }
    if (!window.confirm(`Удалить профиль «${activeSlug}»?`)) return;
    await deleteProfile(activeSlug);
    const list = await refreshProfiles();
    if (list[0]) applyProfileRecord(list[0]);
    setStatus("Профиль удалён");
  };

  const syncRoleBindingRow = () => {
    const gid = gameId.trim();
    if (!gid) {
      setStatus("Укажите gameId (id NPC или mobVisualId)");
      return;
    }
    if (role === "npc") {
      setUnits((u) => {
        if (u.some((x) => x.id === gid)) return u;
        return [...u, { id: gid, idleAnim: "", runAnim: "" }];
      });
      setStatus(`Строка units для «${gid}»`);
    } else {
      setMobs((m) => {
        if (m.some((x) => x.id === gid)) return m;
        const idleKey =
          sheetKeys.find((k) => /idle/i.test(k)) ?? sheetKeys[0] ?? "";
        return [
          ...m,
          { id: gid, idleAnim: "", runAnim: "", textureKeyIdle: idleKey },
        ];
      });
      setStatus(`Строка mobs для «${gid}» (проверьте textureKeyIdle)`);
    }
  };

  const saveProfileToDb = async () => {
    if (!activeSlug) return;
    await flushCurrentToDb();
    setStatus(`Сохранено в IndexedDB: «${activeSlug}»`);
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16 text-zinc-100">
      <header className="space-y-1 border-b border-zinc-800 pb-4">
        <h1 className="text-lg font-semibold tracking-tight">
          Редактор персонажей (character-pack)
        </h1>
        <p className="text-sm text-zinc-400">
          Соберите JSON и PNG, затем положите{" "}
          <code className="text-emerald-400/90">public/assets/world/character-pack.json</code> и
          файлы в{" "}
          <code className="text-emerald-400/90">public/assets/world/units/custom/</code>. Пак
          подмешивается при загрузке игры и редактора карт.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href="/dev/map-editor"
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            Редактор карт
          </a>
          <span className="text-zinc-600">·</span>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- редактор без next/link */}
          <a href="/" className="text-sm text-emerald-400 hover:text-emerald-300">
            На главную
          </a>
        </div>
      </header>

      {status ? (
        <p className="rounded border border-zinc-700 bg-zinc-900/60 px-2 py-1 text-xs text-zinc-300">
          {status}
        </p>
      ) : null}

      <section className="grid gap-4 rounded border border-zinc-800 bg-zinc-900/40 p-3 lg:grid-cols-[minmax(0,220px)_1fr]">
        <div className="flex min-h-0 flex-col gap-2">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            Профили (IndexedDB)
          </h2>
          <ul className="max-h-60 min-h-0 flex-1 space-y-0.5 overflow-y-auto rounded border border-zinc-800 bg-zinc-950/50 p-1">
            {profiles.map((p) => (
              <li key={p.slug}>
                <button
                  type="button"
                  className={`w-full rounded px-2 py-1.5 text-left text-xs transition-colors ${
                    p.slug === activeSlug
                      ? "bg-emerald-900/50 text-emerald-50"
                      : "text-zinc-300 hover:bg-zinc-800"
                  }`}
                  onClick={() => void switchToProfile(p.slug)}
                >
                  <div className="truncate font-medium">{p.displayName}</div>
                  <div className="truncate font-mono text-[10px] text-zinc-500">
                    {p.slug} · {p.role}
                    {p.gameId ? ` · ${p.gameId}` : ""}
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800"
              onClick={() => void createNewProfile()}
            >
              + Новый профиль
            </button>
            <button
              type="button"
              className="rounded border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-900/40"
              onClick={() => void saveProfileToDb()}
            >
              Сохранить профиль
            </button>
            <button
              type="button"
              className="rounded border border-red-900/60 px-2 py-1 text-xs text-red-300/90 hover:bg-red-950/30"
              onClick={() => void deleteActiveProfile()}
            >
              Удалить профиль
            </button>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <label className="text-[11px] text-zinc-500">
            Отображаемое имя
            <input
              className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-zinc-500">
              Роль в игре
              <select
                className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value === "mob" ? "mob" : "npc")
                }
              >
                <option value="npc">NPC (manifest.units)</option>
                <option value="mob">Моб (manifest.mobs / mobVisualId)</option>
              </select>
            </label>
            <label className="text-[11px] text-zinc-500">
              gameId
              <input
                className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                placeholder={role === "npc" ? "id NPC (как в npcs/)" : "mobVisualId"}
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="self-start rounded border border-zinc-600 px-2 py-1 text-[11px] hover:bg-zinc-800"
            onClick={syncRoleBindingRow}
          >
            Вставить строку привязки под gameId
          </button>
          <p className="text-[10px] leading-snug text-zinc-500">
            Профиль хранит фрагмент пака. Кнопка «Собрать все профили» объединяет их в один character-pack для игры.
          </p>
        </div>
      </section>

      <section className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <h2 className="text-sm font-medium text-zinc-200">Файл</h2>
        <div className="flex flex-wrap gap-2">
          <label className="cursor-pointer rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800">
            Импорт JSON…
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                void f.text().then((t) => {
                  try {
                    loadDraft(JSON.parse(t) as CharacterPackJson);
                    setStatus(`Импорт в редактор: ${f.name} (сохраните профиль)`);
                  } catch {
                    setStatus("Неверный JSON");
                  }
                });
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800"
            onClick={() => {
              loadDraft(emptyEditorPack());
              setStatus("Редактор очищен (сохраните профиль, чтобы зафиксировать)");
            }}
          >
            Очистить редактор
          </button>
          <button
            type="button"
            className="rounded border border-emerald-800 bg-emerald-950/40 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/40"
            onClick={exportCurrentFragment}
          >
            Скачать фрагмент (текущий профиль)
          </button>
          <button
            type="button"
            className="rounded border border-amber-800 bg-amber-950/40 px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/40"
            onClick={() => void exportMergedAllProfiles()}
          >
            Собрать все профили → character-pack.json
          </button>
        </div>
      </section>

      <section className="space-y-3 rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-200">Листы (load)</h2>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-0.5 text-xs hover:bg-zinc-800"
            onClick={addSheetSpritesheet}
          >
            + Spritesheet
          </button>
        </div>
        <p className="text-[10px] text-zinc-500">
          Перетащите PNG/WebP сюда — добавится лист с превью из файла.
        </p>
        <div
          className={`rounded-lg border-2 border-dashed p-1 transition-colors ${
            dndHoverSheets
              ? "border-emerald-500/70 bg-emerald-950/20"
              : "border-zinc-700/50"
          }`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDndHoverSheets(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDndHoverSheets(true);
          }}
          onDragLeave={() => setDndHoverSheets(false)}
          onDrop={handleDropSheets}
        >
          <ul className="space-y-3">
          {sheets.map((row) => (
            <li
              key={row.id}
              className="space-y-2 rounded border border-zinc-700/80 bg-zinc-950/50 p-2"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] text-zinc-500">
                  key
                  <input
                    className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                    value={row.entry.key}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSheets((list) =>
                        list.map((x) =>
                          x.id === row.id
                            ? {
                                ...x,
                                entry:
                                  x.entry.type === "image"
                                    ? { ...x.entry, key: v }
                                    : { ...x.entry, key: v },
                              }
                            : x
                        )
                      );
                    }}
                  />
                </label>
                <label className="text-[11px] text-zinc-500">
                  url (в public)
                  <input
                    className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                    value={row.entry.url}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSheets((list) =>
                        list.map((x) =>
                          x.id === row.id ? { ...x, entry: { ...x.entry, url: v } } : x
                        )
                      );
                    }}
                  />
                </label>
                {isSpritesheet(row.entry) ? (
                  <>
                    <label className="text-[11px] text-zinc-500">
                      frameWidth
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                        value={row.entry.frameWidth}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setSheets((list) =>
                            list.map((x) =>
                              x.id === row.id && isSpritesheet(x.entry)
                                ? { ...x, entry: { ...x.entry, frameWidth: n } }
                                : x
                            )
                          );
                        }}
                      />
                    </label>
                    <label className="text-[11px] text-zinc-500">
                      frameHeight
                      <input
                        type="number"
                        className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                        value={row.entry.frameHeight}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setSheets((list) =>
                            list.map((x) =>
                              x.id === row.id && isSpritesheet(x.entry)
                                ? { ...x, entry: { ...x.entry, frameHeight: n } }
                                : x
                            )
                          );
                        }}
                      />
                    </label>
                  </>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer text-[11px] text-zinc-400 hover:text-zinc-200">
                  Локальный PNG (превью)
                  <input
                    type="file"
                    accept="image/png,image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const url = URL.createObjectURL(f);
                      setSheets((list) =>
                        list.map((x) => {
                          if (x.id !== row.id) return x;
                          if (x.previewUrl) URL.revokeObjectURL(x.previewUrl);
                          return { ...x, previewUrl: url };
                        })
                      );
                      e.target.value = "";
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="text-[11px] text-red-400/90 hover:underline"
                  onClick={() => {
                    setSheets((list) => {
                      const x = list.find((s) => s.id === row.id);
                      if (x?.previewUrl) URL.revokeObjectURL(x.previewUrl);
                      return list.filter((s) => s.id !== row.id);
                    });
                  }}
                >
                  Удалить лист
                </button>
              </div>
            </li>
          ))}
        </ul>
        </div>
      </section>

      <section className="space-y-3 rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-200">Анимации</h2>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-0.5 text-xs hover:bg-zinc-800"
            onClick={addAnim}
          >
            + Клип
          </button>
        </div>
        <ul className="space-y-4">
          {anims.map((a, i) => {
            const sheet = sheets.find((s) => s.entry.key === a.textureKey);
            const prevUrl =
              sheet && isSpritesheet(sheet.entry)
                ? resolvePreviewUrl(sheet)
                : "";
            const fw = sheet && isSpritesheet(sheet.entry) ? sheet.entry.frameWidth : 32;
            const fh = sheet && isSpritesheet(sheet.entry) ? sheet.entry.frameHeight : 32;
            return (
              <li
                key={`anim-row-${i}`}
                className="space-y-2 rounded border border-zinc-700/80 bg-zinc-950/50 p-2"
              >
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="text-[11px] text-zinc-500">
                    key
                    <input
                      className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                      value={a.key}
                      onChange={(e) => {
                        const v = e.target.value;
                        setAnims((list) =>
                          list.map((x, j) => (j === i ? { ...x, key: v } : x))
                        );
                      }}
                    />
                  </label>
                  <label className="text-[11px] text-zinc-500 sm:col-span-2">
                    textureKey
                    <select
                      className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                      value={
                        textureKeyOptions.includes(a.textureKey)
                          ? a.textureKey
                          : "__custom__"
                      }
                      onChange={(e) => {
                        const v = e.target.value;
                        setAnims((list) =>
                          list.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  textureKey: v === "__custom__" ? "" : v,
                                }
                              : x
                          )
                        );
                      }}
                    >
                      {textureKeyOptions.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                      <option value="__custom__">Другой ключ…</option>
                    </select>
                    {!textureKeyOptions.includes(a.textureKey) || a.textureKey === "" ? (
                      <input
                        className="mt-1 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                        placeholder="textureKey"
                        value={a.textureKey}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAnims((list) =>
                            list.map((x, j) => (j === i ? { ...x, textureKey: v } : x))
                          );
                        }}
                      />
                    ) : null}
                  </label>
                  <label className="text-[11px] text-zinc-500">
                    start
                    <input
                      type="number"
                      className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                      value={a.start}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setAnims((list) =>
                          list.map((x, j) => (j === i ? { ...x, start: n } : x))
                        );
                      }}
                    />
                  </label>
                  <label className="text-[11px] text-zinc-500">
                    end
                    <input
                      type="number"
                      className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                      value={a.end}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setAnims((list) =>
                          list.map((x, j) => (j === i ? { ...x, end: n } : x))
                        );
                      }}
                    />
                  </label>
                  <label className="text-[11px] text-zinc-500">
                    frameRate / repeat
                    <div className="mt-0.5 flex gap-1">
                      <input
                        type="number"
                        className="w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                        value={a.frameRate}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setAnims((list) =>
                            list.map((x, j) => (j === i ? { ...x, frameRate: n } : x))
                          );
                        }}
                      />
                      <input
                        type="number"
                        className="w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                        value={a.repeat}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          setAnims((list) =>
                            list.map((x, j) => (j === i ? { ...x, repeat: n } : x))
                          );
                        }}
                      />
                    </div>
                  </label>
                </div>
                {prevUrl && sheet && isSpritesheet(sheet.entry) ? (
                  <>
                    <FilmstripRangePicker
                      imageUrl={prevUrl}
                      frameWidth={fw}
                      frameHeight={fh}
                      start={a.start}
                      end={a.end}
                      onChangeStart={(n) =>
                        setAnims((list) =>
                          list.map((x, j) => (j === i ? { ...x, start: n } : x))
                        )
                      }
                      onChangeEnd={(n) =>
                        setAnims((list) =>
                          list.map((x, j) => (j === i ? { ...x, end: n } : x))
                        )
                      }
                    />
                    <AnimationPreview
                      imageUrl={prevUrl}
                      frameWidth={fw}
                      frameHeight={fh}
                      start={a.start}
                      end={a.end}
                      frameRate={a.frameRate}
                    />
                  </>
                ) : null}
                <button
                  type="button"
                  className="text-[11px] text-red-400/90 hover:underline"
                  onClick={() => setAnims((list) => list.filter((_, j) => j !== i))}
                >
                  Удалить клип
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="space-y-3 rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <h2 className="text-sm font-medium text-zinc-200">Нарезка в горизонтальную полосу</h2>
        <p className="text-[11px] text-zinc-500">
          Укажите левый верх сетки в исходнике (px), размер ячейки и число колонок/строк внутри
          сетки. Результат — один ряд кадров слева направо. Можно перетащить исходник сюда.
        </p>
        <div
          className={`space-y-3 rounded-lg border-2 border-dashed p-2 transition-colors ${
            dndHoverCrop
              ? "border-amber-500/70 bg-amber-950/15"
              : "border-transparent"
          }`}
          onDragEnter={(e) => {
            e.preventDefault();
            setDndHoverCrop(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDndHoverCrop(true);
          }}
          onDragLeave={() => setDndHoverCrop(false)}
          onDrop={handleDropCrop}
        >
          <input
            type="file"
            accept="image/png,image/*"
            onChange={(e) => setCropFile(e.target.files?.[0] ?? null)}
          />
        <div className="grid gap-2 sm:grid-cols-4">
          <label className="text-[11px] text-zinc-500">
            sx
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
              value={cropSx}
              onChange={(e) => setCropSx(Number(e.target.value))}
            />
          </label>
          <label className="text-[11px] text-zinc-500">
            sy
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
              value={cropSy}
              onChange={(e) => setCropSy(Number(e.target.value))}
            />
          </label>
          <label className="text-[11px] text-zinc-500">
            cellW
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
              value={cellW}
              onChange={(e) => setCellW(Number(e.target.value))}
            />
          </label>
          <label className="text-[11px] text-zinc-500">
            cellH
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
              value={cellH}
              onChange={(e) => setCellH(Number(e.target.value))}
            />
          </label>
          <label className="text-[11px] text-zinc-500">
            cols
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
              value={cropCols}
              onChange={(e) => setCropCols(Math.max(1, Number(e.target.value)))}
            />
          </label>
          <label className="text-[11px] text-zinc-500">
            rows
            <input
              type="number"
              className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
              value={cropRows}
              onChange={(e) => setCropRows(Math.max(1, Number(e.target.value)))}
            />
          </label>
          <label className="text-[11px] text-zinc-500 sm:col-span-2">
            имя файла
            <input
              className="mt-0.5 w-full rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
              value={stripFilename}
              onChange={(e) => setStripFilename(e.target.value)}
            />
          </label>
        </div>
        <button
          type="button"
          className="rounded border border-zinc-600 px-2 py-1 text-xs hover:bg-zinc-800"
          onClick={exportStripPng}
        >
          Скачать PNG-полоску
        </button>
        </div>
      </section>

      <section className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-200">NPC (units)</h2>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-0.5 text-xs hover:bg-zinc-800"
            onClick={() =>
              setUnits((u) => [...u, { id: "", idleAnim: "", runAnim: "" }])
            }
          >
            + NPC
          </button>
        </div>
        <ul className="space-y-2">
          {units.map((u, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-4">
              <input
                placeholder="id (как в npcs/)"
                className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                value={u.id}
                onChange={(e) => {
                  const v = e.target.value;
                  setUnits((list) => list.map((x, j) => (j === i ? { ...x, id: v } : x)));
                }}
              />
              <input
                placeholder="idleAnim"
                className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                value={u.idleAnim}
                onChange={(e) => {
                  const v = e.target.value;
                  setUnits((list) => list.map((x, j) => (j === i ? { ...x, idleAnim: v } : x)));
                }}
              />
              <input
                placeholder="runAnim"
                className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                value={u.runAnim}
                onChange={(e) => {
                  const v = e.target.value;
                  setUnits((list) => list.map((x, j) => (j === i ? { ...x, runAnim: v } : x)));
                }}
              />
              <button
                type="button"
                className="text-xs text-red-400/90 hover:underline"
                onClick={() => setUnits((list) => list.filter((_, j) => j !== i))}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2 rounded border border-zinc-800 bg-zinc-900/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-200">Мобы (mobs)</h2>
          <button
            type="button"
            className="rounded border border-zinc-600 px-2 py-0.5 text-xs hover:bg-zinc-800"
            onClick={() =>
              setMobs((m) => [
                ...m,
                { id: "", idleAnim: "", runAnim: "", textureKeyIdle: "" },
              ])
            }
          >
            + Mob
          </button>
        </div>
        <ul className="space-y-2">
          {mobs.map((m, i) => (
            <li key={i} className="grid gap-2 sm:grid-cols-5">
              <input
                placeholder="id"
                className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 text-xs"
                value={m.id}
                onChange={(e) => {
                  const v = e.target.value;
                  setMobs((list) => list.map((x, j) => (j === i ? { ...x, id: v } : x)));
                }}
              />
              <input
                placeholder="idleAnim"
                className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                value={m.idleAnim}
                onChange={(e) => {
                  const v = e.target.value;
                  setMobs((list) => list.map((x, j) => (j === i ? { ...x, idleAnim: v } : x)));
                }}
              />
              <input
                placeholder="runAnim"
                className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                value={m.runAnim}
                onChange={(e) => {
                  const v = e.target.value;
                  setMobs((list) => list.map((x, j) => (j === i ? { ...x, runAnim: v } : x)));
                }}
              />
              <input
                placeholder="textureKeyIdle"
                className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 font-mono text-xs"
                value={m.textureKeyIdle}
                onChange={(e) => {
                  const v = e.target.value;
                  setMobs((list) =>
                    list.map((x, j) => (j === i ? { ...x, textureKeyIdle: v } : x))
                  );
                }}
              />
              <button
                type="button"
                className="text-xs text-red-400/90 hover:underline"
                onClick={() => setMobs((list) => list.filter((_, j) => j !== i))}
              >
                Удалить
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
