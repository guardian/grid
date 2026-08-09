/**
 * CQL quoting round-trip: a query pasted directly into the URL (not typed)
 * must survive the CQL editor's initial parse -> re-serialize -> onChange
 * cycle unchanged, including across a reload.
 *
 * Regression test for a bug where a field KEY containing a reserved char
 * (e.g. `fileMetadata.xmp.dc:creator`, quoted by @guardian/cql because of
 * the colon) had its quotes incorrectly stripped by CqlSearchInput's
 * "effective query" derivation, corrupting the chip and the URL.
 *
 * Run:
 *   npx playwright test e2e/local/cql-search-quoting.spec.ts
 */

import { test, expect } from "../shared/helpers";

const rawQuery = '"fileMetadata.xmp.dc:creator":"Alicia Canter"';

test("preserves a quoted key:value chip (key contains a colon) across load and reload", async ({ kupua }) => {
  await kupua.page.goto(`/search?nonFree=true&query=${encodeURIComponent(rawQuery)}`);
  await kupua.page.waitForFunction(() => {
    const store = (window as any).__kupua_store__;
    return !!store && !store.getState().loading;
  });

  const assertCorrect = async () => {
    const urlQuery = await kupua.page.evaluate(
      () => new URL(window.location.href).searchParams.get("query")
    );
    expect(urlQuery).toBe(rawQuery);

    const storeQuery = await kupua.page.evaluate(
      () => (window as any).__kupua_store__.getState().params.query
    );
    expect(storeQuery).toBe(rawQuery);

    const cqlInput = kupua.page.locator("cql-input");
    await expect(cqlInput).toBeVisible();
    const chipText = await cqlInput.evaluate(
      (el) => el.shadowRoot?.querySelector(".Cql__ChipWrapperContent")?.textContent ?? ""
    );
    expect(chipText.replace(/\s+/g, "")).toContain("fileMetadata.xmp.dc:creator");
    expect(chipText).toContain("Alicia Canter");
  };

  await assertCorrect();

  await kupua.page.reload();
  await kupua.page.waitForFunction(() => {
    const store = (window as any).__kupua_store__;
    return !!store && !store.getState().loading;
  });
  await assertCorrect();
});
