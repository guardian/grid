import { createParser, TypeaheadField } from "@guardian/cql";
import { describe, expect, it } from "vitest";
import { LazyTypeahead } from "./lazy-typeahead";

const parser = createParser({ shortcuts: { "#": "label", "~": "collection" } });

function parseOrThrow(query: string) {
  const { queryAst, error } = parser(query);
  // A field with an empty value (e.g. "credit:") produces a non-fatal
  // "needs a value after it" error alongside a perfectly valid queryAst —
  // this is the normal, expected state while a chip is mid-composition.
  // getSuggestions doesn't gate on `error`, only on `queryAst` being present.
  if (!queryAst) {
    throw new Error(`Failed to parse "${query}": ${error?.message}`);
  }
  return queryAst;
}

describe("LazyTypeahead — live query ref", () => {
  it("updates the ref with the up-to-date query string before resolving, for a field key that was just a quoted phrase a moment ago", async () => {
    const liveQueryRef: { current: string | undefined } = { current: undefined };
    const typeahead = new LazyTypeahead([], undefined, undefined, liveQueryRef);

    // This is exactly the bug scenario: a quoted phrase containing a colon
    // ("fileMetadata.xmp.dc:subject") has just been turned into a chip key
    // by typing ":" — the value is still empty.
    const queryAst = parseOrThrow('"fileMetadata.xmp.dc:subject":');

    await typeahead.getSuggestions(queryAst);

    expect(liveQueryRef.current).toBe('"fileMetadata.xmp.dc:subject":');
  });

  it("updates the ref for a normal committed chip too", async () => {
    const liveQueryRef: { current: string | undefined } = { current: undefined };
    const typeahead = new LazyTypeahead([], undefined, undefined, liveQueryRef);

    const queryAst = parseOrThrow("credit:Reuters");
    await typeahead.getSuggestions(queryAst);

    expect(liveQueryRef.current).toBe("credit:Reuters");
  });

  it("sets the ref to undefined for an empty query", async () => {
    const liveQueryRef: { current: string | undefined } = { current: "stale" };
    const typeahead = new LazyTypeahead([], undefined, undefined, liveQueryRef);

    const queryAst = parseOrThrow("");
    await typeahead.getSuggestions(queryAst);

    expect(liveQueryRef.current).toBeUndefined();
  });

  it("updates the ref BEFORE calling the dynamic field fallback — proves the fallback can read a non-stale query", async () => {
    const liveQueryRef: { current: string | undefined } = { current: undefined };
    let refValueAtFallbackCallTime: string | undefined;

    const typeahead = new LazyTypeahead(
      [],
      undefined,
      async () => {
        // Capture the ref's value exactly when the fallback fires — this
        // is what a real getParams()-consulting resolver would see.
        refValueAtFallbackCallTime = liveQueryRef.current;
        return undefined;
      },
      liveQueryRef,
    );

    const queryAst = parseOrThrow('"fileMetadata.xmp.dc:subject":');
    await typeahead.getSuggestions(queryAst);

    expect(refValueAtFallbackCallTime).toBe('"fileMetadata.xmp.dc:subject":');
  });

  it("still resolves suggestions correctly for a registered static field", async () => {
    const liveQueryRef: { current: string | undefined } = { current: undefined };
    const field = new TypeaheadField(
      "credit",
      "credit",
      "",
      async (value: string) => [{ label: undefined, value: "Reuters" }].filter((s) => s.value.includes(value)),
      "TEXT",
    );
    const typeahead = new LazyTypeahead([field], undefined, undefined, liveQueryRef);

    const queryAst = parseOrThrow("credit:");
    const suggestions = await typeahead.getSuggestions(queryAst);

    expect(suggestions.some((s) => s.suggestions.some((opt) => opt.value === "Reuters"))).toBe(true);
  });
});
