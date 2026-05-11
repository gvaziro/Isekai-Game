import { spawn } from "node:child_process";
import http from "node:http";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const devUrl =
  process.env.LAST_SUMMON_ELECTRON_DEV_URL || "http://localhost:3000/game";
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const electronCli = path.join(root, "node_modules", "electron", "cli.js");

let nextProcess = null;
let electronProcess = null;
let shuttingDown = false;

function waitForHttp(url, timeoutMs = 60000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve(true);
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
      setTimeout(check, 500);
    };

    check();
  });
}

async function isServerRunning(url) {
  try {
    await waitForHttp(url, 1500);
    return true;
  } catch {
    return false;
  }
}

function spawnNextDev() {
  nextProcess = spawn(npmCmd, ["run", "dev"], {
    cwd: root,
    env: { ...process.env },
    stdio: "inherit",
    shell: process.platform === "win32",
    windowsHide: true,
  });

  nextProcess.once("exit", (code, signal) => {
    nextProcess = null;
    if (!shuttingDown) {
      console.error(`[electron:dev] next dev exited: code=${code} signal=${signal}`);
      electronProcess?.kill();
    }
  });
}

function spawnElectron() {
  electronProcess = spawn(process.execPath, [electronCli, root], {
    cwd: root,
    env: {
      ...process.env,
      LAST_SUMMON_ELECTRON_DEV: "1",
      LAST_SUMMON_ELECTRON_DEV_URL: devUrl,
    },
    stdio: "inherit",
    windowsHide: true,
  });

  return electronProcess;
}

function shutdown() {
  shuttingDown = true;
  electronProcess?.kill();
  nextProcess?.kill();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

if (!(await isServerRunning(devUrl))) {
  spawnNextDev();
}

await waitForHttp(devUrl);
const child = spawnElectron();
const [code] = await once(child, "exit");
shutdown();
process.exit(typeof code === "number" ? code : 0);
