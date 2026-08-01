/**
 * Repro spec for W-2026-07-30-seek-idempotence (mission M7).
 *
 * NOT part of the main suite (this file lives next to its findings doc, not
 * under e2e/, so it's outside the configured testDir entirely). Run manually
 * against the seek-tier server: VITE_POSITION_MAP_THRESHOLD=0
 * npm run dev -- --port 3030 (see playwright.tiers.config.ts for the exact
 * command), pointed at by a manual single-project config with baseURL
 * http://localhost:3030.
 *
 * Corpus: local sample data, `credit:Avalon` (~2,130 docs).
 */

import { test, expect } from "../../../e2e/shared/helpers";

const QUERY = "query=credit:Avalon";

test.describe("W-2026-07-30 seek idempotence — M7", () => {
  // ---------------------------------------------------------------------
  // F1 (RETRACTED, see findings doc "Correction" section) — originally
  // reported as "first scrubber click after a fresh page load is biased".
  // Re-tested with explicit sessionStorage/localStorage clearing and found
  // to be a test-methodology artifact (stale `kupua:histSnap:*` restored
  // across page reuse within the same embedded-browser session), not a
  // real bug. Playwright gives each test its own isolated storage/context,
  // so this test is expected to PASS (both clicks agree) — kept as a
  // regression guard, not a known-failing marker.
  // ---------------------------------------------------------------------
  test("first scrubber click after fresh load agrees with an identical later click", async ({ kupua }) => {
    await kupua.gotoWithParams(QUERY);

    const trackBox = await kupua.scrubber.boundingBox();
    if (!trackBox) throw new Error("Scrubber track not visible");
    const x = trackBox.x + trackBox.width / 2;
    const y = trackBox.y + 0.5 * trackBox.height;

    // First click — this is the click under test.
    await kupua.page.mouse.click(x, y);
    await kupua.page.waitForTimeout(1200);
    const firstClick = await kupua.page.evaluate(() => {
      const s = (window as any).__kupua_store__.getState();
      const anchor = (window as any).__kupua_getViewportAnchorId__?.();
      return { globalPos: s.imagePositions.get(anchor) ?? null };
    });

    // Second click, same pixel, same page (no reload in between).
    await kupua.page.mouse.click(x, y);
    await kupua.page.waitForTimeout(1200);
    const secondClick = await kupua.page.evaluate(() => {
      const s = (window as any).__kupua_store__.getState();
      const anchor = (window as any).__kupua_getViewportAnchorId__?.();
      return { globalPos: s.imagePositions.get(anchor) ?? null };
    });

    // eslint-disable-next-line no-console
    console.log("W-2026-07-30 M7 F1 (retracted):", { firstClick, secondClick });

    expect(firstClick.globalPos).not.toBeNull();
    expect(secondClick.globalPos).not.toBeNull();
    expect(Math.abs((firstClick.globalPos ?? 0) - (secondClick.globalPos ?? 0))).toBeLessThan(20);
  });
});
