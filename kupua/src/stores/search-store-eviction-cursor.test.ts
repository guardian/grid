/**
 * Regression tests for audit bug #14:
 *   extractSortValues returning null during buffer eviction must not
 *   overwrite startCursor / endCursor with null.
 *
 * Root cause: both extendForward and extendBackward recompute the opposite-
 * direction cursor after eviction via extractSortValues. If extraction
 * returns null (e.g. malformed sort clause), the previous code assigns null
 * directly — permanently blocking the opposite-direction extend via its
 * `if (!startCursor) return` / `if (!endCursor) return` guard.
 *
 * Fix (symmetric): fall back to the previous cursor value rather than
 * overwriting with null.
 *
 *   extendForward eviction:  newStartCursor = evicted ?? state.startCursor
 *   extendBackward eviction: newEndCursor   = evicted ?? state.endCursor
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useSearchStore } from "./search-store";
import { MockDataSource } from "@/dal/mock-data-source";
import type { SearchAfterResult, SortValues } from "@/dal/types";
import { gridConfig } from "@/lib/grid-config";
import { registerScrollGeometry } from "@/lib/scroll-geometry-ref";
import { buildSearchKey, getRetainedSortValues, retainSortValues } from "@/lib/image-offset-cache";

// ---------------------------------------------------------------------------
// vi.mock — wrap extractSortValues so tests can inject a null return.
//
// _simulateNullCursor: when true, the next call to extractSortValues returns
// null and the flag auto-resets (fires once). Module-level so the closure
// captures the live binding.
// ---------------------------------------------------------------------------

import { vi } from "vitest";

let _simulateNullCursor = false;

vi.mock("@/lib/image-offset-cache", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/image-offset-cache")>();
  return {
    ...real,
    extractSortValues: (...args: Parameters<typeof real.extractSortValues>) => {
      if (_simulateNullCursor) {
        _simulateNullCursor = false; // auto-reset — fires exactly once
        return null;
      }
      return real.extractSortValues(...args);
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const state = () => useSearchStore.getState();
const actions = () => useSearchStore.getState();
const flush = () => new Promise((r) => setTimeout(r, 0));
/** Wait past the 2000ms SEARCH_FETCH_COOLDOWN_MS set by search(). */
const waitPastSearchCooldown = () => new Promise((r) => setTimeout(r, 2100));
/** Wait past the 50ms POST_EXTEND_COOLDOWN_MS set by extendBackward(). */
const waitPastExtendCooldown = () => new Promise((r) => setTimeout(r, 60));

async function withVirtualCooldowns<T>(
  action: (advance: (milliseconds: number) => void) => Promise<T>,
): Promise<T> {
  vi.useFakeTimers();
  const advance = (milliseconds: number) => vi.setSystemTime(new Date(Date.now() + milliseconds));
  advance(2100);
  try {
    return await action(advance);
  } finally {
    vi.useRealTimers();
  }
}

let mock: MockDataSource;

beforeEach(() => {
  _simulateNullCursor = false; // safety reset between tests
  mock = new MockDataSource(10_000);
  // Single column so eviction count is rawEvict (no column rounding)
  registerScrollGeometry({ rowHeight: 303, columns: 1 });

  useSearchStore.setState({
    dataSource: mock,
    results: [],
    bufferOffset: 0,
    total: 0,
    loading: false,
    error: null,
    imagePositions: new Map(),
    startCursor: null,
    endCursor: null,
    pitId: null,
    focusedImageId: null,
    sortAroundFocusStatus: null,
    sortAroundFocusGeneration: 0,
    _extendForwardInFlight: false,
    _extendBackwardInFlight: false,
    _lastPrependCount: 0,
    _prependGeneration: 0,
    _seekGeneration: 0,
    _seekTargetLocalIndex: -1,
    params: {
      query: undefined,
      offset: 0,
      length: 200,
      orderBy: "-uploadTime",
      nonFree: "true",
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockApiAliasPages() {
  const alias = gridConfig.fieldAliases.find((field) =>
    field.elasticsearchPath.startsWith("fileMetadata."),
  );
  if (!alias) throw new Error("Fixture requires a configured fileMetadata alias");
  const responseCursors = new Map<string, SortValues>();
  const searchAfter = mock.searchAfter.bind(mock);
  vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
    const result = await searchAfter(...args);
    const sortValues: SortValues[] = result.hits.map((image) => [
      "fixture-alias-value", Date.parse(image.uploadTime), image.id,
    ]);
    result.hits.forEach((image, index) => responseCursors.set(image.id, sortValues[index]));
    return {
      ...result,
      hits: result.hits.map((image) => ({
        ...image,
        aliases: { [alias.alias]: "fixture-alias-value" },
      })),
      sortValues,
    };
  });
  useSearchStore.setState({ params: { ...state().params, orderBy: alias.alias } });
  return responseCursors;
}

describe("extension duplicate exclusion", () => {
  it.each(["forward", "backward"] as const)(
    "keeps resident bodies and tuples while advancing the raw %s cursor",
    async (direction) => {
      mockApiAliasPages();
      await actions().search();
      await withVirtualCooldowns(async (advance) => {
        if (direction === "backward") {
          await actions().seek(5000);
          advance(200);
        }
        const before = state();
        const boundary = direction === "forward" ? before.endCursor : before.startCursor;
        const duplicate = before.results[1]!;
        const searchKey = buildSearchKey(before.params);
        const retainedTuple = getRetainedSortValues(duplicate.id, searchKey);
        const fresh = await mock.searchAfter(
          { ...before.params, length: 2 }, boundary, null, undefined, direction === "backward",
        );
        const duplicateTuple: SortValues = ["changed-duplicate", Date.parse(duplicate.uploadTime), duplicate.id];
        const duplicateBody = { ...duplicate, lastModified: "2026-11-06T12:00:00Z" };
        const incoming = direction === "forward"
          ? { hits: [...fresh.hits, duplicateBody], sortValues: [...fresh.sortValues, duplicateTuple] }
          : { hits: [duplicateBody, ...fresh.hits], sortValues: [duplicateTuple, ...fresh.sortValues] };
        vi.mocked(mock.searchAfter).mockClear().mockResolvedValueOnce({ ...fresh, ...incoming });

        if (direction === "forward") await actions().extendForward();
        else await actions().extendBackward();

        const after = state();
        expect(mock.searchAfter).toHaveBeenCalledTimes(1);
        expect(after.results.map((image) => image?.id)).toEqual(
          direction === "forward"
            ? [...before.results, ...fresh.hits].map((image) => image?.id)
            : [...fresh.hits, ...before.results].map((image) => image?.id),
        );
        for (const image of before.results) {
          expect(after.results.find((candidate) => candidate?.id === image!.id)).toBe(image);
          expect(after.imagePositions.get(image!.id)).toBe(before.imagePositions.get(image!.id));
        }
        expect(getRetainedSortValues(duplicate.id, searchKey)).toEqual(retainedTuple);
        fresh.hits.forEach((image, index) => {
          expect(getRetainedSortValues(image.id, searchKey)).toEqual(fresh.sortValues[index]);
          expect(after.imagePositions.get(image.id)).toBe(
            direction === "forward"
              ? before.bufferOffset + before.results.length + index
              : before.bufferOffset - fresh.hits.length + index,
          );
        });
        expect(direction === "forward" ? after.endCursor : after.startCursor).toEqual(duplicateTuple);
        expect(after.total).toBe(before.total);
        if (direction === "backward") expect(after._lastPrependCount).toBe(2);
      });
    },
  );
});

describe("extension duplicate eviction and reversal", () => {
  it.each(["forward", "backward"] as const)(
    "does not poison the surviving boundary after %s eviction and readmits evicted IDs on reversal",
    async (direction) => {
      mockApiAliasPages();
      await actions().search();
      await withVirtualCooldowns(async (advance) => {
        const initial = await mock.searchAfter({ ...state().params, offset: 2000, length: 1000 }, null);
        const searchKey = buildSearchKey(state().params);
        retainSortValues(searchKey, initial.hits, initial.sortValues, true);
        useSearchStore.setState({
          results: initial.hits, bufferOffset: 2000,
          imagePositions: new Map(initial.hits.map((image, index) => [image.id, 2000 + index])),
          startCursor: initial.sortValues[0], endCursor: initial.sortValues.at(-1)!,
        });
        const before = state();
        const duplicateIndex = direction === "forward" ? 2 : 997;
        const duplicate = initial.hits[duplicateIndex];
        const fresh = await mock.searchAfter(
          { ...before.params, length: 2 }, direction === "forward" ? before.endCursor : before.startCursor,
          null, undefined, direction === "backward",
        );
        const changedTuple: SortValues = ["changed-duplicate", Date.parse(duplicate.uploadTime), duplicate.id];
        vi.mocked(mock.searchAfter).mockClear().mockResolvedValueOnce({
          ...fresh,
          hits: direction === "forward" ? [...fresh.hits, { ...duplicate }] : [{ ...duplicate }, ...fresh.hits],
          sortValues: direction === "forward" ? [...fresh.sortValues, changedTuple] : [changedTuple, ...fresh.sortValues],
        });

        if (direction === "forward") await actions().extendForward();
        else await actions().extendBackward();

        expect(state().results).toHaveLength(1000);
        expect(state().bufferOffset).toBe(direction === "forward" ? 2002 : 1998);
        const survivors = direction === "forward" ? initial.hits.slice(2) : initial.hits.slice(0, -2);
        const evicted = direction === "forward" ? initial.hits.slice(0, 2) : initial.hits.slice(-2);
        for (const image of survivors) {
          expect(state().results.find((candidate) => candidate?.id === image.id)).toBe(image);
          expect(state().imagePositions.get(image.id)).toBe(before.imagePositions.get(image.id));
        }
        for (const image of evicted) expect(state().imagePositions.has(image.id)).toBe(false);
        expect(direction === "forward" ? state().startCursor : state().endCursor).toEqual(initial.sortValues[duplicateIndex]);
        expect(getRetainedSortValues(duplicate.id, searchKey)).toEqual(initial.sortValues[duplicateIndex]);
        if (direction === "forward") expect(state()._lastForwardEvictCount).toBe(2);
        else expect(state()._lastPrependCount).toBe(2);

        advance(60);
        const reversedOffset = direction === "forward" ? 1802 : 2198;
        const reversed = await mock.searchAfter({ ...state().params, offset: reversedOffset, length: 1000 }, null);
        vi.mocked(mock.searchAfter).mockClear();
        if (direction === "forward") await actions().extendBackward();
        else await actions().extendForward();

        expect(mock.searchAfter).toHaveBeenCalledTimes(1);
        expect(vi.mocked(mock.searchAfter).mock.calls[0][1]).toEqual(initial.sortValues[duplicateIndex]);
        expect(state().results.map((image) => image?.id)).toEqual(reversed.hits.map((image) => image.id));
        expect(state().bufferOffset).toBe(reversedOffset);
        expect(state().startCursor).toEqual(reversed.sortValues[0]);
        expect(state().endCursor).toEqual(reversed.sortValues.at(-1));
        for (const image of initial.hits.filter((image) => state().imagePositions.has(image.id))) {
          expect(state().imagePositions.get(image.id)).toBe(before.imagePositions.get(image.id));
        }
        for (const image of evicted) expect(state().imagePositions.get(image.id)).toBe(before.imagePositions.get(image.id));
      });
    },
  );
});

describe("authoritative alias cursors", () => {
  it.each(["forward", "backward"] as const)(
    "retains the boundary tuple after %s eviction of API-shaped images",
    async (direction) => {
      const responseCursors = mockApiAliasPages();

      await actions().search();
      await withVirtualCooldowns(async (advance) => {
        if (direction === "backward") {
          await actions().seek(5000);
          advance(200);
        }
        for (let page = 0; page < 5; page++) {
          if (direction === "forward") await actions().extendForward();
          else await actions().extendBackward();
          if (direction === "backward") advance(60);
        }
      });

      expect(state().results).toHaveLength(1000);
      expect(state().bufferOffset).toBeGreaterThan(0);
      const boundary = direction === "forward" ? state().results[0] : state().results.at(-1);
      expect(boundary).toBeDefined();
      expect(boundary?.fileMetadata).toBeUndefined();
      expect(direction === "forward" ? state().startCursor : state().endCursor)
        .toEqual(responseCursors.get(boundary!.id));
      expect(state().error).toBeNull();
    },
  );
});

describe("committed cursor publication", () => {
  it("preserves the authoritative boundary of an unaligned complete focus window", async () => {
    mock = new MockDataSource(70_000);
    useSearchStore.setState({ dataSource: mock });
    registerScrollGeometry({ rowHeight: 303, columns: 3 });
    const responseCursors = mockApiAliasPages();
    vi.spyOn(mock, "countBefore").mockResolvedValue(5000);
    await actions().search();
    await actions().search("img-5000");
    await vi.waitFor(() => {
      expect(state().loading).toBe(false);
      expect(state().sortAroundFocusStatus).toBeNull();
    });

    expect(state().bufferOffset).toBe(4900);
    expect(state().imagePositions.get("img-5000")).toBe(5000);
    expect(state().results[0]?.id).toBe("img-4900");
    expect(state().startCursor).toEqual(responseCursors.get("img-4900"));
    expect(getRetainedSortValues("img-4900", buildSearchKey(state().params)))
      .toEqual(state().startCursor);
  });

  it("retains the fallback first page under the new search identity", async () => {
    const responseCursors = mockApiAliasPages();
    await actions().search();
    useSearchStore.setState({ params: { ...state().params, query: "fallback-query" } });
    await actions().search("img-99999");
    await vi.waitFor(() => {
      expect(state().loading).toBe(false);
      expect(state().sortAroundFocusStatus).toBeNull();
    });

    expect(state().bufferOffset).toBe(0);
    expect(state().results[0]?.id).toBe("img-0");
    const searchKey = buildSearchKey(state().params);
    for (const image of state().results) {
      expect(getRetainedSortValues(image!.id, searchKey)).toEqual(responseCursors.get(image!.id));
    }
  });

  it.each(["fill", "seek", "focus", "restore"] as const)(
    "retains every committed API tuple after %s",
    async (path) => {
      if (path === "fill") {
        mock = new MockDataSource(450);
        useSearchStore.setState({ dataSource: mock });
      }
      const responseCursors = mockApiAliasPages();
      await actions().search();
      if (path === "fill") {
        await vi.waitFor(() => expect(state().results).toHaveLength(450));
      } else if (path === "seek") {
        await actions().seek(5000);
      } else if (path === "focus") {
        actions().setFocusedImageId("img-5000");
        actions().seekToFocused();
        await vi.waitFor(() => {
          expect(state().sortAroundFocusStatus).toBeNull();
          expect(state().results.some((image) => image?.id === "img-5000")).toBe(true);
        });
      } else {
        const target = await mock.searchAfter({ ...state().params, ids: "img-5000", length: 1 }, null);
        await actions().restoreAroundCursor("img-5000", target.sortValues[0], 5000);
      }

      const searchKey = buildSearchKey(state().params);
      expect(state().error).toBeNull();
      for (const image of state().results) {
        expect(image).toBeDefined();
        expect(getRetainedSortValues(image!.id, searchKey), `${path}: ${image!.id}`)
          .toEqual(responseCursors.get(image!.id));
      }
    },
  );
});

describe("superseded neighbour fallback", () => {
  it.each(["resolve", "abort"] as const)("does not publish fallback after a cancelled neighbour lookup (%s)", async (completion) => {
    await actions().search();
    actions().setFocusedImageId("img-50");
    const searchAfter = mock.searchAfter.bind(mock);
    let resolveNeighbours!: (result: SearchAfterResult) => void;
    let rejectNeighbours!: (error: Error) => void;
    const neighbours = new Promise<SearchAfterResult>((resolve, reject) => {
      resolveNeighbours = resolve;
      rejectNeighbours = reject;
    });
    let neighbourSignal: AbortSignal | undefined;
    vi.spyOn(mock, "searchAfter").mockImplementation(async (...args) => {
      const [params, , , signal] = args;
      if (params.query === "query-a" && params.ids === "img-50") {
        return { hits: [], sortValues: [], total: 0 };
      }
      if (params.query === "query-a" && params.ids) {
        neighbourSignal = signal;
        return neighbours;
      }
      const result = await searchAfter(...args);
      if (params.query !== "query-a") return result;
      const excluded = result.hits.findIndex((image) => image.id === "img-50");
      return {
        ...result,
        hits: result.hits.filter((_, index) => index !== excluded),
        sortValues: result.sortValues.filter((_, index) => index !== excluded),
        total: result.total - 1,
      };
    });
    useSearchStore.setState({ params: { ...state().params, query: "query-a" } });
    await actions().search("img-50");
    await vi.waitFor(() => expect(neighbourSignal).toBeDefined());

    useSearchStore.setState({ params: { ...state().params, query: "query-b" } });
    await actions().search(null);
    expect(neighbourSignal?.aborted).toBe(true);
    const currentResults = state().results;
    const firstId = currentResults[0]!.id;
    const searchKey = buildSearchKey(state().params);
    const currentCursor = getRetainedSortValues(firstId, searchKey);
    expect(currentCursor).not.toBeNull();

    if (completion === "abort") rejectNeighbours(new DOMException("superseded", "AbortError"));
    else resolveNeighbours({ hits: [], sortValues: [], total: 0 });
    await flush();
    expect(state().results).toEqual(currentResults);
    expect(getRetainedSortValues(firstId, searchKey)).toEqual(currentCursor);
  });
});

describe("failed replacement navigation", () => {
  it.each([
    ["forward", "seek"], ["backward", "seek"],
    ["forward", "focus"], ["backward", "focus"],
    ["forward", "restore"], ["backward", "restore"],
  ] as const)("releases a cancelled %s extension when %s fails", async (direction, replacement) => {
    await actions().search();
    await waitPastSearchCooldown();
    if (direction === "backward") {
      await actions().seek(5000);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const target = (await mock.getById("img-8000"))!.image;
    const targetCursor: SortValues = [Date.parse(target.uploadTime), target.id];
    vi.spyOn(mock, "searchAfter").mockImplementationOnce((_params, _cursor, _pit, signal) =>
      new Promise<SearchAfterResult>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("superseded", "AbortError")), { once: true });
      }),
    );
    const extension = direction === "forward"
      ? actions().extendForward()
      : actions().extendBackward();
    const inFlight = direction === "forward" ? "_extendForwardInFlight" : "_extendBackwardInFlight";
    expect(state()[inFlight]).toBe(true);

    if (replacement === "focus") {
      vi.mocked(mock.searchAfter).mockResolvedValueOnce({ hits: [target], sortValues: [targetCursor], total: 1 });
    }
    vi.mocked(mock.searchAfter).mockRejectedValueOnce(new Error("fixture navigation failure"));
    if (replacement === "seek") await actions().seek(8000);
    else if (replacement === "restore") await actions().restoreAroundCursor(target.id, targetCursor, 8000);
    else {
      actions().setFocusedImageId(target.id);
      actions().seekToFocused();
      await vi.waitFor(() => expect(state().sortAroundFocusStatus).toBeNull());
    }
    await extension;

    expect(state()[inFlight]).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const callsBefore = vi.mocked(mock.searchAfter).mock.calls.length;
    if (direction === "forward") await actions().extendForward();
    else await actions().extendBackward();
    expect(vi.mocked(mock.searchAfter).mock.calls.length).toBeGreaterThan(callsBefore);
  });
});

describe("superseded cursor publication", () => {
  it.each([
    ["forward", false],
    ["backward", false],
    ["forward", true],
    ["backward", true],
  ] as const)("ignores a superseded %s page (same search: %s)", async (direction, sameSearch) => {
    await actions().search();
    await waitPastSearchCooldown();
    if (direction === "backward") {
      await actions().seek(5000);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const oldPage = await mock.searchAfter(
      { ...state().params, length: 1 },
      direction === "forward" ? state().endCursor : state().startCursor,
      null,
      undefined,
      direction === "backward",
    );
    const oldImage = oldPage.hits[0];
    const refreshedTime = Date.parse(oldImage.uploadTime) + 1000;
    const newImage = { ...oldImage, uploadTime: new Date(refreshedTime).toISOString() };
    const newCursor: SortValues = [refreshedTime, newImage.id];
    let resolveOldPage!: (result: SearchAfterResult) => void;
    const delayedPage = new Promise<SearchAfterResult>((resolve) => { resolveOldPage = resolve; });
    let extensionSignal: AbortSignal | undefined;
    vi.spyOn(mock, "searchAfter").mockImplementationOnce((_params, _cursor, _pit, signal) => {
      extensionSignal = signal;
      return delayedPage;
    });
    const extension = direction === "forward"
      ? actions().extendForward()
      : actions().extendBackward();

    const nextParams = { ...state().params, query: sameSearch ? state().params.query : "changed-query" };
    useSearchStore.setState({ params: nextParams, focusedImageId: null, _phantomFocusImageId: null });
    vi.mocked(mock.searchAfter).mockResolvedValueOnce({
      ...oldPage, hits: [newImage], sortValues: [newCursor],
    });
    await actions().search();
    expect(extensionSignal?.aborted).toBe(true);
    expect(getRetainedSortValues(newImage.id, buildSearchKey(nextParams))).toEqual(newCursor);

    resolveOldPage(oldPage);
    await extension;
    expect(getRetainedSortValues(newImage.id, buildSearchKey(nextParams))).toEqual(newCursor);
    expect(state().results).toEqual([newImage]);
  });
});

// ---------------------------------------------------------------------------
// Bug #14 — forward eviction
// ---------------------------------------------------------------------------

describe("bug #14 — forward eviction cursor preservation", () => {
  it("startCursor is preserved when extractSortValues returns null during forward eviction", async () => {
    // Setup: search (200 items) + waitPastCooldown + 4 extends → 1000 items
    // (exactly at BUFFER_CAPACITY=1000, no eviction yet)
    await actions().search();
    await waitPastSearchCooldown();

    for (let i = 0; i < 4; i++) {
      await actions().extendForward();
      await flush();
    }

    expect(state().results.length).toBe(1000);
    const cursorBeforeEviction = state().startCursor;
    expect(cursorBeforeEviction).not.toBeNull();

    // Simulate the failure: next extractSortValues call returns null.
    // The 5th extend pushes buffer to 1200 > 1000 → eviction of 200 from
    // start → extractSortValues is called on the new first item → returns null.
    retainSortValues(buildSearchKey(state().params), [], [], true);
    _simulateNullCursor = true;
    await actions().extendForward();
    await flush();

    expect(_simulateNullCursor).toBe(false);
    // Eviction should have happened (buffer still at capacity)
    expect(state().results.length).toBe(1000);
    expect(state().bufferOffset).toBeGreaterThan(0);

    // BUG: with current code, startCursor is null after eviction when
    //      extractSortValues returns null → extendBackward is permanently blocked.
    // FIX: startCursor should be preserved from the pre-eviction value.
    expect(state().startCursor).not.toBeNull();

    // Consequence test: extendBackward must not be blocked by the null guard.
    // bufferOffset > 0 so the "already at start" guard doesn't fire.
    // The preserved cursor points to position 0 (pre-eviction start), so ES
    // returns 0 items before it — but the key point is that a fetch was made
    // (guard didn't short-circuit at `!startCursor`).
    const requestsBefore = mock.requestCount;
    await actions().extendBackward();
    await flush();

    // If extendBackward was blocked at !startCursor (bug), no request is made.
    // If it ran (fix), a searchAfter request was issued.
    expect(mock.requestCount).toBeGreaterThan(requestsBefore);
  });
});

// ---------------------------------------------------------------------------
// Bug #14 — backward eviction (symmetric)
// ---------------------------------------------------------------------------

describe("bug #14 — backward eviction cursor preservation", () => {
  it("endCursor is preserved when extractSortValues returns null during backward eviction", async () => {
    // Search first to establish total, then seek mid-corpus.
    // seek() clamps to [0, total-1] so total must be known.
    await actions().search();
    await waitPastSearchCooldown();

    // Seek to position 5000 so there are 5000 items to extend backward into.
    // seek() fetches PAGE_SIZE=200 items centered around 5000.
    await actions().seek(5000);
    await new Promise((r) => setTimeout(r, 200)); // wait past SEEK_COOLDOWN_MS=100ms

    // 4 backward extends (200 items each) → 200 + 4×200 = 1000 (at capacity).
    // Wait > POST_EXTEND_COOLDOWN_MS=50ms between each.
    for (let i = 0; i < 4; i++) {
      await actions().extendBackward();
      await waitPastExtendCooldown();
    }

    expect(state().results.length).toBe(1000);
    const cursorBeforeEviction = state().endCursor;
    expect(cursorBeforeEviction).not.toBeNull();

    // Simulate the failure: next extractSortValues call returns null.
    // The 5th backward extend pushes buffer to 1200 > 1000 → eviction of
    // 200 from end → extractSortValues called on new last item → returns null.
    retainSortValues(buildSearchKey(state().params), [], [], true);
    _simulateNullCursor = true;
    await actions().extendBackward();
    await waitPastExtendCooldown();

    expect(_simulateNullCursor).toBe(false);
    expect(state().results.length).toBe(1000);

    // BUG: endCursor is null → extendForward is permanently blocked.
    // FIX: endCursor should be preserved.
    expect(state().endCursor).not.toBeNull();

    // Consequence test: extendForward must not be blocked by a null endCursor.
    // Wait past the POST_EXTEND_COOLDOWN_MS set by the last extendBackward.
    await waitPastExtendCooldown();

    const totalBefore = state().bufferOffset + state().results.length;
    await actions().extendForward();
    await flush();

    // If extendForward was blocked (bug), the global end doesn't advance.
    // If it ran (fix), the buffer end advances.
    const totalAfter = state().bufferOffset + state().results.length;
    expect(totalAfter).toBeGreaterThan(totalBefore);
  });
});
