// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete window.__KUPUA_CONFIG__;
});

async function homeWith(hosted: boolean, showPaid?: unknown) {
  vi.resetModules();
  if (hosted) vi.stubEnv("VITE_HOSTED", "true");
  window.__KUPUA_CONFIG__ = showPaid === undefined ? {} : { showPaid };
  return import("./home-defaults");
}

describe("home defaults", () => {
  it.each([
    { label: "hosted user who may see paid images", hosted: true, showPaid: true, search: { nonFree: "true" }, href: "/search?nonFree=true" },
    { label: "hosted user without show_paid", hosted: true, showPaid: false, search: {}, href: "/search" },
    { label: "hosted page without the permission", hosted: true, showPaid: undefined, search: { nonFree: "true" }, href: "/search?nonFree=true" },
    { label: "hosted page with an invalid permission", hosted: true, showPaid: "false", search: { nonFree: "true" }, href: "/search?nonFree=true" },
    { label: "laptop modes, whatever the page holds", hosted: false, showPaid: false, search: { nonFree: "true" }, href: "/search?nonFree=true" },
  ])("$label", async ({ hosted, showPaid, search, href }) => {
    const home = await homeWith(hosted, showPaid);
    expect(home.DEFAULT_SEARCH).toEqual(search);
    expect(home.HOME_HREF).toBe(href);
  });
});
