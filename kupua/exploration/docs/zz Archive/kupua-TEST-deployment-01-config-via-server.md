> **Archived 30 October 2026 — done.** C1–C4 and the ticker-metadata slice are implemented;
> the status line below is stale. Current state:
> [Deployed via Kahuna](../00%20Architecture%20and%20philosophy/09-deployed-via-Kahuna.md).

# Kupua TEST: Configuration From The Server

**Status, 30 October 2026:** scope agreed; implementation not started. This is the
configuration workplan under the [TEST hosting architecture](kupua-TEST-deployment-00-plan.md).
Execute the numbered steps in order, recording completion here without turning this
document into a session log. Agreement on this plan is not permission to commit,
push, deploy, change live configuration or extend scope. Obtain explicit approval
for product edits outside `kupua/`; the earlier permission covered comment references.

## 1. Decisions And Boundaries

- Hosted Kupua only, including hosted local Grid. Laptop modes retain their existing
  settings and defaults, including `--use-deployed-media-api`.
- Extend Kahuna's existing inline `window.__KUPUA_CONFIG__`. No JSON endpoint, extra
  browser startup request, config service, polling or live reconfiguration.
- Construct the additional payload only when actually serving Kupua: DEV/TEST,
  opted-in cookie, not an iframe, and an available built page. Ordinary Kahuna's
  HTML, configuration, requests and CSP remain unchanged; PROD/CODE stay excluded.
- Apply configuration synchronously before dependent modules evaluate. Reload picks
  up the configuration and permission result then supplied by Kahuna.
- Support Guardian `show_paid`, including initial/home searches. This is distinct
  from the excluded BBC filter settings below and does not replace server authorization.
- Keep the current "Free to use only" control and its meaning. Do not introduce
  the BBC `usePermissionsFilter`, `costFilter.label` or `costFilter.chargeable`
  features ([historical PR #3760](https://github.com/guardian/grid/pull/3760)).
- Configure only Kupua's existing deny-syndication warning flag and message. Broader
  BBC warning flags, text customization and workflows remain out of scope.
- Keep server-returned cost/validity authoritative and preserve vendored local
  fallbacks. No costing-policy export, quota redesign, editing, downloads, cleanup
  operations, new user-preference storage or full Kahuna feature parity.
- Ticker-response metadata is the next bounded slice (section 6), intended for a
  subsequent session soon after this one, not an indefinite backlog item. Do not
  combine it with the initial configuration implementation merely for completeness.

## 2. Current Ownership And Proposed Contract

Kahuna already loads deployment configuration through `KahunaConfig`/`CommonConfig`.
[GridConfigLoader](../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/GridConfigLoader.scala)
combines common and service-specific files; later files override earlier ones.
Kahuna and media-api can consequently differ. No private deployed config has been
inspected, and source defaults are not proof of effective TEST settings.

[KahunaController](../../../kahuna/app/controllers/KahunaController.scala) currently
injects only `mediaApiUri` and `collectionsUri` through
[KupuaPage](../../../kahuna/app/lib/KupuaPage.scala). Kupua's
[grid-config](../../src/lib/grid-config.ts) remains hardcoded;
[hosted-config](../../src/lib/hosted-config.ts) currently handles service URLs only.
Media-api root discovery supplies capabilities, not this configuration catalogue.

Keep the two existing service URL keys. Add an optional `gridConfig` object for
the allowlisted site settings below and an optional top-level Boolean `showPaid`
for the request's user. Keep user-specific values out of any shared serialized
payload cache. Do not inject names, email addresses, credentials or a session object.
Do not copy all of legacy `_clientConfig` or serialize raw server configuration.

### Naming And Shape Consistency

Reuse Kahuna/Grid's existing public names, types, serializers and default meanings
wherever applicable. Do not invent parallel names or manually reconstruct an existing
serialized shape merely because the consumer is Kupua. Keep necessary translations
at the configuration boundary and document them in the mapping table below.

Deliberate differences are the `gridConfig` grouping, the standalone `showPaid`
Boolean without its surrounding session data, and Kupua's derived `hasAgencyPicks`
and `tickerDefinitions`. `recordDownloadAsUsage` keeps Kahuna's public name and maps
once to Kupua's existing internal `image.record.download` key. Field aliases reuse
Grid's serializer, preserving its flags and options. Compatibility fallbacks for an
older/missing payload intentionally preserve Kupua's defaults, which can differ from
Kahuna's; a new payload supplies explicit server values instead.

Consistency is primarily protection against accidental behavioral drift, not a
performance optimization. Keep this to one small page payload and one-time resolution;
do not add a second payload or additional serialization to ordinary Kahuna requests.

| Payload setting | Server source / mapping | Existing or planned consumer |
| --- | --- | --- |
| `showPaid` | `authorisation.hasPermissionTo(Permissions.ShowPaid)` for the request principal | Hosted initial/Home defaults; not checkbox polarity or a new authorization rule |
| `gridConfig.staffPhotographerOrganisation` | `config.staffPhotographerOrganisation` | Organisation search vocabulary and configured ticker name/clause |
| `gridConfig.fieldAliases` | `config.fieldAliasConfigs`, using its established serializer | Field registry, sort catalogue, additional metadata and typeahead |
| `gridConfig.imageTypes` | `config.imageTypes` | Existing image-type metadata visibility |
| `gridConfig.recordDownloadAsUsage` | `config.recordDownloadAsUsage`; adapt to the existing `image.record.download` client key | Offer `usages@platform:download`; no download implementation or recording writes |
| `gridConfig.useReaper` | `config.useReaper.getOrElse(false)` | Offer `is:reapable`; no reaper activation or deletion |
| `gridConfig.hasAgencyPicks` | Presence of `config.agencyPicksIngredients`, matching the existing Kahuna feature gate | Agency-pick search vocabulary and detection |
| `gridConfig.agencyPicksIngredients` | Configured ingredients, otherwise an explicit empty map | Existing agency-pick border detection |
| `gridConfig.agencyPicksColour` | `config.agencyPicksColour` | Existing agency-pick styling and ticker definition |
| `gridConfig.tickerDefinitions` | Build existing ticker shapes from organisation, `shouldDisplayOrgOwnedCountAndFilterCheckbox`, agency-pick enablement and colour | Status bar, facets and typeahead; counts still come from media-api |
| `gridConfig.showDenySyndicationWarning` | `config.showDenySyndicationWarning.getOrElse(false)` | Existing deny-syndication banner |
| `gridConfig.denySyndicationTextHeader` | `config.denySyndicationTextHeader` | Existing banner text, rendered as text rather than HTML |
| `gridConfig.defaultShouldBlurGraphicImages` | `config.defaultShouldBlurGraphicImages` | Existing graphic-image heuristic's default; no new preference UI |

Use the existing org-owned and agency-pick ticker clauses, stable display order,
and supplier sub-aggregation convention. Disabling the org ticker is not permission
to disable valid organisation queries. Preserve alias flags/options, including
hidden aliases; do not infer the catalogue from aliases present on sampled images.
No new alias query semantics or direct-ES behavior follows from this payload.
Kupua's local-only hidden `adultContentWarning` alias is replaced by the server list.
Hosted graphic-image blur then relies on keyword matching unless media-api's effective
`field.aliases` includes it; the operator may add it server-side (no Kahuna impact).
Keep direct-only syndication categories/start-date policy unchanged.

### Validation And Fallback

- Outside hosted builds, ignore the injected object completely.
- Missing fields, including an older two-URL payload, retain today's local defaults.
  Invalid optional settings use documented defaults; required service addresses
  retain the current refusal to make hosted reads when absent/invalid.
- Explicit `false`, empty arrays and empty ingredient maps are meaningful. Replace
  supplied lists/maps rather than merging in obsolete local entries. Validate a
  supplied list/map coherently; do not silently retain a mixture of valid and invalid entries.
- Validate the nested object's field types and supported shapes. Ignore unknown
  fields. Avoid unchecked casts, truthiness-based defaults or a generic deep merge.
- New-server absence must be encoded explicitly (for example `false` or `[]`),
  not omitted in a way that accidentally resurrects a prototype default.
- Resolve once for the document lifetime. Narrow `hostedServiceUri` to service URL
  keys when extending `HostedConfig`, so configuration objects/Booleans cannot be
  passed to a URL accessor.

### `show_paid` And Navigation

[Guardian authorization](../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/guardian/auth/PermissionsAuthorisationProvider.scala)
maps `ShowPaid` to Guardian's `show_paid`. The existing
[auth session response](../../../auth/app/auth/AuthController.scala) exposes the
result as `permissions.showPaid`. Reuse Kahuna's injected authorization provider and
already-resolved request principal; do not fetch the session in the browser or
duplicate the permission-provider logic. Compute this only on the Kupua path.
An absent principal/unavailable value must not be fabricated as a successful grant;
omit the optional value and use the documented compatibility fallback. Do not catch
authorization failures and convert them into a grant or weaken existing login handling.

| Hosted value | Initial empty search and explicit Home action |
| --- | --- |
| `true` | Include paid images: `nonFree=true` |
| `false` | Free-only: omit `nonFree`, using the existing free-only convention |
| Missing/invalid | Preserve prototype default: `nonFree=true` |

This is a default, not an enforced filter. Preserve explicit URL searches, including
`nonFree=false`, and existing Back/Forward restoration. Apply initial defaults only
where Kupua already initializes an empty search; do not inject the preference into
every query missing `nonFree`. Explicit Home resets to the user's default. Retain
the existing reset, focus and history contracts. No cross-app preference migration.
Keep ordinary logo href/new-tab behavior consistent with its JavaScript click path.

## 3. Implementation Sequence: Hosted Configuration

Each step must pass its focused check before moving on. Use existing test homes;
add only missing behavioral witnesses, not a parallel suite or a scenario matrix.

### C1. Server Payload And Isolation

**Status:** done locally (30 October); pending TEST deployment.

Extend `KahunaController`/`KupuaPage` with the allowlisted payload and per-request
permission Boolean. Keep construction behind actual Kupua selection. Retain
`Cache-Control: no-store`, safe JSON serialization with `<` escaping and pre-module
injection. Do not edit ordinary Kahuna's template, auth service or media-api.

**Checks:** extend [KupuaPageTest](../../../kahuna/test/lib/KupuaPageTest.scala) and
the nearest suitable controller test if needed: synthetic non-default settings,
both permission results, no personal data, script-closing text, injection order,
and existing stage/cookie/iframe/missing-page exclusions. Verify actual wiring does
not perform additional payload construction/permission work on the normal branch;
the pure `shouldServe` test alone does not establish that. Use focused Scala tests
that need no Elasticsearch; never run write-capable integration tests against a tunnel.

### C2. Synchronous Site Configuration

**Status:** done locally (30 October). `matchViaExistence` is carried through but has
no client query semantics yet (section 7).

Extend `HostedConfig`, validate optional settings and resolve `gridConfig` before
its importers evaluate. Keep defaults and resolution in a dependency direction
that cannot import stores/registry/router back into configuration. No React effect,
mutable post-start patching or asynchronous initialization.

Check existing module-time consumers in
[field-registry](../../src/lib/field-registry.tsx),
[typeahead-fields](../../src/lib/typeahead-fields.ts) and
[FacetFilters](../../src/components/FacetFilters.tsx).
Wire the admitted [graphic-blur default](../../src/lib/graphic-image-blur.ts).
Other admitted settings should flow through existing consumers, not new UI features.

**Checks:** extend [hosted-config tests](../../src/lib/hosted-config.test.ts) and
neighboring consumer cases using a deliberately non-GNM synthetic organisation,
different aliases, disabled/empty values and warning text. Import consumers only
after installing synthetic bootstrap data to prove first-evaluation correctness.
Assert standalone isolation, old-payload compatibility and explicit empty-list
replacement. Preserve existing service-URL refusal tests.

### C3. Permission-Based Initial/Home Defaults

**Status:** done locally (30 October). Both permission outcomes were checked in the
browser against local Kahuna with TEST services: defaults, logo href, explicit-URL
preservation, Home and Back.

Resolve [home-defaults](../../src/lib/home-defaults.ts) from hosted `showPaid`.
Inspect its existing consumers in root/legacy-image redirects,
[useUrlSearchSync](../../src/hooks/useUrlSearchSync.ts),
[reset-to-home](../../src/lib/reset-to-home.ts) and
[SearchBar](../../src/components/SearchBar.tsx). Correct hardcoded home links where
they bypass the shared decision, including detail/error recovery entry points when
they mean Home. Preserve unrelated explicit-search links and navigation mechanics.

**Checks:** reuse initial-default/history/reset tests and browser coverage for both
permission values, explicit-URL preservation, Home from a non-default search,
ordinary logo href/new-tab destination and Back/Forward. Cover missing config and
unchanged laptop behavior. Identify old all-images assertions before editing; change
only those whose hosted behavior intentionally changes. Do not weaken preservation
assertions to accommodate a regression.

### C4. Combined Validation And TEST Acceptance

**Status:** local checks done (30 October: Kahuna focused tests, Kupua unit, E2E,
typecheck and hosted build); TEST acceptance pending operator deployment.

Run the full required Kupua unit and E2E surfaces after behavioral implementation,
plus typecheck/build validation and the hosted build. Follow the standing npm runner,
live-output and port rules. The hosted build writes Kahuna's ignored asset directory,
so obtain the necessary outside-`kupua/` approval. No tests are required merely for
writing this plan or changing comment references. Preserve unrelated working changes.

If Home/reset/render paths change, suggest the applicable operator-run perceived/jank
checks under the standing performance rules; do not launch a campaign autonomously.
The design adds no config request or per-image work. Stop for material performance
risk rather than quietly accepting it as configuration overhead.

The operator deploys Kahuna; this slice proposes no media-api deployment. On separately
authorized TEST browsing, verify only allowlisted values/aggregate observations:
config is available before startup; included controls use it; empty/Home search
follows the permission; explicit links survive; normal Kahuna, iframe and return
switch remain unchanged. Compare Kahuna's alias/ticker catalogue with media-api's
effective supported vocabulary through safe evidence, not raw private config dumps.
Treat a mismatch as a named deployment/configuration decision, not permission to
rewrite live settings, add migration support or fabricate parity.

Use synthetic/local witnesses for both permission outcomes if only one real test
account is available; disclose that limit. Retain no identities, cookies or signed
URLs. Rollback remains the existing switch-off/ordinary-build route, operator-owned.

## 4. Completion Criteria

The first slice is complete when all admitted settings reach their existing consumers
on the first hosted load, `show_paid` controls initial/Home defaults without altering
explicit searches, laptop behavior is unchanged, and normal Kahuna has no added
payload/request or changed policy. Report local checks separately from pending TEST
acceptance. Update this plan's statuses and the hosting architecture to describe
what actually shipped; add code history to the normal changelog only after code changes.

## 5. Evidence And Limits

This plan is based on current local source and the operator's 30 October decisions.
Earlier read-only inspection of the shared TEST tab confirmed only two injected
service keys; it did not establish effective domain configuration or permission values.
No implementation tests, deployment or live-config changes were performed to write it.

Background: [configuration/hosting evidence](03%20Ce%20n'est%20pas%20une%20pipe%20dream/media-api-work/api-boundary-09-p26-configuration-evidence.md)
and the [archived configuration/data-source map](zz%20Archive/runtime-configuration-and-data-sources.md).
Their older hosting and derivation descriptions are historical, not current gates.

## 6. Next Slice: Ticker-Response Metadata

**Status:** done locally (30 October). Operator decisions: preserve the current UI order
("N new", org-owned, agency picks); show server-only tickers after configured ones, in
response order, in the status bar only; skip non-`is:` clauses. Returned clause/colour win;
configured definitions fill gaps; direct-ES fills metadata from definitions. Recorded in
[deviations](deviations.md) and the ticker reference. TEST acceptance pending.

Media-api already returns ticker clauses and colours. Current ordinary-count mapping
in [api-data-source](../../src/dal/api-data-source.ts), AI mapping in
[grid-api-search-adapter](../../src/dal/grid-api-search-adapter.ts), and polling merges
in [search-store](../../src/stores/search-store.ts) do not preserve the full metadata
through to consumers. Initial configuration still supplies the definitions used by
the status bar, facets and typeahead.

The next slice should retain returned metadata across ordinary counts, AI and polling,
then use it in those consumers. Specify ordering, configured versus returned-only
names, missing metadata versus empty counts, supported clause behavior and direct-mode
fallbacks before editing. Preserve count arithmetic, request ownership and no-extra-
request behavior. Reuse existing mapping/store/UI tests, including non-default names,
clauses and colours that would expose an accidental rejoin to local definitions.
Do not call the work complete after changing only a decoder. No backend change is
assumed: first confirm the existing response contract is sufficient.

## 7. Later: Catch Up With Grid Additions

After the configuration and near-term ticker slices, review support for Grid features
added since Kupua's implementation began. Receiving new configuration does not by
itself implement new semantics or prove complete UI support. This is a separately
scoped compatibility follow-up, not an additional gate for C1-C4, permission to add
BBC workflows, or a replacement for the next-session ticker work in section 6.

At minimum, cover:

- **C2PA and presence-backed aliases:** start from the existing
  [C2PA `matchViaExistence` workplan](c2pa-matchViaExistence-support.md). Recheck its
  older hybrid/AI-fallback and vendored-config assumptions against the then-current
  implementation. Distinguish alias delivery from Boolean presence/absence matching,
  missing-value suggestion counts and presentation; preserve ordinary Boolean aliases
  and existing sort/cursor semantics. Do not label transport of the flag as completed
  C2PA support.
- **New Usage Rights categories:** done 30 October: categories come from metadata-editor
  (Kahuna's source) with a refreshed local fallback; see deviations and changelog. Original
  scope: identify the actual categories added to Grid and
  compare them with Kupua's labels, metadata display, search suggestions, styling and
  remaining local cost/validity/filter fallbacks. The earlier
  [configuration/category drift note](zz%20Archive/kupua-audit-assessment.md#L172)
  records the risk, not a verified inventory of today's missing categories. Establish
  that inventory from current Grid definitions and relevant changes before choosing
  repairs. Preserve authoritative API results; do not assume the whole costing policy
  must move into this bootstrap or introduce rights editing as part of compatibility.

Produce a short confirmed-gap list with affected modes/consumers and bounded proposed
fixes, then agree the execution scope. Review other relevant additions discovered in
that comparison without treating these two examples as an exhaustive inventory.