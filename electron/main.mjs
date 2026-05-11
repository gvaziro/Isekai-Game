import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import fs from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROFILE_PERSIST_KEYS = new Set([
  "last-summon-save-v1",
  "last-summon-quest-v1",
  "last-summon-lore-journal-v1",
  "last-summon-npc-dialogue-progress-v1",
  "last-summon-slots-v1",
]);

const MAX_PROFILE_JSON_BYTES = 96 * 1024 * 1024;
const MAX_ENTRY_STRING_BYTES = 24 * 1024 * 1024;

function getProfilePath() {
  return path.join(app.getPath("userData"), "saves", "profile.json");
}

function validateProfileJson(text) {
  if (typeof text !== "string" || text.length > MAX_PROFILE_JSON_BYTES) {
    return { ok: false, error: "payload too large or not a string" };
  }
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    return { ok: false, error: "invalid json" };
  }
  if (!o || typeof o !== "object") {
    return { ok: false, error: "invalid root" };
  }
  if (o.formatVersion !== 1) {
    return { ok: false, error: "unsupported formatVersion" };
  }
  const ent = o.entries;
  if (!ent || typeof ent !== "object") {
    return { ok: false, error: "missing entries" };
  }
  for (const [k, v] of Object.entries(ent)) {
    if (!PROFILE_PERSIST_KEYS.has(k)) {
      return { ok: false, error: `disallowed key: ${k}` };
    }
    if (typeof v !== "string") {
      return { ok: false, error: `entries[${k}] must be string` };
    }
    if (Buffer.byteLength(v, "utf8") > MAX_ENTRY_STRING_BYTES) {
      return { ok: false, error: `entry too large: ${k}` };
    }
  }
  return { ok: true };
}

function registerProfileIpc() {
  ipcMain.removeHandler("last-summon:profile-read");
  ipcMain.removeHandler("last-summon:profile-write");

  ipcMain.handle("last-summon:profile-read", () => {
    const p = getProfilePath();
    try {
      if (!fs.existsSync(p)) {
        return { ok: true, data: null };
      }
      const data = fs.readFileSync(p, "utf8");
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });

  ipcMain.handle("last-summon:profile-write", (_evt, payload) => {
    const v = validateProfileJson(payload);
    if (!v.ok) {
      return { ok: false, error: v.error };
    }
    const dir = path.dirname(getProfilePath());
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      return { ok: false, error: String(e?.message ?? e) };
    }
    const p = getProfilePath();
    const tmp = `${p}.tmp`;
    try {
      fs.writeFileSync(tmp, payload, "utf8");
      fs.renameSync(tmp, p);
      return { ok: true };
    } catch (e) {
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch {
        /* ignore */
      }
      return { ok: false, error: String(e?.message ?? e) };
    }
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const devUrl =
  process.env.LAST_SUMMON_ELECTRON_DEV_URL || "http://localhost:3000/game";
const useProductionServer =
  app.isPackaged || process.env.LAST_SUMMON_ELECTRON_PROD === "1";

function resolveLoadUrl(base) {
  const raw = (process.env.LAST_SUMMON_ELECTRON_START_PATH ?? "").trim();
  if (!raw) return base;
  const pathname = raw.startsWith("/") ? raw : `/${raw}`;
  return new URL(pathname, base).href;
}

let mainWindow = null;
let nextServerProcess = null;
let appUrl = devUrl;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Unable to resolve a free localhost port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function waitForHttp(url, timeoutMs = 30000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });

      req.on("error", retry);
      req.setTimeout(1500, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(check, 350);
    };

    check();
  });
}

function getStandaloneRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "standalone");
  }
  return path.join(projectRoot, ".next", "standalone");
}

async function startProductionNextServer() {
  const standaloneRoot = getStandaloneRoot();
  const serverJs = path.join(standaloneRoot, "server.js");
  const port = await findFreePort();

  nextServerProcess = spawn(process.execPath, [serverJs], {
    cwd: standaloneRoot,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      HOSTNAME: host,
      PORT: String(port),
    },
    stdio: app.isPackaged ? "ignore" : "inherit",
    windowsHide: true,
  });

  nextServerProcess.once("exit", (code, signal) => {
    nextServerProcess = null;
    if (!app.isQuitting) {
      console.error(`[electron] Next server exited: code=${code} signal=${signal}`);
      app.quit();
    }
  });

  const url = `http://${host}:${port}/`;
  await waitForHttp(url);
  return url;
}

async function resolveAppUrl() {
  if (!useProductionServer) return devUrl;
  return startProductionNextServer();
}

function stopProductionNextServer() {
  if (!nextServerProcess) return;
  const child = nextServerProcess;
  nextServerProcess = null;
  child.kill();
}

function createMainWindow() {
  const primary = screen.getPrimaryDisplay();
  const { width, height, x, y } = primary.workArea;

  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: "#050505",
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.maximize();
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const target = new URL(url);
    const base = new URL(appUrl);
    if (target.origin !== base.origin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  void mainWindow.loadURL(resolveLoadUrl(appUrl));
}

app.whenReady().then(async () => {
  registerProfileIpc();
  appUrl = await resolveAppUrl();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  stopProductionNextServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
