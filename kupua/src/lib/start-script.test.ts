import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const temporary: string[] = [];
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function launch(flags: string[]) {
  const cache = resolve("node_modules/.cache");
  mkdirSync(cache, { recursive: true });
  const directory = mkdtempSync(join(cache, "start-script-"));
  temporary.push(directory);
  const calls = join(directory, "calls");
  writeFileSync(calls, "");
  const stub = (name: string, body: string) => writeFileSync(join(directory, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  const shellEnvironment = join(directory, "shell-env");
  writeFileSync(shellEnvironment, "clear() { :; }\nsleep() { :; }\n");
  stub("node", "printf 'v22.14.0\\n'");
  stub("lsof", "exit 1");
  stub("npm", 'printf "npm %s\\n" "$*" >> "$CALLS"\nprintf "ENV:%s|%s|%s|%s|%s|%s\\n" "$VITE_USE_MEDIA_API" "$VITE_MEDIA_API_BASE_URL" "$VITE_MEDIA_DELIVERY" "$VITE_S3_PROXY_ENABLED" "$VITE_IMGPROXY_ENABLED" "$KUPUA_LOAD_SITE_SETTINGS"');
  for (const command of ["docker", "docker-compose", "aws", "curl", "ssh", "ssm", "ps", "touch"]) {
    stub(command, `printf '${command} %s\\n' "$*" >> "$CALLS"\nexit 80`);
  }
  const result = spawnSync("/bin/bash", [resolve("scripts/start.sh"), ...flags, "--skip-install"], {
    encoding: "utf8", timeout: 5_000,
    env: { PATH: `${directory}:/usr/bin:/bin`, HOME: directory, CALLS: calls, BASH_ENV: shellEnvironment,
      VITE_S3_PROXY_ENABLED: "true", VITE_IMGPROXY_ENABLED: "true", VITE_USE_MEDIA_API: "false" },
  });
  return { ...result, calls: readFileSync(calls, "utf8").trim().split("\n").filter(Boolean) };
}

describe("Kupua launcher data modes", () => {
  it.each([
    { selector: "--use-media-api", base: "/api", label: "local media-api" },
    { selector: "--use-deployed-media-api", base: "https://api.media.test.dev-gutools.co.uk", label: "deployed TEST API" },
  ])("starts $label canonical delivery without TEST infrastructure", ({ selector, base, label }) => {
    const result = launch([selector, "--canonical-media"]);
    expect(result.error).toBeUndefined();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.calls).toEqual(["npm run dev"]);
    expect(result.stdout).toContain(`ENV:true|${base}|canonical|false|false|true`);
    expect(result.stdout).toContain("GREETINGS PROFESSOR FALKEN.");
    expect(result.stdout).toContain("SHALL WE PLAY A GAME?");
    expect(result.stdout).toContain(`Starting Kupua (${label})`);
    expect(result.stdout).toContain("[1/2] Skipping dependency check (--skip-install)");
    expect(result.stdout).toContain("[2/2] Starting Vite dev server");
    expect(result.stdout).toContain("Thumbnails: ON (URLs returned by media-api)");
    expect(result.stdout).toContain("Full images: ON (imgops links returned by media-api)");
    expect(result.stdout).not.toMatch(/Connecting to real TEST Elasticsearch|Discovering S3|Starting Elasticsearch|Killing existing SSH/);
  });

  it.each([
    ["--use-media-api"],
    ["--use-deployed-media-api"],
  ])("retains existing infrastructure setup for %j", (...flags) => {
    const result = launch(flags);
    expect(result.status).not.toBe(0);
    expect(result.calls).toEqual(["docker info"]);
    expect(result.stdout).toContain("Docker is not running");
  });

  it.each([
    ["--use-media-api", "--use-TEST"],
    ["--use-TEST", "--use-deployed-media-api", "--canonical-media"],
  ])("rejects conflicting API and direct-ES flags before side effects: %j", (...flags) => {
    const result = launch(flags);
    expect(result.status).not.toBe(0);
    expect(result.calls).toEqual([]);
    expect(result.stdout).toContain("--use-TEST cannot be combined with an API selector");
    expect(result.stdout).toContain("Grid's own --use-TEST");
  });
});