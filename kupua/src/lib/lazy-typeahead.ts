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

// Re-export so callers don't need to change their imports
export { TypeaheadField, TextSuggestionOption };

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

  constructor(fields: TypeaheadField[]) {
    super(fields);
    this._fields = fields;
    this._fieldOptions = fields.map((f) => f.toSuggestionOption());
  }

  // -----------------------------------------------------------------------
  // Override: decouple key suggestions from value resolution
  // -----------------------------------------------------------------------

  public override getSuggestions(
    program: CqlQuery,
    signal?: AbortSignal
  ): Promise<TypeaheadSuggestion[]> {
    return new Promise((resolve, reject) => {
      // Abort any in-flight request (matches parent behaviour)
      this._abortController?.abort();

      if (!program.content) {
        return resolve([]);
      }

      const abortController = new AbortController();
      this._abortController = abortController;
      abortController.signal.addEventListener("abort", () => {
        reject(new DOMException("Aborted", "AbortError"));
      });

      const cqlFields = getCqlFieldsFromBinary(program.content);
      const promises = cqlFields.map((field) =>
        this.suggestField(field, signal)
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
      return keySuggestions;
    }

    const maybeValueSuggestions = resolver.resolveSuggestions(valueStr, signal);
    if (!maybeValueSuggestions) {
      return keySuggestions;
    }

    const valueSuggestions = await maybeValueSuggestions;

    return [
      ...keySuggestions,
      {
        from: value ? value.start - 1 : key.end, // extend backwards into chipKey's ':'
        to: value ? value.end : key.end,
        position: "chipValue" as const,
        suggestions: valueSuggestions,
        type: "TEXT" as const,
        suffix: " ",
      },
    ];
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

