import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Launcher: single entry page on a fixed port, next to products (5173), sales (5174) and finance (5175).
// `bun run dev` here also starts the three apps (each one's own `bun run dev`: page + API), after a
// `bun install` in any package folder with missing dependencies. They stop with the launcher.
// Opt out with LAUNCHER_START_APPS=0 (`bun run dev:solo`). An app whose page port already answers is
// left alone (already started elsewhere).

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const IS_WINDOWS = process.platform === "win32";

const APPS = [
  { name: "products", folder: "products_manager", port: 5173, api: "backend", color: 34 },
  { name: "sales", folder: "sales_manager", port: 5174, api: "server", color: 31 },
  { name: "finance", folder: "finance_manager", port: 5175, api: "server", color: 32 },
];
const LABEL_WIDTH = Math.max(...APPS.map((app) => app.name.length));

// Survives Vite config reloads (same process): never start the apps twice.
globalThis.__launcherApps ??= { started: false, children: new Set() };
const shared = globalThis.__launcherApps;

function prefix(app) {
  return `\x1b[${app.color}m[${app.name.padEnd(LABEL_WIDTH)}]\x1b[0m `;
}

function log(app, message) {
  process.stdout.write(`${prefix(app)}${message}\n`);
}

function pipeLines(app, stream) {
  let rest = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    const lines = (rest + chunk).split(/\r?\n/);
    rest = lines.pop();
    for (const line of lines) process.stdout.write(`${prefix(app)}${line}\n`);
  });
  stream.on("end", () => {
    if (rest) process.stdout.write(`${prefix(app)}${rest}\n`);
  });
}

/** Run a command for an app; its output is prefixed with the app name. Resolves with the exit code. */
function run(app, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn("bun", args, {
      cwd,
      env: { ...process.env, FORCE_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      // Own process group on Linux / macOS so the whole tree (concurrently, vite, node) can be stopped.
      detached: !IS_WINDOWS,
      windowsHide: true,
    });
    shared.children.add(child);
    pipeLines(app, child.stdout);
    pipeLines(app, child.stderr);
    child.once("error", (error) => {
      shared.children.delete(child);
      log(app, `cannot run "bun ${args.join(" ")}": ${error.message}`);
      resolve(1);
    });
    child.once("exit", (code, signal) => {
      shared.children.delete(child);
      resolve(signal ? 1 : (code ?? 1));
    });
  });
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (IS_WINDOWS) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}

function stopAll() {
  for (const child of shared.children) stopChild(child);
  shared.children.clear();
}

function canConnect(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(800);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function isPortBusy(port) {
  return (await canConnect(port, "127.0.0.1")) || (await canConnect(port, "::1"));
}

/** True when a package folder has a dependency that is not in node_modules (missing, empty or partial install). */
function needsInstall(dir) {
  const manifestPath = path.join(dir, "package.json");
  if (!existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    return names.some((name) => !existsSync(path.join(dir, "node_modules", name, "package.json")));
  } catch {
    return !existsSync(path.join(dir, "node_modules"));
  }
}

async function startApp(app) {
  const appDir = path.join(ROOT, app.folder);
  if (!existsSync(path.join(appDir, "package.json"))) {
    log(app, `skipped: ${app.folder}/ not found`);
    return;
  }
  if (await isPortBusy(app.port)) {
    log(app, `already running on :${app.port}, not started again`);
    return;
  }

  for (const dir of [appDir, path.join(appDir, app.api)]) {
    if (!needsInstall(dir)) continue;
    log(app, `installing dependencies in ${path.relative(ROOT, dir)}/ ...`);
    const code = await run(app, ["install"], dir);
    if (code !== 0) {
      log(app, `bun install failed (exit ${code}), app not started`);
      return;
    }
  }

  log(app, `starting (bun run dev in ${app.folder}/, page on :${app.port})`);
  const code = await run(app, ["run", "dev"], appDir);
  log(app, `stopped (exit ${code})`);
}

function startApps() {
  return {
    name: "launcher-start-apps",
    apply: "serve",
    configureServer(server) {
      if (process.env.LAUNCHER_START_APPS === "0" || shared.started) return;
      shared.started = true;

      process.once("exit", stopAll);
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        process.once(signal, () => {
          stopAll();
          process.exit(signal === "SIGINT" ? 130 : 143);
        });
      }

      const launch = () => {
        for (const app of APPS) {
          startApp(app).catch((error) => log(app, `failed to start: ${error.message}`));
        }
      };
      if (server.httpServer?.listening) launch();
      else server.httpServer?.once("listening", launch);
    },
  };
}

export default defineConfig({
  plugins: [startApps()],
  server: {
    port: 5170,
    strictPort: true,
    allowedHosts: true,
  },
  preview: {
    port: 5170,
    strictPort: true,
  },
});
