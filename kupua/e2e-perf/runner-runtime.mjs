import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { lstatSync, readFileSync, readlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export async function hashGitDiff(root, status) {
  const hash = createHash("sha256").update(status);
  await new Promise((resolveDiff, reject) => {
    const child = spawn("git", ["diff", "--binary", "HEAD", "--", "."], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", chunk => hash.update(chunk));
    child.stderr.resume();
    child.once("error", reject);
    child.once("close", (code, signal) => code === 0 ? resolveDiff()
      : reject(new Error(`Git diff fingerprint failed (${signal ?? code})`)));
  });
  return hash.digest("hex").slice(0, 16);
}

export function sourceFingerprint(root, exclusions = [], { activity = false } = {}) {
  const paths = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ".", ...exclusions],
    { cwd: root, maxBuffer: 20 * 1024 * 1024 }).toString().split("\0").filter(Boolean);
  const hash = createHash("sha256");
  for (const path of [...new Set(paths)].sort()) {
    hash.update(path).update("\0");
    const file = resolve(root, path);
    try {
      const info = lstatSync(file, { bigint: activity });
      hash.update(String(info.mode)).update("\0");
      if (activity) hash.update([info.size, info.mtimeNs, info.ctimeNs, info.ino].join(":"));
      else hash.update(info.isSymbolicLink() ? readlinkSync(file) : readFileSync(file));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      hash.update("deleted");
    }
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function assertSourceUnchanged(before, after) {
  if (!before || before !== after) throw new Error("Application or harness source changed during the campaign; captures are invalid and history was not published.");
}

export async function createPageIntegrityGuard(page) {
  const session = await page.context().newCDPSession(page);
  let expectedNavigation = 0;
  let reason = null;
  const originals = new Map();
  for (const method of ["goto", "reload", "goBack", "goForward"]) {
    if (typeof page[method] !== "function") continue;
    const original = page[method];
    originals.set(method, original);
    page[method] = async (...args) => {
      expectedNavigation++;
      try { return await original.apply(page, args); }
      finally { expectedNavigation--; }
    };
  }
  const onNavigation = event => {
    if (!event.frame.parentId && expectedNavigation === 0) reason ??= "unexpected-reload";
  };
  const onSocket = event => {
    let payload;
    try { payload = JSON.parse(event.response.payloadData); } catch { return; }
    if (["update", "full-reload", "error"].includes(payload.type)) reason ??= "source-changed";
  };
  session.on("Page.frameNavigated", onNavigation);
  session.on("Network.webSocketFrameReceived", onSocket);
  await session.send("Page.enable");
  await session.send("Network.enable");
  return {
    get reason() { return reason; },
    assertValid() { if (reason) throw new Error(`Performance capture invalid: ${reason}`); },
    async dispose() {
      for (const [method, original] of originals) page[method] = original;
      session.off("Page.frameNavigated", onNavigation);
      session.off("Network.webSocketFrameReceived", onSocket);
      await session.detach();
    },
  };
}

export function acquireCampaignLock(file) {
  const token = randomUUID();
  try {
    writeFileSync(file, JSON.stringify({ pid: process.pid, token }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner;
    try { owner = JSON.parse(readFileSync(file, "utf8")); } catch {}
    let abandoned = false;
    if (Number.isInteger(owner?.pid) && owner.pid > 0) {
      try { process.kill(owner.pid, 0); } catch (probeError) { abandoned = probeError.code === "ESRCH"; }
    }
    throw new Error(abandoned
      ? `Campaign lock appears abandoned (PID ${owner.pid}); verify no campaign or child is running, then remove ${file} and rerun.`
      : `Another campaign already owns ${file}${owner?.pid ? ` (PID ${owner.pid})` : ""}. Stop it or wait for completion; do not remove a live lock.`);
  }
  let released = false;
  return () => {
    if (released) return;
    if (JSON.parse(readFileSync(file, "utf8")).token !== token) throw new Error("Campaign lock ownership changed");
    unlinkSync(file);
    released = true;
  };
}

export async function probeEsRtt(baseUrl, { fetchRequest = fetch, timeoutMs = 1000, now = () => performance.now() } = {}) {
  const timings = [];
  const failures = {};
  for (let attempt = 0; attempt < 5; attempt++) {
    const controller = new AbortController();
    let timer;
    let timedOut = false;
    const started = now();
    try {
      const response = await Promise.race([
        Promise.resolve().then(() => fetchRequest(`${baseUrl}/_cat/aliases`, { signal: controller.signal })),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
            reject(new Error("RTT deadline"));
          }, timeoutMs);
        }),
      ]);
      void response.body?.cancel().catch(() => {});
      if (response.ok) timings.push(Math.round(now() - started));
      else failures.http = (failures.http ?? 0) + 1;
    } catch {
      const category = timedOut ? "timeout" : "transport";
      failures[category] = (failures[category] ?? 0) + 1;
    } finally {
      clearTimeout(timer);
    }
  }
  timings.sort((left, right) => left - right);
  return {
    status: timings.length === 5 ? "available" : timings.length ? "partial" : "unavailable",
    attempted: 5, valid: timings.length, failures,
    medianMs: timings.length ? timings[Math.floor(timings.length / 2)] : null,
  };
}