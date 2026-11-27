import { StringDecoder } from "node:string_decoder";

export const AUTH_REQUIRED_MARKER = "[kupua perf authentication required]";
export const AUTH_RENEWAL_COMMAND = 'kupua/node_modules/.bin/playwright codegen --save-storage="[enter path to your cookie file]" https://kupua.media.local.dev-gutools.co.uk';

export function createPerfAuthOutputFilter() {
  let authRequired = false;
  const pending = { stdout: "", stderr: "" };
  const decoders = { stdout: new StringDecoder("utf8"), stderr: new StringDecoder("utf8") };
  return {
    get authRequired() { return authRequired; },
    push(chunk, channel) {
      if (authRequired) return "";
      const text = pending[channel] + decoders[channel].write(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      const markerAt = text.indexOf(AUTH_REQUIRED_MARKER);
      if (markerAt !== -1) {
        authRequired = true;
        pending.stdout = pending.stderr = "";
        return text.slice(0, markerAt);
      }
      let held = 0;
      for (let length = Math.min(text.length, AUTH_REQUIRED_MARKER.length - 1); length > 0; length--) {
        if (AUTH_REQUIRED_MARKER.startsWith(text.slice(-length))) {
          held = length;
          break;
        }
      }
      pending[channel] = held ? text.slice(-held) : "";
      return text.slice(0, text.length - held);
    },
    flush(channel) {
      const remainder = decoders[channel].end();
      decoders[channel] = new StringDecoder("utf8");
      const text = authRequired ? "" : pending[channel] + remainder;
      pending[channel] = "";
      return text;
    },
  };
}

export function isPerfAuthResponse({ url, status, location, navigation = false }, { appBaseUrl, mediaApiBaseUrl }) {
  let source;
  try {
    source = new URL(url);
    const app = new URL(appBaseUrl);
    const api = new URL(mediaApiBaseUrl);
    const appRequest = source.origin === app.origin && (navigation
      || source.pathname === "/api" || source.pathname.startsWith("/api/")
      || source.pathname === "/__kupua/perf-environment");
    if (source.origin !== api.origin && !appRequest) return false;
  } catch {
    return false;
  }
  if (status === 401 || status === 419) return true;
  if (![301, 302, 303, 307, 308].includes(status) || !location) return false;
  try {
    const target = new URL(location, source);
    return target.pathname === "/login" || target.pathname.startsWith("/login/");
  } catch {
    return false;
  }
}

export function createPerfAuthGuard(page, targets, notify) {
  let failed = false;
  const inspect = (response, navigation = false) => {
    if (failed || !isPerfAuthResponse({
      url: response.url(), status: response.status(), location: response.headers().location, navigation,
    }, targets)) return;
    failed = true;
    notify(AUTH_REQUIRED_MARKER);
  };
  const onResponse = response => inspect(response, response.request().isNavigationRequest());
  page.on("response", onResponse);
  return {
    inspect,
    assertAuthenticated() {
      if (failed) throw new Error("Perf authentication required");
    },
    dispose() {
      page.off("response", onResponse);
    },
  };
}