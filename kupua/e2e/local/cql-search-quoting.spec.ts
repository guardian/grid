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
import type { Page } from "@playwright/test";

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

test.describe("CQL resolver ownership", () => {
  test.beforeEach(async ({ kupua, page }) => {
    await kupua.goto();
    await page.waitForFunction(() => !(window as any).__kupua_store__.getState().loading);
    await page.evaluate(async () => {
      const { LazyTypeahead } = await import("/src/lib/lazy-typeahead.ts");
      const { queryStrFromAst } = await import("/src/lib/cql-ast-serialize.ts");
      const source = (window as any).__kupua_store__.getState().dataSource;
      const originalAggregation = source.getAggregations;
      const ownedAggregation = Object.hasOwn(source, "getAggregations");
      const originalSuggestions = LazyTypeahead.prototype.getSuggestions;
      const probe = {
        registered: customElements.get("cql-input"), element: document.querySelector("cql-input"),
        suggestions: [] as any[], requests: [] as any[], pending: [] as any[], hold: false,
        restore: () => {
          LazyTypeahead.prototype.getSuggestions = originalSuggestions;
          if (ownedAggregation) source.getAggregations = originalAggregation;
          else delete source.getAggregations;
        },
      };
      source.getAggregations = async (params: any, fields: any[], signal: AbortSignal) => {
        probe.requests.push({ query: params.query, fields, signal });
        if (probe.hold) return new Promise((resolve) => probe.pending.push({ signal, resolve }));
        return {
          fields: Object.fromEntries(fields.map(({ field }: any) => [field, { buckets: [{ key: "Fresh synthetic", count: 8 }], total: 8 }])),
          filters: { deleted: 1, "under-quota": 2 },
        };
      };
      LazyTypeahead.prototype.getSuggestions = function (program: any, signal?: AbortSignal) {
        const query = queryStrFromAst(program);
        return originalSuggestions.call(this, program, signal).then((result: any[]) => {
          probe.suggestions.push({ query, values: result.filter(entry => entry.position === "chipValue").flatMap(entry => entry.suggestions) });
          return result;
        });
      };
      (window as any).__cqlLifetimeProbe = probe;
    });
  });

  test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
      const probe = (window as any).__cqlLifetimeProbe;
      probe?.restore();
      for (const pending of probe?.pending ?? []) pending.resolve({ fields: {} });
      delete (window as any).__cqlLifetimeProbe;
    });
  });

  async function typeQuery(page: Page, query: string) {
    await page.evaluate(() => { (window as any).__cqlLifetimeProbe.suggestions = []; });
    await page.locator(".ProseMirror.Cql__ContentEditable").fill(query);
    await page.waitForFunction((expected) => (window as any).__cqlLifetimeProbe.suggestions
      .some((entry: any) => entry.query === expected), query);
  }

  async function remount(page: Page, mode: "clear" | "home") {
    await page.evaluate(() => { (window as any).__cqlLifetimeProbe.element = document.querySelector("cql-input"); });
    if (mode === "clear") await page.getByRole("button", { name: "Clear search", exact: true }).click();
    else await page.getByRole("toolbar", { name: "Search and filter controls" }).getByRole("link").click();
    await page.waitForFunction(() => {
      const probe = (window as any).__cqlLifetimeProbe;
      return document.querySelector("cql-input") !== probe.element && !(window as any).__kupua_store__.getState().loading;
    });
    expect(await page.evaluate(() => customElements.get("cql-input") === (window as any).__cqlLifetimeProbe.registered)).toBe(true);
  }

  test("current ticker and aggregation callbacks survive repeated Clear and Home remounts", async ({ page }) => {
    for (const [generation, mode] of (["clear", "home", "clear"] as const).entries()) {
      await page.evaluate((count) => (window as any).__kupua_store__.setState({
        tickerCounts: { "agency picks": { value: count } },
        aggregations: { fields: { "usageRights.category": { buckets: [{ key: "staff-photographer", count: count + 10 }], total: count + 10 } } },
        isFilterCounts: { deleted: count + 20, "under-quota": count + 30 },
      }), 101 + generation);
      await typeQuery(page, "is:");
      const values = await page.evaluate(() => (window as any).__cqlLifetimeProbe.suggestions.at(-1).values);
      expect(values).toContainEqual(expect.objectContaining({ value: "agency-pick", count: 101 + generation }));
      expect(values).toContainEqual(expect.objectContaining({ value: "GNM-owned-photo", count: 111 + generation }));
      expect(values).toContainEqual(expect.objectContaining({ value: "under-quota", count: 131 + generation }));
      await expect(page.locator(".Cql__OptionCount").filter({ hasText: String(101 + generation) })).toBeVisible();
      await remount(page, mode);
    }
  });

  test("own-chip and dynamic controls keep live AST scope after remount", async ({ page }) => {
    await typeQuery(page, "credit:");
    await remount(page, "clear");
    for (const query of ['"literal credit:inside" credit:', 'city:London "fileMetadata.xmp.dc:creator":']) {
      await typeQuery(page, query);
      const observed = await page.evaluate(() => {
        const probe = (window as any).__cqlLifetimeProbe;
        return { values: probe.suggestions.at(-1).values, query: probe.requests.at(-1).query };
      });
      expect(observed.values).toContainEqual(expect.objectContaining({ value: "Fresh synthetic", count: 8 }));
      expect(observed.query).toBe(query.startsWith("city:") ? "city:London" : '"literal credit:inside"');
      await remount(page, "clear");
    }
  });

  test("Clear cancels obsolete pending suggestions before another suggestion pass", async ({ page }) => {
    await page.evaluate(() => { (window as any).__cqlLifetimeProbe.hold = true; });
    await page.locator(".ProseMirror.Cql__ContentEditable").fill("credit:");
    await page.waitForFunction(() => (window as any).__cqlLifetimeProbe.pending.length > 0);
    await remount(page, "clear");
    const aborted = await page.evaluate(() => {
      const probe = (window as any).__cqlLifetimeProbe;
      const cancelled = probe.pending.every((request: any) => request.signal.aborted);
      probe.hold = false;
      for (const pending of probe.pending) pending.resolve({ fields: { "metadata.credit": { buckets: [{ key: "Obsolete", count: 1 }], total: 1 } } });
      return cancelled;
    });
    expect(aborted).toBe(true);
    await typeQuery(page, "credit:");
    const values = await page.evaluate(() => (window as any).__cqlLifetimeProbe.suggestions.at(-1).values);
    expect(values).toContainEqual(expect.objectContaining({ value: "Fresh synthetic", count: 8 }));
    expect(values).not.toContainEqual(expect.objectContaining({ value: "Obsolete" }));
  });
});
