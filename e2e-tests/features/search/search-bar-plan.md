# Search bar feature file plan

Plan for writing BDD feature files for the search bar in the Kahuna top nav,
using the `feature-file-from-templates` skill. Work through each item, describe
its behaviours, then write or extend the matching `.feature` file.

The `usePermissionsFilter` config setting decides which of the two layouts is used:

- **Classic**: all controls sit in one search form in the top bar
  (`kahuna/public/js/search/query.html`).
- **Permissions-filter**: the filters move to a second top bar
  (`kahuna/public/js/components/gr-search-wrapper/gr-search-wrapper.html`).

## Features in both layouts

- [ ] **Search text input**: free text and `key:value` chips (broken down
      [below](#search-text-input-breakdown)).
- [ ] **Suggestions**: filter field names and suggested values for a chip
      (`query-suggestions.ts`).
- [ ] **CQL input**: the `use-cql-chips` feature switch replaces the chip input
      with a CQL input.
- [ ] **Clear button**: only shows when there's a query, and clears the query
      and the org-owned setting.
- [ ] **Advanced search help**: the ⓘ button shows and hides the syntax help
      panel (`gr-syntax`).
- [ ] **AI search checkbox**: only shown when `aiSearchEnabled` is on, and stays
      in step with the URL (`useAISearch`, `vecWeight`). In the classic layout
      it also hides the sort control.
- [ ] **"Search filters" button**: shows and hides the filters dropdown. The
      dropdown's contents depend on the layout.
- [ ] **Date range filter**: the presets (Anytime, Today, Past 24 hours, Past
      week, Past 6 months, Past year), a custom start and end date, and the
      date field (Upload time, Date taken or Last modified).
- [ ] **URL and saved preferences**: filters are restored on reload and with
      the back button, and preferences are saved in browser storage. Clicking
      the logo resets the non-free filter to its default. The non-free
      fallback differs slightly between the two layouts.
- [ ] **Tracking**: query tracking and change events. Probably not worth
      testing in BDD scenarios.

## Classic layout only

- [ ] **Cost (non-free) checkbox** (in the filters dropdown): the label comes
      from config, and the checked/unchecked meaning flips depending on
      `costFilterChargeable`.
- [ ] **My uploads checkbox** (in the filters dropdown): only shown if the user
      can upload. It filters by the user's own email, but a URL that names
      another uploader is respected.
- [ ] **Org-owned checkbox** (in the filters dropdown): only shown if
      `maybeOrgOwnedValue` is configured. It adds or removes the `is:<org>`
      chip, and the checkbox and chip stay in step.
- [ ] **Sort control**: hidden during AI search.
  - Changes the sort order.
  - Searching a collection (`~"..."`) switches automatically to collection sort.
  - Sorting by date taken reverts to the default sort when the query has no
    `has:dateTaken` filter.

## Permissions-filter layout only

- [ ] **Permissions filter**: preset permission options rewrite the query
      chips, and a chargeable toggle sets `nonFree`.
- [ ] **My uploads toggle**: a component in the second bar rather than a
      checkbox.
- [ ] **No sort control**: there's no sort control in this layout. This could
      be one scenario that checks it's absent.
- [ ] **No cost or org-owned checkboxes**: an `is:<org>` chip can still be
      typed into the search box.

## Search text input breakdown

The search text input is split into free text, chips, and scenarios that
combine them.

The `use-cql-chips` feature switch picks the input, and it is **on by default**
(`kahuna/app/lib/FeatureSwitch.scala`), so the CQL input is what users see. The
feature files treat CQL as the default and switch it on in their `Background`.

- **CQL input** (default): the `cql-input` web component from `@guardian/cql`.
  Chips render as `chip-wrapper` elements inside its open shadow root.
- **Chips input** (switch off): the free text lives in one text chip, whose
  input has `data-cy="image-search-input"`.

Step definitions live in `e2e-tests/steps/search/`. Shared search-box locators
and the feature switch helper are in `search-box.ts`.

### Free text search

Feature file: [search-free-text.feature](./search-free-text.feature)

- [x] **1. Placeholder text**: the CQL input shows `Search for images… (type +
      for advanced search)` only while it is completely empty. It hides as
      soon as there's text or a chip, and it ignores AI search. The chips
      input uses `...` instead of `…` and switches to `Search for conceptual
      images using AI search...` when AI search is ticked. Its placeholder
      stays visible next to filter chips, because the empty text chip is
      always kept. Chips-input scenarios are in
      [search-free-text-chips.feature](./search-free-text-chips.feature).
- [x] **2. Focus on page load**: the input is focused with the cursor after
      any text already there. Feature files:
      [search-focus-on-load.feature](./search-focus-on-load.feature) and
      [search-focus-on-load-chips.feature](./search-focus-on-load-chips.feature).
- [x] **3. Typing runs a search**: the URL `query` updates and results reload
      500 ms after you stop typing. Text that hasn't changed isn't searched
      again. Feature files:
      [search-typing-runs-search.feature](./search-typing-runs-search.feature)
      and
      [search-typing-runs-search-chips.feature](./search-typing-runs-search-chips.feature).
- [ ] **4. Emptying the input**: deleting all the text removes `query` from
      the URL.
- [ ] **5. Restored from the URL**: opening a link with `?query=…` fills in
      the input. Back and forward update the text.
- [ ] **6. Text is tidied when loaded from the URL** (only on load or with
      back/forward, not while typing):
  - Separate words are joined into one piece of text.
  - Quotes are dropped, so `"red bus"` becomes `red bus`. This may be a bug:
    decide whether to capture current or expected behaviour.
  - Tokens that are only punctuation are dropped.
  - `-word` stays as text, not a chip.

### Chips

- [ ] To be broken down.

### Free text combined with chips

- [ ] **7. Characters that turn typing into chips**: `+`, `-` or `#` at the
      start of a word, or a valid field name followed by `:`, become a chip
      instead of text. One free-text-only scenario could check that these
      characters stay as text inside a word, for example `well-known`.
- [ ] **8. Keyboard movement**: Home/End and Left/Right at the edges of the
      text move between chips. Backspace at the start of the text deletes the
      last chip, but never the text itself.

## Open questions and notes

- The search input has a click handler, `wrapperClicked`
  (`gr-chips.html`), that isn't defined anywhere. Clicking the empty space in
  the search bar probably does nothing.
- Run one feature against a running stack with
  `npx bddgen && npx playwright test .features-gen/features/search`
  (from `e2e-tests/`).
