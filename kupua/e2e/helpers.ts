/**
 * Shared helpers and fixtures for kupua Playwright E2E tests.
 *
 * These helpers encapsulate:
 * - Waiting for data to load (ES results visible)
 * - Scrubber interaction (drag, click, keyboard)
 * - Sort changes (dropdown + direction toggle)
 * - Density switch
 * - Reading store state from the browser context
 * - Viewport/scroll position assertions
 */

import { test as base, expect, type Page, type Locator } from "@playwright/test";

// ---------------------------------------------------------------------------
// Extended test fixture — adds `kupua` helper object to every test
// ---------------------------------------------------------------------------

export const test = base.extend<{ kupua: KupuaHelpers }>({
  kupua: async ({ page }, use) => {
    const helpers = new KupuaHelpers(page);
    await use(helpers);
  },
});

export { expect };

// ---------------------------------------------------------------------------
// Helper class
// ---------------------------------------------------------------------------

export class KupuaHelpers {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // -------------------------------------------------------------------------
  // Navigation & waiting
  // -------------------------------------------------------------------------

  /** Navigate to the search page and wait for initial data to load. */
  async goto() {
    await this.page.goto("/search?nonFree=true");
    await this.waitForResults();
  }

  /** Wait until search results are visible (at least one row/cell). */
  async waitForResults(timeout = 15_000) {
    // Wait for either grid cells or table rows to appear
    await this.page.waitForFunction(
      () => {
        const grid = document.querySelector('[aria-label="Image results grid"]');
        const table = document.querySelector('[aria-label="Image results table"]');
        const container = grid ?? table;
        if (!container) return false;
        // Check that there's at least one rendered child with content
        return container.querySelector("[role='row']") !== null ||
               container.querySelectorAll("[class*='shrink-0']").length > 4;
      },
      { timeout },
    );
  }

  /** Wait until loading indicator clears. */
  async waitForNotLoading(timeout = 15_000) {
    await this.page.waitForFunction(
      () => {
        // The loading dot in the scrubber tooltip
        const dot = document.querySelector('[data-scrubber-thumb]')
          ?.parentElement?.querySelector('.animate-pulse');
        return !dot;
      },
      { timeout },
    );
  }

  // -------------------------------------------------------------------------
  // Store state — read Zustand state from the browser
  // -------------------------------------------------------------------------

  /** Read the full search store state. */
  async getStoreState(): Promise<{
    bufferOffset: number;
    total: number;
    resultsLength: number;
    focusedImageId: string | null;
    loading: boolean;
    sortAroundFocusStatus: string | null;
    orderBy: string | undefined;
    seekGeneration: number;
    seekTargetLocalIndex: number;
    error: string | null;
    firstImageId: string | null;
    lastImageId: string | null;
  }> {
    return this.page.evaluate(() => {
      // Access the Zustand store via the window — we'll expose it
      const store = (window as any).__kupua_store__;
      if (!store) throw new Error("Store not exposed on window");
      const s = store.getState();
      return {
        bufferOffset: s.bufferOffset,
        total: s.total,
        resultsLength: s.results.length,
        focusedImageId: s.focusedImageId,
        loading: s.loading,
        sortAroundFocusStatus: s.sortAroundFocusStatus,
        orderBy: s.params.orderBy,
        seekGeneration: s._seekGeneration,
        seekTargetLocalIndex: s._seekTargetLocalIndex,
        error: s.error,
        firstImageId: s.results[0]?.id ?? null,
        lastImageId: s.results[s.results.length - 1]?.id ?? null,
      };
    });
  }

  /** Get the global position of the focused image (or -1). */
  async getFocusedGlobalPosition(): Promise<number> {
    return this.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) return -1;
      const s = store.getState();
      if (!s.focusedImageId) return -1;
      return s.imagePositions.get(s.focusedImageId) ?? -1;
    });
  }

  /** Get the first visible image ID from the current view. */
  async getFirstVisibleImageId(): Promise<string | null> {
    return this.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) return null;
      const s = store.getState();
      if (s.results.length === 0) return null;
      return s.results[0]?.id ?? null;
    });
  }

  /**
   * Get the ID and global position of the image at buffer-local index `localIdx`.
   */
  async getImageAtLocalIndex(localIdx: number): Promise<{ id: string; globalPos: number } | null> {
    return this.page.evaluate((idx) => {
      const store = (window as any).__kupua_store__;
      if (!store) return null;
      const s = store.getState();
      const img = s.results[idx];
      if (!img) return null;
      return { id: img.id, globalPos: s.imagePositions.get(img.id) ?? -1 };
    }, localIdx);
  }

  /**
   * Verify imagePositions map integrity: every image in the buffer must
   * have a globalPos === bufferOffset + localIndex.
   */
  async assertPositionsConsistent(): Promise<void> {
    const result = await this.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      if (!store) return { ok: false, msg: "store not found" };
      const s = store.getState();
      for (let i = 0; i < s.results.length; i++) {
        const img = s.results[i];
        if (!img) continue;
        const gp = s.imagePositions.get(img.id);
        if (gp !== s.bufferOffset + i) {
          return {
            ok: false,
            msg: `imagePositions[${img.id}] = ${gp}, expected ${s.bufferOffset + i} (local ${i})`,
          };
        }
      }
      return { ok: true, msg: "" };
    });
    if (!result.ok) throw new Error(`Position consistency check failed: ${result.msg}`);
  }

  /**
   * Wait for a seek to complete (loading=false, error=null).
   * Stricter than waitForResults — also checks store state.
   */
  async waitForSeekComplete(timeout = 15_000) {
    await this.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        // Resolve when loading is done — whether success or error.
        // Callers check s.error themselves for pass/fail assertions.
        return !s.loading && s.results.length > 0;
      },
      { timeout },
    );
  }

  /**
   * Click scrubber and wait for seek to fully complete (no loading, no error,
   * positions consistent). Stricter version of clickScrubberAt.
   */
  async seekTo(ratio: number, timeout?: number) {
    const trackBox = await this.scrubber.boundingBox();
    if (!trackBox) throw new Error("Scrubber track not visible");

    const x = trackBox.x + trackBox.width / 2;
    const y = trackBox.y + ratio * trackBox.height;
    await this.page.mouse.click(x, y);

    await this.waitForSeekComplete(timeout);
    // Extra settle time for React re-render
    await this.page.waitForTimeout(200);
  }

  /**
   * Get the aria-valuetext from the scrubber (contains position + date label).
   */
  async getScrubberValueText(): Promise<string | null> {
    return this.scrubber.getAttribute("aria-valuetext");
  }

  // -------------------------------------------------------------------------
  // Scrubber
  // -------------------------------------------------------------------------

  /** Get the scrubber slider element. */
  get scrubber(): Locator {
    return this.page.locator('[role="slider"][aria-label="Result set position"]');
  }

  /** Get the scrubber thumb element. */
  get scrubberThumb(): Locator {
    return this.page.locator('[data-scrubber-thumb="true"]');
  }

  /** Get the scrubber tooltip text (when visible). */
  async getScrubberTooltip(): Promise<string | null> {
    const tooltip = this.page.locator('[data-scrubber-thumb]')
      .locator('..').locator('.pointer-events-none');
    if (await tooltip.count() === 0) return null;
    return tooltip.textContent();
  }

  /** Get the scrubber aria-valuenow (current position). */
  async getScrubberPosition(): Promise<number> {
    const val = await this.scrubber.getAttribute("aria-valuenow");
    return val ? parseInt(val, 10) : 0;
  }

  /** Get the scrubber aria-valuemax (total - 1). */
  async getScrubberMax(): Promise<number> {
    const val = await this.scrubber.getAttribute("aria-valuemax");
    return val ? parseInt(val, 10) : 0;
  }

  /**
   * Drag the scrubber thumb to a target ratio (0 = top, 1 = bottom).
   * This simulates a real pointer drag on the thumb element.
   */
  async dragScrubberTo(ratio: number) {
    const track = this.scrubber;
    const thumb = this.scrubberThumb;

    const trackBox = await track.boundingBox();
    if (!trackBox) throw new Error("Scrubber track not visible");

    const thumbBox = await thumb.boundingBox();
    if (!thumbBox) throw new Error("Scrubber thumb not visible");

    // Start from thumb center
    const startX = thumbBox.x + thumbBox.width / 2;
    const startY = thumbBox.y + thumbBox.height / 2;

    // Target Y within the track
    const targetY = trackBox.y + ratio * trackBox.height;

    // Perform drag: pointerdown on thumb, move to target, pointerup
    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    // Move in steps for realistic drag
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      const y = startY + (targetY - startY) * (i / steps);
      await this.page.mouse.move(startX, y);
    }
    await this.page.mouse.up();

    // Wait for seek to complete
    await this.page.waitForTimeout(800);
    await this.waitForResults();
  }

  /** Click on the scrubber track at a given ratio (0 = top, 1 = bottom). */
  async clickScrubberAt(ratio: number) {
    const trackBox = await this.scrubber.boundingBox();
    if (!trackBox) throw new Error("Scrubber track not visible");

    const x = trackBox.x + trackBox.width / 2;
    const y = trackBox.y + ratio * trackBox.height;
    await this.page.mouse.click(x, y);

    // Wait for seek
    await this.page.waitForTimeout(800);
    await this.waitForResults();
  }

  // -------------------------------------------------------------------------
  // Sort
  // -------------------------------------------------------------------------

  /** Open sort dropdown and select a sort field by label. */
  async selectSort(label: string) {
    // Click the sort button to open dropdown
    const sortButton = this.page.locator('button[aria-haspopup="listbox"]');
    await sortButton.click();

    // Wait for dropdown to appear
    const dropdown = this.page.locator('[role="listbox"][aria-label="Sort field"]');
    await dropdown.waitFor({ state: "visible" });

    // Click the option
    const option = dropdown.locator(`[role="option"]`).filter({ hasText: label });
    await option.click();

    // Wait for new search results
    await this.page.waitForTimeout(500);
    await this.waitForResults();
  }

  /** Toggle sort direction (ascending ↔ descending). */
  async toggleSortDirection() {
    const btn = this.page.locator('button[aria-label*="Sort"]').filter({
      hasText: /[↑↓]/,
    });
    await btn.click();
    await this.page.waitForTimeout(500);
    await this.waitForResults();
  }

  /** Get the current sort direction from the UI. */
  async getSortDirection(): Promise<"asc" | "desc"> {
    const btn = this.page.locator('button[aria-label*="Sort"]').filter({
      hasText: /[↑↓]/,
    });
    const text = await btn.textContent();
    return text?.includes("↓") ? "desc" : "asc";
  }

  // -------------------------------------------------------------------------
  // Density switch
  // -------------------------------------------------------------------------

  /** Switch to grid view. */
  async switchToGrid() {
    const btn = this.page.locator('button[aria-label="Switch to grid view"]');
    if (await btn.count() > 0) {
      await btn.click();
      await this.page.waitForTimeout(300);
      await this.waitForResults();
    }
  }

  /** Switch to table view. */
  async switchToTable() {
    const btn = this.page.locator('button[aria-label="Switch to table view"]');
    if (await btn.count() > 0) {
      await btn.click();
      await this.page.waitForTimeout(300);
      await this.waitForResults();
    }
  }

  /** Check if currently in grid view. */
  async isGridView(): Promise<boolean> {
    return (await this.page.locator('[aria-label="Image results grid"]').count()) > 0;
  }

  /** Check if currently in table view. */
  async isTableView(): Promise<boolean> {
    return (await this.page.locator('[aria-label="Image results table"]').count()) > 0;
  }

  // -------------------------------------------------------------------------
  // Focus
  // -------------------------------------------------------------------------

  /** Click the Nth visible row/cell to focus it (0-based). */
  async focusNthItem(n: number) {
    if (await this.isGridView()) {
      // Grid: click the nth cell-like div
      const cells = this.page.locator(
        '[aria-label="Image results grid"] [class*="cursor-pointer"]'
      );
      await cells.nth(n).click();
    } else {
      // Table: click the nth data row (skip header)
      const dataRows = this.page.locator(
        '[aria-label="Image results table"] [role="row"][class*="cursor-pointer"]'
      );
      await dataRows.nth(n).click();
    }
    await this.page.waitForTimeout(100);
  }

  /** Get the currently focused image ID from the store. */
  async getFocusedImageId(): Promise<string | null> {
    return this.page.evaluate(() => {
      const store = (window as any).__kupua_store__;
      return store?.getState().focusedImageId ?? null;
    });
  }

  // -------------------------------------------------------------------------
  // Scroll position
  // -------------------------------------------------------------------------

  /** Get the scroll container's scrollTop. */
  async getScrollTop(): Promise<number> {
    return this.page.evaluate(() => {
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      return (grid ?? table)?.scrollTop ?? 0;
    });
  }

  /** Scroll the content container by a given number of pixels. */
  async scrollBy(deltaY: number) {
    await this.page.evaluate((dy) => {
      const grid = document.querySelector('[aria-label="Image results grid"]');
      const table = document.querySelector('[aria-label="Image results table"]');
      const el = grid ?? table;
      if (el) el.scrollTop += dy;
    }, deltaY);
    await this.page.waitForTimeout(100);
  }

  /** Press Page Down in the content area. */
  async pageDown() {
    await this.page.keyboard.press("PageDown");
    await this.page.waitForTimeout(300);
  }

  /** Press Page Up in the content area. */
  async pageUp() {
    await this.page.keyboard.press("PageUp");
    await this.page.waitForTimeout(300);
  }

  /**
   * Wait for sort-around-focus to complete (status null, loading false).
   */
  async waitForSortAroundFocus(timeout = 15_000) {
    await this.page.waitForFunction(
      () => {
        const store = (window as any).__kupua_store__;
        if (!store) return false;
        const s = store.getState();
        return s.sortAroundFocusStatus === null && !s.loading;
      },
      { timeout },
    );
  }

  // -------------------------------------------------------------------------
  // Console log capture — for telemetry assertions
  // -------------------------------------------------------------------------

  private _consoleLogs: string[] = [];
  private _consoleListenerAttached = false;

  /**
   * Start capturing browser console messages.
   * Call before the action whose logs you want to capture.
   * Subsequent calls clear previous captures.
   */
  startConsoleCapture() {
    this._consoleLogs = [];
    if (!this._consoleListenerAttached) {
      this.page.on("console", (msg) => {
        this._consoleLogs.push(msg.text());
      });
      this._consoleListenerAttached = true;
    }
  }

  /**
   * Return captured console messages matching `pattern`.
   * Useful for checking telemetry logs from findKeywordSortValue etc.
   */
  getConsoleLogs(pattern?: RegExp): string[] {
    if (!pattern) return [...this._consoleLogs];
    return this._consoleLogs.filter((line) => pattern.test(line));
  }
}
