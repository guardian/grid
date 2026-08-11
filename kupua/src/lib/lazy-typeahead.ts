/**
 * LazyTypeahead — drop-in replacement for @guardian/cql's `Typeahead` that
 * only fires value resolvers once the user has committed a field key (typed
 * the `:`).  This matches Grid/kahuna's behaviour and avoids two problems:
 *
 *   1. **Eager evaluation bug** — CQL's built-in `Typeahead.suggestCqlField()`
 *      fires key and value resolvers in parallel via `Promise.all`.  If the
 *      value resolver is slow (ES aggregation) or fails (text field), the
 *      entire popover stalls in a "pending" state even though key suggestions
 *      (instant, synchronous) are already available.
 *
 *   2. **Wasted work** — when the user is still typing a field name (`+by`),
 *      there's no point hitting ES for value suggestions; the user hasn't
 *      expressed intent to search that field's values yet.
 *
 * Implementation: we subclass `Typeahead` (so it passes TypeScript's
 * structural check where `createCqlInput` expects a `Typeahead`) but
 * completely override `getSuggestions` with our own logic that:
 *   - Always returns key suggestions immediately
 *   - Only calls the value resolver when `CqlField.value` is defined
 *     (i.e. the parser has seen a `:`)
 */

import {
  Typeahead,
  TypeaheadField,
  TextSuggestionOption,
  CqlQuery,
  CqlField,
  CqlBinary,
  CqlExpr,
} from "@guardian/cql";
import { queryStrFromAst } from "@/lib/cql-ast-serialize";

/** Value-suggestion resolver for a field with no static `TypeaheadField`. */
export type DynamicFieldFallback = (
  fieldId: string,
  value: string,
  signal?: AbortSignal,
) => Promise<TextSuggestionOption[] | undefined>;

// ---------------------------------------------------------------------------
// Inlined from @guardian/cql's lang/utils.ts — the package doesn't expose
// subpath imports, so Vite can't resolve deep imports like
// "@guardian/cql/dist/lang/utils".
// ---------------------------------------------------------------------------

function getCqlFieldsFromExpr(expr: CqlExpr): CqlField[] {
  return expr.content.type === "CqlField" ? [expr.content] : [];
}

function getCqlFieldsFromBinary(binary: CqlBinary): CqlField[] {
  return getCqlFieldsFromExpr(binary.left).concat(
    binary.right ? getCqlFieldsFromBinary(binary.right.binary) : []
  );
}

// ---------------------------------------------------------------------------
// Infer the TypeaheadSuggestion type from the parent's getSuggestions return
// type — avoids importing from a non-exported subpath.
// ---------------------------------------------------------------------------

type TypeaheadSuggestion = Awaited<
  ReturnType<Typeahead["getSuggestions"]>
>[number];

/**
 * Filter + sort: items that start with the query come first, then items
 * that contain it.  Matches the logic in CQL's built-in
 * `filterAndSortTextSuggestionOption`.
 */
function filterAndSort(
  options: TextSuggestionOption[],
  str: string
): TextSuggestionOption[] {
  const lower = str.toLowerCase();
  return options
    .filter(
      (o) =>
        o.value.toLowerCase().includes(lower) ||
        (o.label?.toLowerCase() ?? "").includes(lower)
    )
    .sort((a, b) => {
      const aStarts =
        a.value.toLowerCase().startsWith(lower) ||
        (a.label?.toLowerCase() ?? "").startsWith(lower);
      const bStarts =
        b.value.toLowerCase().startsWith(lower) ||
        (b.label?.toLowerCase() ?? "").startsWith(lower);
      if (aStarts === bStarts) return 0;
      return aStarts ? -1 : 1;
    });
}

export class LazyTypeahead extends Typeahead {
  /**
   * We stash our own copy of the fields array because the parent's is
   * private.  The parent constructor still gets the fields (for any
   * internal bookkeeping), but we never call `super.getSuggestions`.
   */
  private _fields: TypeaheadField[];
  private _fieldOptions: TextSuggestionOption[];
  private _abortController: AbortController | undefined;
  private _dynamicFieldFallback?: DynamicFieldFallback;
  private _liveQueryRef?: { current: string | undefined };

  /**
   * @param fields          All typeahead fields (key + value resolvers).
   * @param hiddenFieldIds  Field IDs that have value resolvers but should
   *                        NOT appear in key suggestions (e.g. colourModel).
   * @param dynamicFieldFallback  Called only when the typed key doesn't match
   *                        any static field AND looks like a real ES path
   *                        (contains a `.`) — attempts value suggestions for
   *                        arbitrary, unregistered field paths (e.g.
   *                        fileMetadata.xmp.dc:creator). Returns undefined
   *                        when the field isn't aggregatable or has no data.
   * @param liveQueryRef    Written on every getSuggestions call with the
   *                        CURRENT query, serialized from the live AST
   *                        we're given — not the search store's committed
   *                        query, which lags behind by one event (the
   *                        store only updates once our own `queryChange`
   *                        listener runs, which happens after the widget's
   *                        own suggestion pass). Callers whose resolvers
   *                        self-scope via getParams() should have their
   *                        getParams() implementation prefer this ref's
   *                        value over the store's, so a field that was
   *                        free text a moment ago (e.g. a quoted ES path
   *                        just turned into a chip key) doesn't get its
   *                        aggregation wrongly scoped by that stale,
   *                        pre-chip free-text content. See deviations.md.
   */
  constructor(
    fields: TypeaheadField[],
    hiddenFieldIds?: Set<string>,
    dynamicFieldFallback?: DynamicFieldFallback,
    liveQueryRef?: { current: string | undefined },
  ) {
    super(fields);
    this._fields = fields;
    this._fieldOptions = fields
      .filter((f) => !hiddenFieldIds?.has(f.id))
      .map((f) => f.toSuggestionOption());
    this._dynamicFieldFallback = dynamicFieldFallback;
    this._liveQueryRef = liveQueryRef;
  }

  // -----------------------------------------------------------------------
  // Override: decouple key suggestions from value resolution
  // -----------------------------------------------------------------------

  public override getSuggestions(
    program: CqlQuery,
    // Accepted to match the parent's override signature, but deliberately
    // NOT forwarded to suggestField below — see the comment on
    // abortController.signal for why.
    _signal?: AbortSignal
  ): Promise<TypeaheadSuggestion[]> {
    return new Promise((resolve, reject) => {
      // Abort any in-flight request (matches parent behaviour)
      this._abortController?.abort();

      if (this._liveQueryRef) {
        this._liveQueryRef.current = program.content
          ? queryStrFromAst(program)
          : undefined;
      }

      if (!program.content) {
        return resolve([]);
      }

      const abortController = new AbortController();
      this._abortController = abortController;
      abortController.signal.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });

      const cqlFields = getCqlFieldsFromBinary(program.content);
      // Use OUR OWN abortController.signal, not the widget's external
      // `_signal` — the widget aborts its signal on its own internal
      // schedule (opaque to us), which can race ahead of and cancel a
      // still-relevant, still-current fetch even though nothing newer has
      // actually superseded it from our own bookkeeping's point of view.
      // Our own controller already gets aborted above whenever a NEWER
      // getSuggestions call truly supersedes this one.
      //
      // NOTE — this signal only actually cancels the dynamic-field
      // fallback path (buildDynamicFieldFallback threads it through to
      // dataSource.getAggregations). Registered static fields' resolvers
      // (CqlSearchInput.tsx's `cqlResolver`) are wrapped as a single-arg
      // `async (_fieldName: string) => ...` that drops the second `signal`
      // parameter entirely, and `scopedAgg` (typeahead-fields.ts) doesn't
      // pass a signal to `getAggregations` at all — so static-field
      // aggregations remain uncancellable on rapid keystrokes regardless
      // of this fix. Review finding F5: fixing that would mean changing
      // the static resolver signature and scopedAgg's call, a separate
      // and larger change not made here.
      const promises = cqlFields.map((field) =>
        this.suggestField(field, abortController.signal)
      );

      Promise.all(promises)
        .then((results) => resolve(results.flat()))
        .catch(reject);
    });
  }

  // -----------------------------------------------------------------------
  // Our own suggestion logic
  // -----------------------------------------------------------------------

  private async suggestField(
    q: CqlField,
    signal?: AbortSignal
  ): Promise<TypeaheadSuggestion[]> {
    const { key, value } = q;

    // --- Key suggestions (always instant) ---
    const keySuggestions = this.suggestKey(key);

    // --- Value suggestions ---
    // This method is only called for CqlField nodes, which means the user
    // has typed `:`.  `value` is undefined when nothing has been typed
    // AFTER the colon — but we still fire the resolver with "" so the
    // popover shows all available values immediately (matching the
    // behaviour of the original CQL Typeahead).
    const fieldId = key.literal ?? "";
    const valueStr = value?.literal ?? "";
    const resolver = this._fields.find((f) => f.id === fieldId);

    if (!resolver) {
      // Unregistered key — try the dynamic fallback only for paths that
      // look like real ES field paths (dotted). Bare typos of registered
      // field names (no dot) skip the round-trip entirely. Fields that ARE
      // registered but resolver-less (city, country, ...) are found above
      // and never reach here — they keep showing no value suggestions with
      // no wasted round-trip, same as today.
      if (this._dynamicFieldFallback && fieldId.includes(".")) {
        const dynamicSuggestions = await this._dynamicFieldFallback(fieldId, valueStr, signal);
        if (dynamicSuggestions?.length) {
          return [...keySuggestions, this.buildValueSuggestion(key, value, dynamicSuggestions)];
        }
      }
      return keySuggestions;
    }

    const maybeValueSuggestions = resolver.resolveSuggestions(valueStr, signal);
    if (!maybeValueSuggestions) {
      return keySuggestions;
    }

    const valueSuggestions = await maybeValueSuggestions;

    return [...keySuggestions, this.buildValueSuggestion(key, value, valueSuggestions)];
  }

  private buildValueSuggestion(
    key: { end: number },
    value: { start: number; end: number } | undefined,
    suggestions: TextSuggestionOption[],
  ): TypeaheadSuggestion {
    return {
      from: value ? value.start - 1 : key.end, // extend backwards into chipKey's ':'
      to: value ? value.end : key.end,
      position: "chipValue" as const,
      suggestions,
      type: "TEXT" as const,
      suffix: " ",
    };
  }

  private suggestKey(
    keyToken: { literal?: string; start: number; end: number }
  ): TypeaheadSuggestion[] {
    const str = keyToken.literal ?? "";

    let matches: TextSuggestionOption[];
    if (str === "") {
      matches = this._fieldOptions;
    } else {
      const filtered = filterAndSort(this._fieldOptions, str);
      if (filtered.length === 0) return [];
      matches = filtered;
    }

    return [
      {
        from: keyToken.start,
        to: Math.max(keyToken.start, keyToken.end - 1), // exclude ':'
        position: "chipKey" as const,
        suggestions: matches,
        type: "TEXT" as const,
        suffix: ":",
      },
    ];
  }
}

