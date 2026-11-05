# Date/time search across Grid, Kahuna and API-backed Kupua

**Research date:** 16 October 2026. **Source baseline:** working tree at `80ff9da44`.

**Scope:** search syntax, date controls and chips, URL/request representation, relative-time evaluation, timezones and boundary semantics. Kupua's media-api path is the primary target; direct Elasticsearch mode is included where it explains existing incompatibilities. This is research and a recommendation, not authorization to implement changes.

## 1. Executive assessment

Adding hours to `usages@>added:2026-10-10` is a backend date-grammar change, not simply a richer date picker. Both frontends can carry a timestamp as a chip value, but accepting text in the editor is not the same as interpreting it as a date in media-api.

There are already distinct date systems:

- **Date-range controls:** local-calendar helpers produce absolute UTC timestamp parameters. Their friendly relative labels are not persisted relative expressions.
- **Query chips:** retain textual values inside `query` in the browser and `q` in the API. The backend decides what those values mean.
- **Time-dependent backend filters:** may evaluate the current time without any date literal being visible in the URL.
- **Kupua browsing freeze:** a separate upload-time cap used for pagination/history. It does not turn relative chip text into an absolute query.

The recommended direction is **reuse of the existing top-level date-bound parser as a fallback for backend comparison values**, preserving legacy chip parsing and sharing the enhancement across Kahuna's existing search and the new media-api reads—not a usage-specific timestamp grammar. Section 8 enumerates the affected comparison chips; whole-period expressions use a separate parser and remain unchanged. The shared parser also accepts relative duration strings; section 9.1 distinguishes those from picker-generated absolute values and from existing chip boundary semantics. Do not add a Kupua-only `usageSince` parameter or silently rewrite this usage filter into the upload-date picker. Do not invent a new rolling-relative-date language as part of the hours change.

## 2. Terminology: four representations that must not be confused

| Representation | Example | What it means |
|---|---|---|
| Helper label | Today; Past 24 hours | A UI action; not necessarily saved as a relative expression. |
| Chip/query text | `usages@>added:2026-10-10` | A field/value expression, serialized inside the browser's `query` parameter. |
| Browser date parameters | `since=2026-10-10T13:00:00.000Z` | Separate top-level filter parameters; not usage-date filters. |
| Backend request | `q=…`, or JSON `{ "q": "…", "since": "…" }` | Query text plus independently applied date bounds. |

`dateField` is UI selection state, not a universal backend field switch. The field-specific parameter names carry the actual range. A date chip, date dropdown and date sort can all refer to different fields simultaneously.

## 3. Kahuna: controls, helpers and chips

### 3.1 The separate date-range dropdown

The search form uses `gu-date-range`, offering Upload time, Date taken and Last modified. Its availability is conditional on the legacy-filter UI configuration. [K1][K2]

| Field choice | Browser parameters populated |
|---|---|
| Upload time | `since`, `until`; default/absent `dateField` |
| Date taken | `takenSince`, `takenUntil`, `dateField=taken` |
| Last modified | `modifiedSince`, `modifiedUntil`, `dateField=modified` |

Choosing/applying a range clears the other date families. Initial URL reading selects which family to display using `dateField`; it does not merge them into one universal date predicate. [K2]

The helpers are:

| Label | Computation |
|---|---|
| Anytime | No lower bound |
| Today | Browser-local start of the day |
| Past 24 hours | Current instant minus 24 elapsed hours |
| Past week | Current local date/time minus 7 calendar days |
| Past 6 months | Minus 6 calendar months |
| Past year | Minus 1 calendar year |

**Important lifetime detail:** Kahuna computes the preset ISO strings when the search controller initializes, not afresh on every eventual click. They can be stale if that controller remains alive. Selecting one saves an absolute lower bound; there is no persisted `past24Hours` expression and no moving lower bound. [K2]

Custom inputs use date-only Pikaday controls with keyboard input disabled. Saving normalizes the start to local `00:00:00.000` and the end to local `23:59:59.999`, then serializes via Moment's `toISOString()` to UTC. The visible format is date-only (`DD-MMM-YYYY`). Arbitrary hours cannot be chosen through this search control. [K3]

Kahuna also has a reusable **different** `gu-date` component with a time picker and `HH:mm` display. That is not the component mounted by the search date range; its existence does not establish hour-level search UI support. [K4]

### 3.2 Query chips are text, not date widgets

The legacy structured-query parser recognizes keys containing `@`, `<` and `>` and generic values. It neither parses dates nor resolves relative date words. Chip rendering quotes whitespace/colon-containing values. Thus both an ISO timestamp and `not-a-date` can be valid frontend chip text without being valid backend dates. [K5]

Kahuna's `use-cql-chips` switch chooses between its legacy Angular chips and the newer `@guardian/cql` component. The latter defaults fields to `TEXT`. Although the local type permits `DATE`, the configured `date`, `dateTaken`, `usages@<added` and `usages@>added` fields do not opt into it and have no date-value resolver. **Neither path activates a relative/absolute date helper inside these chips.** [K6][K7]

Kahuna's syntax help documents usage comparisons only with `YYYY-MM-DD`, described as “after” and “before”. It does not explain exact endpoint inclusion, hours, offsets or relative-date semantics. [K8]

### 3.3 URL timestamps, transport and hidden time bounds

Kahuna forwards the browser's `query` as API `q`, and forwards all six bound parameters. It follows the API's search link with a GET request; `dateField` stays in browser state. [K9]

An hour-bearing URL can retain its timestamp on initial load, opening the picker and Cancel, although the summary hides the time. **Saving a custom range reconstructs both endpoints as whole-day boundaries**, even when the incoming values had hours. This differs from Kupua's untouched draft-string preservation. [K3]

Kahuna also has a hidden upload-time boundary. Ordinary initialization first requests a single newest result; result initialization records the explicit URL `until`, or the current ISO timestamp if none exists. Subsequent paging supplies this stored `lastSearchFirstResultTime` as `until`. It is not inserted into the visible URL. New-image polling uses that boundary as `since` and the explicit URL upper bound, or no upper bound, while preserving taken/modified filters and query text. AI search does not start that polling. **This does not refresh a Past week lower bound or resolve textual relative chips in the browser.** [K10]

## 4. Kupua: the same broad model, with some different details

### 4.1 Date dropdown

Kupua's `DateFilter` offers the same three fields and six presets. It writes the same six bound parameters, clears other families on apply, and resets all of them for Anytime. It has no usage-date field. [U1]

- Preset strings are calculated by `makePresets()` during React render. This is fresher than Kahuna's controller-initialization snapshot, but **not a timer**: an already-rendered button keeps its value until a render recomputes it.
- Today uses `startOfToday()`; the others use date-fns `subHours`, `subDays`, `subMonths`, `subYears`. All are serialized using `toISOString()`.
- A preset applies immediately and clears the upper bound. It does not save the preset name.
- Custom input is `type="date"`, not `datetime-local`. From becomes local midnight; To becomes local end-of-day.
- URL values are held as strings. Opening/cancelling the dropdown does not itself truncate a timestamp. Changing a calendar endpoint rebuilds that endpoint at start/end of day.
- Existing timestamps are displayed as local dates only. Hours, minutes and offset are hidden even though they remain in draft/URL state if untouched.
- Preset highlighting permits a two-hour difference for non-Today presets. A highlighted “Past 24 hours” button is therefore **not proof of a rolling window**, or even of an exact 24-hour-old bound. Today matching is exact.
- Malformed active bounds display “Invalid date”, set `aria-invalid`, and show blank date inputs. This is presentation, not schema-level rejection of the URL.

These facts are in the component and its existing tests. [U1][U2]

### 4.2 Chips and the unused library date helpers

Kupua uses `@guardian/cql` 1.8.6 in the inspected installation. Its editor disables groups/operators and enables `#` and `~` shortcuts. All configured typeahead fields are explicitly constructed with type `TEXT`; its custom `LazyTypeahead` also emits text suggestions. Date keys have no value resolver. [U3][U4][U5]

The installed library contains a DATE popover with Relative and Absolute tabs. Its relative suggestions include `-1d`, `-7d`, `-14d`, `-30d` and `-1y`; its absolute input is date-only. **These are library capabilities, not active Grid/Kupua syntax.** Merely switching the field type to DATE would expose a vocabulary that needs a separate backend contract; it is not a safe implementation of this request. Kupua's TEXT-only lazy suggestion implementation would also need consideration. [L1][L2]

The editor's effective-query logic strips incomplete chips and cosmetic quotes; it does not resolve dates. The AST serializer quotes chip values containing colons, so a timestamp is normally serialized in this form:

```text
usages@>added:"2026-10-10T14:00:00Z"
```

**This illustrates frontend serialization, not currently supported backend timestamp syntax.** A local, network-free probe confirmed that the installed CQL parser preserves both unquoted UTC timestamps and quoted offset timestamps as complete chip values. Colons in the value are not the frontend blocker. [U6][U7]

### 4.3 URL and new media-api transport

The URL schema accepts each date parameter as an optional string; it does not validate ISO format or convert relative expressions. The plain URL codec uses `URLSearchParams`, preserves strings, keeps colons readable and encodes literal plus signs. A positive offset must be URL-encoded as `%2B`, not pasted as a raw `+` that form decoding would turn into a space. [U8][U9]

`buildReadBody` copies the query to `q` (plus the existing default-hide clauses) and copies all six date bounds unchanged. It does **not** transmit `dateField`. This body builder is shared by ordered reads and ancillary counts/aggregations/profiles/keys. The UI can show only one selected date family while a manually composed URL contains several; all supplied families can reach the backend. [U10][U11]

The AI path uses `GET /images` with `aiQuery` plus the same mapped query/filters, rather than the ordered JSON endpoint. It does not introduce another client date parser. [U10]

### 4.4 The hidden upload freeze is not a relative-search feature

Kupua records `newCountSince` after an ordinary initial search completes. Later extend/seek/fill requests add an upload `until` cap, retaining an earlier explicit user upper bound. Browser-history snapshots can restore this cap; it is not a date-helper label saved in the shared URL. API mode currently opens no PIT. [U12][U13][U14]

Consequences:

1. A chip such as `date:today` stays textual; the freeze does not rewrite it or freeze its backend evaluation.
2. A usage-date query can additionally acquire an **upload-time** cap. That does not cap the timestamps of later usage edits on already-uploaded images.
3. New-arrival polling uses a newer upload `since` and retains the rest of the query. It is separate from a rolling date-helper lower bound.
4. First-page results, later requests and counts are not one immutable temporal snapshot merely because an upload cap exists.
5. History restoration and copying a URL are different: history/session snapshots may carry the arrival boundary; the shared URL contains the explicit query and date params, not all that browsing state.

**Existing offset caveat:** freeze/history/poll code compares some timestamp strings lexicographically. This is safe only under a sufficiently uniform representation, not for arbitrary offset-equivalent ISO strings. For example, a user `until=2026-10-16T17:00:00+02:00` is 15:00Z, earlier than a 16:00Z freeze, but its text sorts later; the comparison can choose the wrong bound. Helper-generated canonical UTC strings avoid that particular offset case. Do not advertise arbitrary manually entered offset bounds as uniformly safe across the entire client lifecycle without fixing or explicitly normalizing these comparisons. This caveat does not prevent a server-parsed timestamp inside a usage chip, which does not occupy `params.until`. [U12][U13]

## 5. Timezones and precision in the visible controls

**Local calendar in; UTC instant out; local calendar on display.** Neither frontend's helper means “UTC day” unless the browser itself is in UTC.

For a browser in Europe/London on 10 October 2026:

```text
Local From 2026-10-10 00:00  →  2026-10-09T23:00:00.000Z
Local To   2026-10-10 23:59:59.999  →  2026-10-10T22:59:59.999Z
```

The backend sees explicit UTC instants, not the browser timezone name. A recipient elsewhere sees the same instant displayed on their own local calendar. Do not infer the timezone of a bare chip date from the dropdown's local-calendar behavior.

- An elapsed 24-hour subtraction is not a calendar-day subtraction across a DST transition.
- A local custom day can span 23 or 25 hours.
- Past week/month/year are calendar operations; do not promise fixed counts of elapsed hours.
- Browser clock accuracy affects frontend-produced absolute presets and Kupua's arrival boundary.
- Milliseconds already exist in helper-generated URLs even though neither search picker exposes them.
- Kupua's ordinary metadata date formatter displays local `dd MMM yyyy HH:mm`; that does not make the separate date-filter label show hours, nor make a date column a date-filter chip. [U15]

## 6. Direct-ES compatibility warning

Direct mode must not be used as proof that a syntax works through media-api.

- Its usage comparison translator puts the value directly into an ES `gte`/`lte` range on `usages.dateAdded`; no Scala-style date parsing happens there. Timestamp/date-math acceptance is consequently delegated to ES, not the media-api grammar.
- Its top-level date-bound builder emits strict `gt`/`lt`, normalizing only bare `YYYY-MM-DD` to UTC midnight.
- Its generic CQL translator does not implement the backend's complete named-date/relative-alias grammar. A field being suggested by the UI is not proof of direct-mode semantic parity.
- In particular, forwarding a bare date directly to ES can produce different missing-component/upper-bound rounding from first turning it into an explicit midnight instant. Do not rely on direct-mode tests that merely assert the outgoing string to establish parity of matching results.

The existing tests confirm outgoing direct-ES range shapes; they do not prove the backend and ES interpret every input identically. [D1][D2][D3]

## 7. Backend chip parsing: comparisons are not whole-period searches

The relevant grammar has two distinct routes: [B6][B7]

- **Comparison chips** (`>date:…`, `<taken:…`, `usages@>added:…`, etc.) use `DateConstraintMatch` → `DateMatch` → `MatchDateValue` → `parseDate`. The nested usage route calls the same comparison rule.
- **Whole-period expressions** (`date:2026-10-10`, `taken:today`, `@2026-10-10`, etc.) use `MatchDateRangeValue` → `parseDateRange`. They are not the target of the proposed precision extension.

The comparison rule recognizes the date names `date`, `uploaded`, `taken` and `added`. `date` and `uploaded` are upload-date aliases. The only recognized nested parent is `usages`. Generic field suggestions, including the UI's `dateTaken` suggestion, do not expand this list of comparison aliases.

Current comparison values pass through human-date normalization, which replaces dots with spaces, before the legacy date parser runs. Merely adding a new timestamp parser after that transform would damage fractional seconds and duration values. The proposed change must retain the original text as well as any legacy-normalized copy.

Comparison chips also have **implicit opposite bounds**:

| Visible constraint | Actual date interval constructed before inclusive query translation |
|---|---|
| `>…:cutoff` | From cutoff through tomorrow's start of day |
| `<…:cutoff` | From Unix epoch through cutoff |

“Tomorrow” is calculated using the backend's default timezone, not a browser timezone supplied with the request. These bounds are separate from the frontend upload-arrival freeze. Keep them unchanged for the small precision enhancement; removing them would be another behavioral change. [B6]

## 8. Exact scope of the proposed shared-comparison enhancement

**Proposed, not implemented:** keeping legacy parsing and falling back to the existing shared date-bound parser in `MatchDateValue` benefits every comparison key using that rule, not only usages.

### 8.1 Useful date-comparison forms

| Date being searched | Lower-bound chip | Upper-bound chip |
|---|---|---|
| Upload date | `>date:…` | `<date:…` |
| Upload date—alternative name | `>uploaded:…` | `<uploaded:…` |
| Date taken | `>taken:…` | `<taken:…` |
| Usage added date | `usages@>added:…` | `usages@<added:…` |

All eight forms would gain the shared parser's timestamp and duration values. Their negated forms also traverse the same parsing rules—for example, `->taken:"2026-10-10T14:30:00Z"` and `-usages@>added:2.hours`. Negation does not change the value grammar; it negates the resulting constraint. This is backend/API scope, not a claim that direct-ES mode implements every alias identically. [B6][B7]

### 8.2 Expressions that do not gain this capability

- **Whole-period expressions:** `date:2026-10-10`, `uploaded:2026-10-10`, `taken:today` and `@2026-10-10` use the separate range parser. The proposal neither changes them nor promises timestamp/duration support in them.
- **Last-modified comparison chips:** no such alias exists in the current comparison grammar. Last-modified filtering remains available through `modifiedSince`/`modifiedUntil`; this proposal does not add a chip name.
- **Other generic field chips:** arbitrary date-like field names and the `dateTaken` suggestion do not acquire comparison-date behavior simply by containing date values.
- **Picker/URL bounds:** their parser already supports these values. They need no new grammar for this feature.

### 8.3 Mechanically accepted combinations are not advertised capabilities

The grammar is broader than the meaningful standard field combinations. These would also mechanically reach the changed comparison parser:

| Combination | Lower-bound form | Upper-bound form |
|---|---|---|
| Bare added date | `>added:…` | `<added:…` |
| Nested date alias | `usages@>date:…` | `usages@<date:…` |
| Nested uploaded alias | `usages@>uploaded:…` | `usages@<uploaded:…` |
| Nested taken alias | `usages@>taken:…` | `usages@<taken:…` |

Their negated forms follow the same rule too. Grammar acceptance does **not** establish that these combinations address meaningful standard image/usage fields or return useful results. Do not advertise them, add fields to make them work, or treat them as new product requirements. [B6][B7]

## 9. Recommendation: add hours without inventing another date system

### 9.1 Recommended user-facing form

Add explicit-offset ISO timestamps to the **existing comparison keys**, including both usage directions:

```text
usages@>added:"2026-10-10T14:00:00Z"
usages@<added:"2026-10-10T17:30:00Z"
```

To express 14:00 British Summer Time on that date instead (13:00 UTC), the proposed lower bound is:

```text
usages@>added:"2026-10-10T14:00:00+01:00"
```

These are **proposed forms, not an existing working usage-timestamp recipe**. A timestamp should mean one instant, not an implicit whole hour/minute. Keep existing date-only forms working with their current interpretation.

**Operator direction (16 October): base usage-date values on exactly the existing date-bound parser, not a better/different usage-only format.** Reuse `formatting.parseDateFromQuery`, already used for the six top-level date bounds in both GET search and the new JSON read path. Do not implement a second, approximately equivalent ISO parser. In particular, the earlier suggestion here to make seconds optional was inconsistent with the existing parameter grammar and is withdrawn. [B1][B2][B3]

#### Existing picker URL form and allowed omissions

Both pickers calculate browser-local boundaries and emit absolute UTC timestamps. For a whole-day selection of 10 October 2026 in Europe/London, the upload-date URL parameters are:

```text
?since=2026-10-09T23:00:00.000Z&until=2026-10-10T22:59:59.999Z
```

The parameter families are:

| Selected field | Browser URL parameters |
|---|---|
| Uploaded | `since`, `until`; default/absent `dateField` |
| Taken | `takenSince`, `takenUntil`, `dateField=taken` |
| Modified | `modifiedSince`, `modifiedUntil`, `dateField=modified` |

The common backend parser combines Joda's `dateTime`, `dateTimeNoMillis` and `date` parsers, with UTC as the default zone. Its supported normal forms and relevant omissions are: [B1]

| Parameter value | Accepted? | Interpretation / omission |
|---|---|---|
| `2026-10-10T14:30:00.000Z` | Yes | Full picker-style timestamp. |
| `2026-10-10T14:30:00Z` | Yes | Milliseconds may be omitted. |
| `2026-10-10T14:30:00+01:00` | Yes | Numeric offset instead of `Z`; encode the literal `+` as `%2B` in a URL. |
| `2026-10-10` | Yes | Entire time/zone omitted: midnight **UTC**, not a whole-day interval. |
| `2026-10-10T14:30Z` | No | Seconds cannot be omitted while retaining the time. |
| `2026-10-10T14:30:00` | No | A timestamp requires its zone/offset. |
| `2026-10` | No | A calendar date needs its day as well as year/month. |

Either entire bound parameter may also be omitted to express a one-sided top-level filter. These are the normal documented forms, not an exhaustive catalogue of Joda's incidental parsing leniencies; any implementation should characterize the existing function rather than replace it with a regex inferred from this table.

The top-level `since`/`until` bounds are **exclusive** (`gt`/`lt`). Therefore `until=2026-10-10` means strictly before midnight starting that UTC day, not through its end. The picker-generated end-of-day timestamp is also an exclusive endpoint, despite the whole-day presentation. [B4]

Invalid top-level values can be **silently omitted**: the parser returns `None`, and both request readers use `flatMap`. A successful response is not proof that the supplied date constraint took effect. [B1][B2][B3]

#### Existing relative values are part of the parser contract too

`parseDateFromQuery` also accepts Scala duration strings, for example:

```text
?since=2.hours
```

The dot in `2.hours` is **literal text typed by the person constructing the value**; the UI does not insert it. It is duration notation, unrelated to the fractional-second dot in `.000Z`. The backend computes the current time minus that duration when it parses the request. This is genuinely relative **per request**; the frontend date pickers do not generate it or turn it into an absolute URL timestamp. Kupua's date display and upload-freeze/string-comparison paths do not uniformly support such manually supplied relative parameters.

With the proposed comparison-parser fallback, a person could also type `usages@>added:2.hours` directly in the search box, or use the same value in the other comparison chips listed in section 8. That chip capability is **proposed**, unlike the existing top-level `since=2.hours` parameter.

Reusing the whole existing function for usage comparisons therefore brings its duration forms as well as its absolute forms. Do not claim exact grammar reuse while secretly excluding durations, or add a usage-only freeze rule. Characterize their behavior across repeated reads; broader improvements to relative-time stability belong to a shared change, not a special usage-date dialect. [B1]

#### Same value parser does not mean silently changing existing query semantics

The current boundary distinction is **inclusive date-range chips versus exclusive picker/URL bounds**, not the reverse: [B4][B5]

| Date-filter path | Backend operators | Includes an event exactly on the boundary? |
|---|---|---|
| Date-range chips, including `usages@>added` / `usages@<added` | `gte` / `lte` | Yes |
| Picker/URL bounds: `since`, `until`, `takenSince`, `takenUntil`, `modifiedSince`, `modifiedUntil` | `gt` / `lt` | No |

The operator abbreviations mean:

| Operator | Meaning | Mathematical notation |
|---|---|---|
| `gt` | Greater than | $>$ |
| `gte` | Greater than or equal | $\ge$ |
| `lt` | Less than | $<$ |
| `lte` | Less than or equal | $\le$ |

Consequently, the usage chip's visible `>` currently means **on or after** its parsed cutoff, and `<` means **on or before**, despite looking like strict comparisons. This describes the date-range filter paths examined—not every chip or every operation involving dates in the application.

Agree on **exact reuse of the date-value language**, not on silently copying every surrounding behavior. Existing chip `DateRange` queries use inclusive `gte`/`lte`, whereas top-level bounds use exclusive `gt`/`lt`. Existing chips also have legacy human-date forms. Preserve saved-search behavior unless a separately approved consistency change deliberately alters it. Likewise, the top-level invalid-value omission is an existing hazard to record, not a reason to make an invalid usage chip silently disappear. These boundary, compatibility and failure-policy differences must be explicit in the implementation decision; they are separate from whether two fields accept the same timestamp or duration. [B4][B5]

### 9.2 Implementation scope and verification — PR #5064

[PR #5064 — Support timestamps and relative durations in date comparison chips](https://github.com/guardian/grid/pull/5064) delivers the shared backend comparison-parser change, focused regression tests and syntax/help documentation. **This checklist describes the resulting behavior assuming the PR is merged and incorporated into the backend serving each frontend; it is not a claim about deployment status.** No picker or URL-format change is required. Earlier proposal wording elsewhere in this report records the research baseline.

1. **Backend comparison parsing — implemented:** `MatchDateValue` passes the original value to `parseDate`, which first tries the legacy parsers on a legacy-normalized copy, then falls back to `formatting.parseDateFromQuery` with the **untouched original value**. Millisecond and duration dots survive. Whole-period parsing, legacy date interpretation, inclusive endpoints and implicit epoch/tomorrow bounds remain unchanged. The PR adds parser regressions and backend Elasticsearch tests for usage cutoffs, millisecond precision, equivalent offsets and equality at each boundary.
2. **Both API surfaces — shared path confirmed by static inspection:** Kahuna's GET `/images?q=…` uses `SearchParams` → `Parser.run` → `Parser.parse` → `QuerySyntax`. Kupua's branch-only POST read endpoints use `admitSearchParams` → `SearchParamsBody.fromJson` → `Parser.parse` → the same `QuerySyntax`. Search-after, window, rank, keys, count, aggregations and sort-profile reads also share query construction through `admittedSearch`. They therefore inherit the parser enhancement without endpoint-specific date changes once the PR is incorporated into this branch's backend. The PR does **not** add explicit GET-versus-new-read-path tests; this conclusion is source tracing, not runtime cross-endpoint validation. [B2][B3][B6][B7]
3. **Chips — existing behavior retained:** timestamps remain text with existing quoting. Neither frontend needs a special date parser or relative-to-absolute rewrite for explicit timestamps.
4. **Help/discoverability — updated:** the media-api README documents timestamp and duration examples, timezone requirements, inclusive chip versus exclusive top-level bounds, and preserved fallback/opposite-bound behavior. Kahuna's usage help now says “on or after” / “on or before” and mentions timestamps.
5. **Direct-mode compatibility — existing timestamp path, characterization still incomplete:** direct-ES mode bypasses the Scala parser, so the PR does not change it. Static inspection found:
   - Usage comparison values already pass unchanged into inclusive `gte`/`lte` ranges on `usages.dateAdded`. Explicit timestamps, milliseconds and offsets are expected to work through ES date parsing without a product change; this is not a runtime matching result.
   - Scala duration values such as `2.hours` are forwarded literally, not converted to a cutoff. They are not equivalent to ES's date-math syntax.
   - Upload/taken comparison aliases (`>date`, `>uploaded`, `>taken` and their upper-bound forms) fall through to ordinary field matching, rather than date-range translation.
   - Usage ranges are one-sided: the backend's implicit epoch/tomorrow bounds are not reproduced. Bare-date interpretation can also differ, as described in section 6.
   - Existing direct-mode tests assert outgoing date-only usage ranges, not timestamp matching. Satisfying the characterization item means adding focused timestamp/offset-preservation tests and recording these differences; actual matching guarantees additionally require local-ES boundary fixtures. **Full direct-mode parity is separate work, not a prerequisite for this PR.** [D1][D2]
6. **Date picker — intentionally unchanged:** a time editor remains a separate UX increment, not a prerequisite for typed usage timestamps. If added, show the timezone, preserve untouched time values, provide an explicit whole-day mode, and show active times in the collapsed summary. Do not reproduce Kahuna's time-stripping Save behavior.

No index migration, new date fields, durable query-session service, production data change or additional ES request per search is justified by this feature. Parsing one timestamp adds negligible local work; the query should remain a normal date range on the existing field. This is an architectural expectation, not a benchmark result.

### 9.3 What should explicitly *not* be bundled

- **No Kupua-only `usageSince`/`usageUntil` shortcut.** It creates a third representation beside existing usage chips and top-level image dates, requiring propagation through every read endpoint and URL consumer.
- **No universal relative language yet.** `now-2h`, `-2h`, “last two hours” and `today` have distinct clock, rounding and lifecycle questions. Supporting them together is not a small extension of accepting ISO timestamps.
- **No silent rewrite of historical bounds.** A switch from inclusive to exclusive comparisons, from a midnight cutoff to end-of-day, or from the implicit epoch/tomorrow bounds to open-ended ranges changes existing saved searches.
- **No general invalid-input cleanup bundled into this feature.** Preserve/characterize existing outcomes while avoiding regressions; a uniform rejection policy across chips and URL parameters needs its own decision.
- **No silent browser-local default for timestamp chips.** That would make the same shared text dependent on who opened it; the server cannot infer the sender's timezone.
- **No conversion of usage constraints to upload constraints.** They describe different events.
- **No general metadata/rights or unrelated API-migration work as a gate.** These are outside the requested capability.

### 9.4 If relative-search behavior is later redesigned

Genuinely relative duration parameters already exist in the shared backend parser (section 9.1); this is not a proposal to invent that capability. Reusing the parser should not create a separate usage-only lifecycle. If relative-search behavior is changed across the application, choose and document the product contract first:

| Contract | URL | Evaluation | Trade-off |
|---|---|---|---|
| Helper resolved once | Absolute timestamp | At selection/apply | Reproducible bound; current dropdown model. |
| Relative saved search | Relative expression | On opening or explicitly refreshing search | Bookmark stays useful; needs a defined search-lifetime anchor for paging/counts. |
| Continuously rolling view | Relative expression | Repeatedly as time advances | Membership changes under the user; must coordinate ranks, counts, position maps and paging. |

For Kupua, the second is more compatible with position preservation than silently adopting the third. A proposed future evaluation anchor should be separate from the existing upload-arrival cap: the cap constrains upload membership, not the meaning of every occurrence of `now`. An explicit absolute timestamp remains the inexpensive, predictable solution for the immediate hours requirement.

### 9.5 Focused acceptance matrix for a future implementation

This is a proposed validation list, **not a claim that these tests already exist**. For the small comparison-parser change:

- Legacy date-only/human-date examples retain their results, timezone interpretation, inclusive endpoints and implicit opposite bounds. Whole-period expressions are unchanged.
- All eight useful comparison forms in section 8.1, plus representative ordinary/nested negations, accept the shared parser's timestamp values. There is no usage-only optional-seconds extension.
- Duration forms such as `2.hours` use the existing shared parser semantics; test repeated requests and clock advancement without introducing a usage-only temporal anchor.
- Equivalent UTC/offset timestamps agree; fractional seconds survive; neither timestamp nor duration dots are corrupted by legacy normalization.
- Quoted/unquoted input survives chip editing, URL reload and API-body serialization; an encoded positive offset stays positive.
- Characterize invalid/missing-offset values and existing parser fallback behavior. Do not accidentally drop an invalid constraint as a side effect of adding the new fallback; broader failure-policy redesign is separate.
- GET search and the shared new-read path agree on the effective query; include result reads and representative counts/rank/keys checks.
- Characterize lower/upper usage constraints alongside platform/status and same-record matching; pre-existing unrelated nested-query defects do not automatically become this feature's implementation scope.
- Boundary fixtures include events exactly on each cutoff and just before/after it, with legacy date behavior checked under UTC and a non-UTC backend zone.

The following belong to **separate adjacent work**, not acceptance gates for typed timestamp chips:

- Time-picker UI: preserving sub-day values on Save, explicit whole-day mode, visible active times and browser-local/DST interaction tests.
- Upload freeze/poll/history: comparing arbitrary top-level timestamp bounds by instant rather than textual representation.
- Relative-search lifecycle redesign: a shared clock/evaluation anchor and midnight-transition tests if that behavior is deliberately changed.

## 10. Validation and limits of this research

The findings are source-based, not an assertion about which exact build is currently serving the shared browser tab. No live Grid/Elasticsearch requests, data writes, deployments or Git commits were performed. Product code was not modified.

Existing focused tests were run from the repository root:

```bash
set -o pipefail; npm --prefix kupua run test -- src/components/DateFilter.test.tsx src/lib/cql-ast-serialize.test.ts src/lib/cql-effective-query.test.ts src/lib/plain-search-serializer.test.ts src/dal/ordered-read-bodies.test.ts src/dal/adapters/elasticsearch/cql.test.ts 2>&1 | tee "$TMPDIR/kupua-test-output.txt"
```

**Result: passed — 6 files, 89 tests.** They cover existing frontend behavior and request/query shapes, not newly implemented timestamp support. A separate network-free probe of the installed CQL parser confirmed timestamp chip tokenization; backend acceptance must be assessed separately. No browser E2E/performance suite was required for this documentation-only task.

The shell emitted sandbox/toolchain-discovery warnings for unrelated installed-tool directories; the Node probe and focused Vitest command nevertheless completed successfully. No permissions or sandbox settings were changed.

## Evidence index

Line anchors refer to the inspected working-tree snapshot; files may subsequently move.

[B1]: ../../../common-lib/src/main/scala/com/gu/mediaservice/lib/formatting/package.scala#L11
[B2]: ../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L550
[B3]: ../../../media-api/app/lib/elasticsearch/ElasticSearchModel.scala#L710
[B4]: ../../../common-lib/src/main/scala/com/gu/mediaservice/lib/elasticsearch/filters.scala#L26
[B5]: ../../../media-api/app/lib/elasticsearch/QueryBuilder.scala#L90
[B6]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L11
[B7]: ../../../media-api/app/lib/querysyntax/QuerySyntax.scala#L170
[K1]: ../../../kahuna/public/js/search/query.html#L65
[K2]: ../../../kahuna/public/js/search/query.js#L520
[K3]: ../../../kahuna/public/js/components/gu-date-range/gu-date-range.js#L89
[K4]: ../../../kahuna/public/js/components/gu-date/gu-date.js#L46
[K5]: ../../../kahuna/public/js/search/structured-query/syntax.ts#L6
[K6]: ../../../kahuna/public/js/search/structured-query/structured-query.js#L71
[K7]: ../../../kahuna/public/js/components/gr-cql-input/gr-cql-input.ts#L26
[K8]: ../../../kahuna/public/js/search/syntax/syntax.html#L88
[K9]: ../../../kahuna/public/js/services/api/media-api.js#L41
[K10]: ../../../kahuna/public/js/search/results.js#L314
[U1]: ../../src/components/DateFilter.tsx#L54
[U2]: ../../src/components/DateFilter.test.tsx#L30
[U3]: ../../src/components/CqlSearchInput.tsx#L76
[U4]: ../../src/lib/typeahead-fields.ts#L480
[U5]: ../../src/lib/lazy-typeahead.ts#L249
[U6]: ../../src/lib/cql-effective-query.ts#L12
[U7]: ../../src/lib/cql-ast-serialize.ts#L34
[U8]: ../../src/lib/search-params-schema.ts#L20
[U9]: ../../src/lib/plain-search-serializer.ts#L25
[U10]: ../../src/dal/grid-api-search-adapter.ts#L120
[U11]: ../../src/dal/api-data-source.ts#L81
[U12]: ../../src/stores/search-store.ts#L1012
[U13]: ../../src/lib/history-snapshot.ts#L33
[U14]: ../../src/dal/api-data-source.ts#L137
[U15]: ../../src/lib/field-registry.tsx#L282
[L1]: ../../node_modules/@guardian/cql/src/lang/typeahead.ts#L192
[L2]: ../../node_modules/@guardian/cql/src/cqlInput/popover/components/DateSuggestionContent.tsx#L97
[D1]: ../../src/dal/adapters/elasticsearch/cql.ts#L244
[D2]: ../../src/dal/es-adapter.ts#L470
[D3]: ../../src/dal/es-adapter.test.ts#L325

Library links describe installed `@guardian/cql` 1.8.6; they are local dependency evidence, not tracked repository files. The decisive evidence that these helpers are **not enabled** is the tracked frontend wiring above.
