/**
 * Поднимает `next dev` на свободном порту (или использует готовый URL), ждёт готовности сцены и сохраняет screenshot canvas → preview/live.png.
 * Требует: npm i -D playwright && npx playwright install chromium
 *
 * Next.js 16 не позволяет второй `next dev` в том же каталоге — перед запуском закройте другой дев-сервер этого проекта,
 * либо задайте URL уже работающего приложения: NAGIBATOP_PREVIEW_URL=http://127.0.0.1:3000
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function pickPort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const p =
        typeof addr === "object" && addr !== null ? addr.port : null;
      srv.close((err) => {
        if (err) reject(err);
        else if (p) resolve(p);
        else reject(new Error("no port"));
      });
    });
    srv.on("error", reject);
  });
}

async function waitForGame(baseUrl, timeoutMs = 120000) {
  const url = `${baseUrl.replace(/\/$/, "")}/game?preview=1`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* сервер ещё не слушает */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timeout: ${url}`);
}

async function main() {
  const preset =
    process.env.NAGIBATOP_PREVIEW_URL?.trim() ||
    process.env.PREVIEW_BASE_URL?.trim();

  let baseUrl = preset ?? null;
  /** @type {import('child_process').ChildProcess | null} */
  let child = null;

  if (!baseUrl) {
    const port = await pickPort();
    baseUrl = `http://127.0.0.1:${port}`;
    const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

    child = spawn(
      process.execPath,
      [nextCli, "dev", "-p", String(port)],
      {
        cwd: root,
        env: { ...process.env, PORT: String(port) },
        stdio: "inherit",
        windowsHide: true,
      }
    );
  }

  let browser;
  try {
    await waitForGame(baseUrl);

    const { chromium } = await import("playwright");
    browser = await chromium.launch();
    const page = await browser.newPage({
      viewport: { width: 1360, height: 1040 },
    });

    await page.goto(`${baseUrl}/game?preview=1`, {
      waitUntil: "networkidle",
      timeout: 120000,
    });

    await page.waitForFunction(() => window.__NAGIBATOP_READY__ === true, null, {
      timeout: 120000,
    });

    const dir = path.join(root, "preview");
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, "live.png");
    await page.locator("canvas").first().screenshot({ path: out });
    console.log(`Wrote ${out}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (child?.pid) {
      try {
        if (process.platform === "win32") {
          spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } else {
          process.kill(child.pid, "SIGTERM");
        }
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
