/**
 * Throwaway diagnostic — traces history.length at each step of the
 * user's repro to find where an entry goes missing.
 *
 * Repro:
 * 1. Fresh tab → paste /search?nonFree=true
 * 2. Seek to ~50%
 * 3. Open image detail (click an image)
 * 4. Click metadata value → launches search (e.g. +source:AAP)
 * 5. Change sort order → &orderBy=-taken
 * 6. Back ×3 → should land on step 1, not browser start page
 */

import { test, expect } from "../shared/helpers";

test.beforeEach(async ({ kupua }) => {
  await kupua.ensureExplicitMode();
});

test("trace history.length through metadata-click repro", async ({ page, kupua }) => {
  const hl = () => page.evaluate(() => window.history.length);
  const loc = () => page.evaluate(() => window.location.href);
  const kupuaKey = () => page.evaluate(() => (window.history.state as any)?.kupuaKey);

  // Step 1: navigate to search (like pasting a URL)
  await kupua.goto();
  console.log(`[DIAG] Step 1 — after goto: history.length=${await hl()}, url=${await loc()}, key=${await kupuaKey()}`);

  // Step 2: seek to ~50% via scrubber
  await kupua.seekTo(0.5);
  await page.waitForTimeout(2000);
  console.log(`[DIAG] Step 2 — after seek: history.length=${await hl()}, url=${await loc()}, key=${await kupuaKey()}`);

  // Step 3: open image detail via dblclick (explicit focus mode)
  const imageId = await kupua.openDetailForNthItem(0);
  console.log(`[DIAG] Step 3 — after open detail: history.length=${await hl()}, url=${await loc()}, key=${await kupuaKey()}, imageId=${imageId}`);

  // Step 4: navigate to a query search (simulates metadata click)
  await page.evaluate(() => {
    const markSnap = (window as any).__kupua_markPushSnapshot__;
    if (markSnap) markSnap();
    const markUserNav = (window as any).__kupua_markUserNav__;
    if (markUserNav) markUserNav();
    const router = (window as any).__kupua_router__;
    router.navigate({
      to: "/search",
      search: { nonFree: "true", query: "source:AAP" },
      state: { kupuaKey: crypto.randomUUID() },
    });
  });
  await page.waitForTimeout(3000);
  console.log(`[DIAG] Step 4 — after query push: history.length=${await hl()}, url=${await loc()}, key=${await kupuaKey()}`);

  // Step 5: change sort order
  await page.evaluate(() => {
    const markSnap = (window as any).__kupua_markPushSnapshot__;
    if (markSnap) markSnap();
    const markUserNav = (window as any).__kupua_markUserNav__;
    if (markUserNav) markUserNav();
    const router = (window as any).__kupua_router__;
    const params = new URLSearchParams(window.location.search);
    const search: Record<string, string> = {};
    params.forEach((v, k) => { search[k] = v; });
    search.orderBy = "-taken";
    router.navigate({
      to: "/search",
      search,
      state: { kupuaKey: crypto.randomUUID() },
    });
  });
  await page.waitForTimeout(3000);
  console.log(`[DIAG] Step 5 — after sort change: history.length=${await hl()}, url=${await loc()}, key=${await kupuaKey()}`);

  // Now go back step by step
  console.log(`[DIAG] === GOING BACK ===`);

  await page.goBack();
  await page.waitForTimeout(3000);
  console.log(`[DIAG] Back 1: history.length=${await hl()}, url=${await loc()}, key=${await kupuaKey()}`);

  await page.goBack();
  await page.waitForTimeout(3000);
  const back2Len = await hl();
  console.log(`[DIAG] Back 2: history.length=${back2Len}, url=${await loc()}, key=${await kupuaKey()}`);
  // history.length must NOT shrink — synthesis must NOT fire
  expect(back2Len).toBe(5);

  await page.goBack();
  await page.waitForTimeout(3000);
  const back3Url = await loc();
  console.log(`[DIAG] Back 3: history.length=${await hl()}, url=${back3Url}, key=${await kupuaKey()}`);
  // Back 3 should land on the search page, not browser start page
  expect(back3Url).toContain("localhost:3000");
  expect(back3Url).toContain("nonFree=true");

  // Forward should also work — entries were NOT truncated
  await page.goForward();
  await page.waitForTimeout(3000);
  const fwd1Url = await loc();
  console.log(`[DIAG] Forward 1: history.length=${await hl()}, url=${fwd1Url}, key=${await kupuaKey()}`);
  expect(fwd1Url).toContain("image=");

  await page.goForward();
  await page.waitForTimeout(3000);
  const fwd2Url = await loc();
  console.log(`[DIAG] Forward 2: history.length=${await hl()}, url=${fwd2Url}, key=${await kupuaKey()}`);
  expect(fwd2Url).toContain("source:AAP");
});
