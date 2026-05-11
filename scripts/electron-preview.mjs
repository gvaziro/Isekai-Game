import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const electronCli = path.join(root, "node_modules", "electron", "cli.js");

const child = spawn(process.execPath, [electronCli, root], {
  cwd: root,
  env: {
    ...process.env,
    LAST_SUMMON_ELECTRON_PROD: "1",
    LAST_SUMMON_ELECTRON_START_PATH:
      process.env.LAST_SUMMON_ELECTRON_START_PATH ?? "/game",
  },
  stdio: "inherit",
  windowsHide: true,
});

const [code] = await once(child, "exit");
process.exit(typeof code === "number" ? code : 0);
