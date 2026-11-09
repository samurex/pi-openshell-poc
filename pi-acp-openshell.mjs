#!/usr/bin/env node
// Host-side ACP proxy: Zed <-stdio-> this <-stdio-> `openshell sandbox exec ... pi-acp`.
//
// - On session/new|load|resume it uploads the project (once) into the sandbox
//   at $SANDBOX_BASE/<host path>, because host paths aren't writable there.
// - It rewrites the path prefix in every message: host -> sandbox going in,
//   sandbox -> host coming out, so Zed's file links still point at real files.
//
// stdout is reserved for ACP. Logs go to stderr and $LOG_FILE.

import { spawn, execFile } from "node:child_process";
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

const SANDBOX = process.env.OPENSHELL_SANDBOX ?? "pi";
const SANDBOX_BASE = (process.env.SANDBOX_BASE ?? "/tmp/w").replace(/\/$/, "");
const FORCE_UPLOAD = process.env.FORCE_UPLOAD === "1";
const OPENSHELL = process.env.OPENSHELL_BIN ?? "openshell";
const LOG_FILE = process.env.LOG_FILE ?? join(tmpdir(), "pi-acp-openshell.log");

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  process.stderr.write(line);
  try { appendFileSync(LOG_FILE, line); } catch {}
}

function run(args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const p = execFile(OPENSHELL, args, { maxBuffer: 16 << 20 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${OPENSHELL} ${args.join(" ")} failed: ${stderr || err.message}`));
      else resolve(stdout);
    });
    if (input !== undefined) p.stdin.end(input); else p.stdin.end();
  });
}

const exec = (...cmd) => run(["sandbox", "exec", "-n", SANDBOX, "--no-tty", "--", ...cmd]);

// host root -> sandbox root
const roots = new Map();
const toSandboxPath = (hostPath) => SANDBOX_BASE + hostPath;

async function ensureProject(hostRoot) {
  if (roots.has(hostRoot)) return;
  const sbRoot = toSandboxPath(hostRoot);
  let exists = false;
  try { await exec("test", "-d", sbRoot); exists = true; } catch {}
  if (!exists || FORCE_UPLOAD) {
    log(`uploading ${hostRoot} -> ${SANDBOX}:${sbRoot}`);
    // `sandbox upload` places the directory *inside* DEST, so target the parent.
    await exec("mkdir", "-p", dirname(sbRoot));
    await run(["sandbox", "upload", SANDBOX, hostRoot, dirname(sbRoot)]);
    log("upload done");
  } else {
    log(`reusing existing ${SANDBOX}:${sbRoot} (FORCE_UPLOAD=1 to overwrite)`);
  }
  roots.set(hostRoot, sbRoot);
}

function rewrite(value, toSandbox) {
  if (typeof value === "string") {
    let s = value;
    for (const [host, sb] of roots) s = toSandbox ? s.split(host).join(sb) : s.split(sb).join(host);
    return s;
  }
  if (Array.isArray(value)) return value.map((v) => rewrite(v, toSandbox));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = rewrite(v, toSandbox);
    return out;
  }
  return value;
}

// --- agent process inside the sandbox ---
const agent = spawn(
  OPENSHELL,
  ["sandbox", "exec", "-n", SANDBOX, "--no-tty", "--no-login-shell", "--workdir", "/tmp",
   "--", "/usr/local/bin/pi-acp-start"],
  { stdio: ["pipe", "pipe", "pipe"] },
);
log(`started agent in sandbox "${SANDBOX}" (pid ${agent.pid})`);

agent.stderr.on("data", (d) => log("[agent]", d.toString().trimEnd()));
agent.on("exit", (code, sig) => { log(`agent exited code=${code} sig=${sig}`); process.exit(code ?? 1); });
agent.on("error", (e) => { log(`failed to start ${OPENSHELL}: ${e.message}`); process.exit(1); });

createInterface({ input: agent.stdout }).on("line", (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { log("[agent non-json stdout]", line); return; }
  process.stdout.write(JSON.stringify(rewrite(msg, false)) + "\n");
});

// --- client (Zed) -> agent, serialized so uploads finish before forwarding ---
const SESSION_METHODS = new Set(["session/new", "session/load", "session/resume"]);
let chain = Promise.resolve();

createInterface({ input: process.stdin }).on("line", (line) => {
  if (!line.trim()) return;
  chain = chain.then(async () => {
    let msg;
    try { msg = JSON.parse(line); } catch { log("[client non-json]", line); return; }
    if (SESSION_METHODS.has(msg.method) && msg.params?.cwd) {
      try {
        await ensureProject(msg.params.cwd);
      } catch (e) {
        log(e.message);
        process.stdout.write(JSON.stringify({
          jsonrpc: "2.0", id: msg.id,
          error: { code: -32603, message: `OpenShell upload failed: ${e.message}` },
        }) + "\n");
        return;
      }
    }
    agent.stdin.write(JSON.stringify(rewrite(msg, true)) + "\n");
  });
});
process.stdin.on("end", () => { log("client closed stdin"); agent.stdin.end(); });
