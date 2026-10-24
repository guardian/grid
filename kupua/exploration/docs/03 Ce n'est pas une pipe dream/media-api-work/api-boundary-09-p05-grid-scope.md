# API boundary 09: P05 Grid relevance classification

## 1. Decision

**Accept with named unfinished scope decisions.** P05 accounts for all **1,160 scope-pending paths** in the frozen input snapshot: **949 review-required, 5 excluded, 206 remaining scope-pending**. The 206 are 76 binary assets and 130 script-tree inputs, partitioned below with deciding questions and intended owners. This is an exhaustive metadata classification, not an exhaustive source review, architecture recommendation or deployment approval.

The snapshot contains 1,793 entries: 619 previously required, 1,160 pending and 14 already excluded. Applying this proposal alone gives **1,568 required + 206 pending + 19 excluded = 1,793**, before adding this report or any concurrent administration. The coordinator must not close D001 or claim synthesis readiness on that basis. P06's draft was neither read nor used.

Review-required means the material belongs in a bounded dependency/compatibility review, including deciding which implementation details are actually consumed. It does **not** assert that every file in a shared library, existing client or producer executes during a Kupua read. In particular, excluding Kahuna upload components or shared cleanup code by name would require a caller/import trace that P05 has not performed. Their compatibility envelope stays required; this is not a demand to port those workflows into Kupua.

Protected baseline remains smooth arbitrary-position browsing among millions, position preservation, traversal/density continuum and all current workflows. No feature cuts, secondary-sort restoration, index-migration support, durable session storage, Thrall interlocks, universal snapshots or production changes follow. D3 amendments stay complete. Existing performance remains measured; no new campaign or source-first rerun is proposed.

## 2. Material Findings

### F1. Shared dependencies and the existing client cannot be scoped by directory names

**Source facts:** [build.sbt](../../../../../build.sbt#L130) makes rest-lib depend on common-lib; its [Play project constructor](../../../../../build.sbt#L234) makes services depend on rest-lib. [MediaApiComponents.scala](../../../../../media-api/app/MediaApiComponents.scala#L13) wires shared authentication/components, ES, storage, enrichment and embedding dependencies. [common-lib/README.md](../../../../../common-lib/README.md#L3) and [rest-lib/README.md](../../../../../rest-lib/README.md#L3) describe the model and REST responsibilities. [KahunaController.scala](../../../../../kahuna/app/controllers/KahunaController.scala#L29) connects login, configuration, field aliases and the client shell; [image-accessor.js](../../../../../kahuna/public/js/services/image-accessor.js#L11) consumes nested metadata, leases, rights, collections and other response fields.

**Classification inference:** all 211 common-lib inputs, 30 non-binary rest-lib inputs and 329 non-binary Kahuna inputs require compatibility/dependency review. Six rest-lib and 22 Kahuna binaries remain explicitly unresolved. Including existing callers protects shared behavior; it does not restore Kahuna's historical sorting or adopt every old UI behavior. Do not mistake these broad admission decisions for 570 source files read.

### F2. A write-oriented service can still own a read contract

**Source facts:** [cropper routes](../../../../../cropper/conf/routes#L5), [metadata-editor routes](../../../../../metadata-editor/conf/routes#L1), [leases routes](../../../../../leases/conf/routes#L4), [collections routes](../../../../../collections/conf/routes#L4), [usage routes](../../../../../usage/conf/routes#L3) and [auth routes](../../../../../auth/conf/routes#L5) expose reads relevant to existing callers or enrichment. The [usage guide](../../../../../usage/README.md#L3) separates API and stream modes within one deployable app. [Image-loader routes](../../../../../image-loader/conf/routes#L9) include upload-status reads, and [UploadStatusController.scala](../../../../../image-loader/app/controllers/UploadStatusController.scala#L23) implements them. [Quarantine's handler](../../../../../quarantine-status/lambda/quarantine-status-lambda.py#L26) supplies status updates consumed through that boundary.

**Consequence:** retain the textual service envelopes and their tests/configuration, rather than declaring all cropper, loader, metadata-editor or producer content irrelevant to a read-only frontend. Source review should distinguish shared response/model compatibility from write implementation that need not change. A GET verb alone is not safety permission: the route tables also contain operational actions. None was invoked.

### F3. Producers and infrastructure are dependencies to understand, not programmes to implement

**Original documentation:** [Thrall](../../../../../thrall/README.md#L3) produces the ES index; [image-loader](../../../../../image-loader/README.md#L3) stores media and publishes metadata notifications; [embedder](../../../../../image-embedder-lambda/README.md#L3) produces vectors and describes a backfiller; [image-counter](../../../../../image-counter-lambda/README.md#L3) is an existing management-endpoint caller. [The build](../../../../../build.sbt#L164) connects services to shared dependencies and [packages shared configuration](../../../../../build.sbt#L261). [CDK](../../../../../cdk/README.md#L3), [devcontainer](../../../../../.devcontainer/README.md#L18) and [the e2e guide](../../../../../e2e-tests/README.md#L24) establish deployment, generated configuration and full-stack routing concerns.

**Inference and limit:** retain non-binary producer, build, infrastructure, development and test envelopes for bounded review of model/mapping/configuration, delivery, existing callers and build reproducibility. Root legal/build metadata and repository automation remain required pending that review; this is not a claim that every such file defines a runtime API. The persistence-lib README is the sole inventoried path there: retain it as historical routing evidence, not proof of a current persistence implementation. Historical docs, including migration docs, remain evidence to reconcile, not active scope.

**Safety:** the [embedder's local-run guide](../../../../../image-embedder-lambda/README.md#L19) explicitly says local execution calls AWS Bedrock and S3 Vectors. Neither local runners nor documented deployment examples were executed. Producer understanding does not authorize producer changes, production investigation or a migration interlock.

### F4. The scripts tree is not 133 homogeneous maintenance scripts

The exhaustive inventory contains 133 paths: the orientation README, 100 Java/config-library paths, 15 other paths under `scripts/src/`, and 17 paths in the other script subdirectories. [Main.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/Main.scala#L6) dispatches both operational commands and configuration conversion. [ConvertConfig.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/ConvertConfig.scala#L7) imports the repository-local `com.gu.typesafe.config` namespace and renders converted configuration. [The build](../../../../../build.sbt#L203) makes scripts a consumer of common-lib, not a declared runtime dependency of the Play services.

The README, dispatcher and converter are required, actually read boundary evidence. The other **130** remain pending. An import from the converter is not proof that the vendored library is used during ordinary Grid reads; equally, the apparent vendored location is not proof it is unused by setup or configuration tooling. S1-S3 below resolve that finite question without a 20,000-line speculative audit or a blanket exclusion.

### F5. Five narrow exclusions have content-based reasons

| Exact path | Reason for exclusion from further application-coverage review |
|---|---|
| [.editorconfig](../../../../../.editorconfig#L1) | Formatting settings only; no runtime, build dependency resolution or migration contract. |
| [.prout.json](../../../../../.prout.json#L1) | Deployment-checkpoint notification bookkeeping over management manifests. Not service routing/configuration or a read capability; actual routes and deployment definitions remain required. No deployment change is proposed. |
| [package-lock.json](../../../../../package-lock.json#L1) | Full file has an empty `packages` object. No dependency graph is being dropped. This says nothing about the eight other lockfiles. |
| [stress-test/ping-grid-search.sh](../../../../../stress-test/ping-grid-search.sh#L13) | An unbounded command-line read loop with console totals, no recorded measurements or correctness assertions. This is not canonical Kupua performance evidence or an endpoint implementation. |
| [stress-test/stress-upload.sh](../../../../../stress-test/stress-upload.sh#L31) | A mutating upload-load generator, not a read-only migration dependency or a stored measurement. Its paired README stays required as provenance for this distinction. |

Exclusion does not mean deletion, permission to run, or verification of correctness. All five were fully read. Their receipts stay here rather than being converted into application-reading credit after exclusion.

### F6. Assets and lockfiles are explicitly accounted for

All **76 inventory-kind `binary` paths** remain pending in seven non-overlapping groups. That is a lack of content/consumer review, not a relevance judgment inferred from extension. No image, font or profile was visually inspected or semantically decoded. Hashing them established identity only. Textual assets, SVG, CSS, fixture JSON and licensing notices are not swept into this rule: they remain with their owning required group unless a scripts rule applies.

Nine lockfiles are inventoried. Required, but **not read**, are `cdk/package-lock.json`, `dev/oidc-provider/package-lock.json`, `dev/script/generate-config/package-lock.json`, `e2e-tests/package-lock.json`, `image-counter-lambda/package-lock.json`, `image-embedder-lambda/package-lock.json` and `kahuna/package-lock.json`. `scripts/sample-images/package-lock.json` is pending under S3; only the empty root lockfile is excluded. A later reviewer should inspect package/consumer relationships structurally, not claim every lock entry's behavior is understood. Generated devcontainer configuration remains required alongside its documented source of truth; it is not independent corroboration.

### Exhaustive Accounting

Counts apply only to the 1,160 input records whose disposition was `scope-pending`. A slash prefix includes descendants, not similarly named siblings. ROOT is the exact top-level paths in the recipe, not an open-ended catch-all.

| Area | Input | Required | Excluded | Pending |
|---|---:|---:|---:|---:|
| .devcontainer | 6 | 6 | 0 | 0 |
| ROOT | 16 | 13 | 3 | 0 |
| .github | 10 | 10 | 0 | 0 |
| auth | 6 | 6 | 0 | 0 |
| cdk | 12 | 12 | 0 | 0 |
| collections | 14 | 14 | 0 | 0 |
| common-lib | 211 | 211 | 0 | 0 |
| cropper | 19 | 15 | 0 | 4 |
| dev | 36 | 36 | 0 | 0 |
| docs | 48 | 43 | 0 | 5 |
| e2e-tests | 31 | 29 | 0 | 2 |
| image-counter-lambda | 9 | 9 | 0 | 0 |
| image-embedder-lambda | 35 | 34 | 0 | 1 |
| image-loader | 73 | 37 | 0 | 36 |
| kahuna | 351 | 329 | 0 | 22 |
| leases | 7 | 7 | 0 | 0 |
| metadata-editor | 18 | 18 | 0 | 0 |
| persistence-lib | 1 | 1 | 0 | 0 |
| project | 2 | 2 | 0 | 0 |
| quarantine-status | 5 | 5 | 0 | 0 |
| rest-lib | 36 | 30 | 0 | 6 |
| scripts | 133 | 3 | 0 | 130 |
| stress-test | 3 | 1 | 2 | 0 |
| thrall | 47 | 47 | 0 | 0 |
| usage | 31 | 31 | 0 | 0 |
| **Total** | **1160** | **949** | **5** | **206** |

The JSON below is a proposal for mechanical expansion, not a second register. `paths` and `prefixes` are OR alternatives; a `kinds` restriction is ANDed with them; `excludePaths` and `excludeKinds` subtract matches. All listed rules are mutually disjoint; **require exactly one match**, do not hide overlaps with first-match wins. Listed order is stable for reporting only. Fallback is `scope-pending`, with an expected count of zero; a nonzero fallback or any changed fingerprint stops automatic integration and returns the discrepancy to the coordinator.

```json
{
  "packetId": "P05",
  "snapshot": {
    "coveragePath": "kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-06-coverage.json",
    "coverageSha256": "f2d84eacfe6ab024e9a08d8c3c5b84104775d9293f41e798932587a6a3f625b3",
    "inventoryHead": "0e79a4dec637e3eaf05bb252c2ec7f95e8e68c8d",
    "generatedAt": "2026-09-19T12:42:14.943Z",
    "inputDisposition": "scope-pending",
    "count": 1160,
    "metadataFields": ["path", "area", "present", "kind", "bytes", "lines", "sha256"],
    "metadataSha256": "55460dbccf451ac871eecb0e6e7f6080ea4b38cfb64bce06fa866ca002035443"
  },
  "evidence": {
    "F1": [{"path":"build.sbt","ranges":[[130,136],[234,240]]},{"path":"media-api/app/MediaApiComponents.scala","ranges":[[1,54]]},{"path":"kahuna/public/js/services/image-accessor.js","ranges":[[1,109]]},{"path":"kahuna/app/controllers/KahunaController.scala","ranges":[[1,100]]}],
    "F2": [{"path":"cropper/conf/routes","ranges":[[1,14]]},{"path":"metadata-editor/conf/routes","ranges":[[1,39]]},{"path":"leases/conf/routes","ranges":[[1,22]]},{"path":"collections/conf/routes","ranges":[[1,22]]},{"path":"usage/conf/routes","ranges":[[1,21]]},{"path":"auth/conf/routes","ranges":[[1,22]]},{"path":"image-loader/app/controllers/UploadStatusController.scala","ranges":[[1,61]]},{"path":"quarantine-status/lambda/quarantine-status-lambda.py","ranges":[[1,67]]}],
    "F3": [{"path":"build.sbt","ranges":[[1,279]]},{"path":"README.md","ranges":[[1,26]]},{"path":"docs/README.md","ranges":[[1,71]]},{"path":".devcontainer/README.md","ranges":[[1,39]]},{"path":"cdk/README.md","ranges":[[1,5]]},{"path":"e2e-tests/README.md","ranges":[[1,81]]},{"path":"image-counter-lambda/README.md","ranges":[[1,21]]},{"path":"image-embedder-lambda/README.md","ranges":[[1,143]]},{"path":"image-loader/README.md","ranges":[[1,4]]},{"path":"thrall/README.md","ranges":[[1,3]]},{"path":"persistence-lib/README.md","ranges":[[1,4]]}],
    "F4": [{"path":"scripts/README.md","ranges":[[1,86]]},{"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/Main.scala","ranges":[[1,25]]},{"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/ConvertConfig.scala","ranges":[[1,65]]},{"path":"build.sbt","ranges":[[203,217]]}],
    "F5": [{"path":".editorconfig","ranges":[[1,13]]},{"path":".prout.json","ranges":[[1,14]]},{"path":"package-lock.json","ranges":[[1,6]]},{"path":"stress-test/ping-grid-search.sh","ranges":[[1,20]]},{"path":"stress-test/stress-upload.sh","ranges":[[1,61]]},{"path":"stress-test/README.md","ranges":[[1,15]]}],
    "F6": [{"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-06-coverage.json","inspection":"All scope-pending path/area/present/kind/bytes/lines/sha256 metadata; all 1160 fingerprints checked; no binary content comprehension."}]
  },
  "rules": [
    {"id":"R-grid","disposition":"review-required","count":932,"selector":{"prefixes":[".devcontainer/",".github/","auth/","cdk/","collections/","common-lib/","cropper/","dev/","docs/","e2e-tests/","image-counter-lambda/","image-embedder-lambda/","image-loader/","kahuna/","leases/","metadata-editor/","persistence-lib/","project/","quarantine-status/","rest-lib/","thrall/","usage/"],"excludeKinds":["binary"]},"evidence":["F1","F2","F3","F6"],"reason":"Shared model/auth/query/response contracts, existing caller compatibility, producer semantics, deployment/build/test/configuration and historical evidence envelopes require bounded review; no per-file runtime or reading claim."},
    {"id":"R-root","disposition":"review-required","count":13,"selector":{"paths":[".gitignore",".java-version",".nvmrc",".sbtopts",".tool-versions","Brewfile","LICENSE","NOTICE","README.md","build.sbt","docker-compose.yml","get-stack-resource.sh","riff-raff.yaml"]},"evidence":["F3"],"reason":"Retain repository/build/package/legal/toolchain and deployment inputs for dependency review; no execution or deployment change."},
    {"id":"R-script-boundary","disposition":"review-required","count":3,"selector":{"paths":["scripts/README.md","scripts/src/main/scala/com/gu/mediaservice/scripts/Main.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/ConvertConfig.scala"]},"evidence":["F4"],"reason":"Read orientation, dispatcher and configuration-conversion dependency boundary; remaining script material is unresolved separately."},
    {"id":"R-stress-provenance","disposition":"review-required","count":1,"selector":{"paths":["stress-test/README.md"]},"evidence":["F5"],"reason":"Provenance explaining excluded operational generators, not measured performance evidence."},
    {"id":"X-format","disposition":"excluded","count":1,"selector":{"paths":[".editorconfig"]},"evidence":["F5"],"reason":"Fully read formatting-only settings."},
    {"id":"X-checkpoints","disposition":"excluded","count":1,"selector":{"paths":[".prout.json"]},"evidence":["F5"],"reason":"Fully read deployment-checkpoint notification metadata, not runtime routing or a proposed deployment change."},
    {"id":"X-empty-lock","disposition":"excluded","count":1,"selector":{"paths":["package-lock.json"]},"evidence":["F5"],"reason":"Fully parsed and read; packages object is empty."},
    {"id":"X-load-generators","disposition":"excluded","count":2,"selector":{"paths":["stress-test/ping-grid-search.sh","stress-test/stress-upload.sh"]},"evidence":["F5"],"reason":"Fully read operational load generators; no stored measurements, correctness assertions or application implementation. Not executed."},
    {"id":"P-cropper-assets","disposition":"scope-pending","count":4,"selector":{"prefixes":["cropper/"],"kinds":["binary"]},"evidence":["F2","F6"],"reason":"Uninspected profile assets; resolve consumers and read-delivery relevance.","followUp":"A1"},
    {"id":"P-doc-assets","disposition":"scope-pending","count":5,"selector":{"prefixes":["docs/"],"kinds":["binary"]},"evidence":["F3","F6"],"reason":"Uninspected documentation images; determine independent workflow/architecture evidence versus illustration.","followUp":"A2"},
    {"id":"P-e2e-assets","disposition":"scope-pending","count":2,"selector":{"prefixes":["e2e-tests/"],"kinds":["binary"]},"evidence":["F3","F6"],"reason":"Uninspected fixture images; identify assertions and fixture role before classification.","followUp":"A3"},
    {"id":"P-embedder-assets","disposition":"scope-pending","count":1,"selector":{"prefixes":["image-embedder-lambda/"],"kinds":["binary"]},"evidence":["F3","F6"],"reason":"Uninspected embedder fixture; determine tested producer contract without running AWS-backed tests.","followUp":"A4"},
    {"id":"P-loader-assets","disposition":"scope-pending","count":36,"selector":{"prefixes":["image-loader/"],"kinds":["binary"]},"evidence":["F2","F3","F6"],"reason":"Uninspected profiles/fixtures; map consumers to orientation, metadata and delivery contracts.","followUp":"A5"},
    {"id":"P-kahuna-assets","disposition":"scope-pending","count":22,"selector":{"prefixes":["kahuna/"],"kinds":["binary"]},"evidence":["F1","F6"],"reason":"Uninspected images/fonts; distinguish authentication/interaction evidence from replaceable presentation with actual consumers.","followUp":"A6"},
    {"id":"P-rest-assets","disposition":"scope-pending","count":6,"selector":{"prefixes":["rest-lib/"],"kinds":["binary"]},"evidence":["F1","F6"],"reason":"Uninspected shared-library fixtures; identify tested image-delivery transformations.","followUp":"A7"},
    {"id":"P-scripts","disposition":"scope-pending","count":130,"selector":{"prefixes":["scripts/"],"excludePaths":["scripts/README.md","scripts/src/main/scala/com/gu/mediaservice/scripts/Main.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/ConvertConfig.scala"]},"evidence":["F4","F6"],"reason":"Configuration conversion, operational tools and sample-data tooling need the finite dependency decisions S1-S3; not automatically irrelevant or required wholesale.","followUp":["S1","S2","S3"]}
  ],
  "fallback": {"disposition":"scope-pending","expectedCount":0,"intendedOwner":"coordinator","nextAction":"Stop automatic integration and resolve unexpected snapshot membership or selector coverage."},
  "totals": {"review-required":949,"excluded":5,"scope-pending":206}
}
```

## 3. Coverage Receipt

### Assigned Register: Structural Inspection Only

The coverage register was parsed as JSON, not printed/read as 31,257 lines of prose. Current SHA-256 is `f2d84eacfe6ab024e9a08d8c3c5b84104775d9293f41e798932587a6a3f625b3`. Inspection covered `/baseline`, `/enumeration`, the P05 object under `/packets` (index 4), `/dependencies`, and the fields `path`, `area`, `present`, `kind`, `bytes`, `lines`, `sha256`, `disposition` of **every** `/files` record for filtering/counting. For all pending records those metadata were accounted for by the recipes; excluded records' `reason` and metadata were also inspected. P05 assignment metadata included status, stale and existing receipts. No application reading credit follows from any of these operations.

The pending metadata digest is computed by selecting fields in the JSON `metadataFields` order, sorting rows by JavaScript code-unit ascending `path` comparisons (`<`/`>`), and hashing UTF-8 `JSON.stringify(rows)` without added whitespace/newline. Every one of the 1,160 content hashes was recomputed after rejecting symlinks and checking resolved containment within the workspace. No pending path was a symlink; all hashes matched. These mechanical byte reads are not semantic reading, including for binary assets and lockfiles.

All 14 existing exclusions were reviewed at metadata level: **3 potential credential files and 11 review-administration/worklog/tooling entries**. Credential contents were not opened or hashed. Existing administrative exclusions stay excluded; authorized context reads are recorded separately below. This inspection does not certify the completeness of exclusion rules for files outside the frozen inventory or ignored runtime payloads.

### Full Assigned Text Receipts

All 22 assigned orientation/build texts were read fully. Inclusive ranges below cover physical lines, excluding a nonexistent line after a terminal newline. These are proposed `full-text` receipts with `packetId: P05`, not independent verification or proof of implementation correctness. The register assignment above is the 23rd assignment and is structural only. No assigned content within these declared scopes remains unread.

```json
[
  {"path":"README.md","sha256":"6f9df4afdda2b826c73adcbd762acdd14aaad3042f8f0b478ad4dd50a1aa1a48","method":"full-text","ranges":[[1,26]]},
  {"path":"build.sbt","sha256":"37f61825eb037c03f93cfc3b7ab0b565d67e36612580003216c914d43a00dd6e","method":"full-text","ranges":[[1,279]]},
  {"path":"docs/README.md","sha256":"2080f64ee14a332e2d47af056c8a2d8455579c8466bf33eb9580f73222aa1a36","method":"full-text","ranges":[[1,71]]},
  {"path":".devcontainer/README.md","sha256":"2fbf672349e11eb36fa4d9580016117a2eb4a62ce016291172512a205003af33","method":"full-text","ranges":[[1,39]]},
  {"path":"auth/README.md","sha256":"c60e2610b5e7c36fdf19456f9d1b4e4a6660998fb9a22183740fec72f1991f22","method":"full-text","ranges":[[1,4]]},
  {"path":"cdk/README.md","sha256":"8a99d7279bcb56f2865647d7f008ed80530d178bab38a1505a381a019db45024","method":"full-text","ranges":[[1,5]]},
  {"path":"collections/README.md","sha256":"ca5a423a4deccfadd5d34bab65d943ef81cb43504a6e2451692ed6e36a9377d0","method":"full-text","ranges":[[1,3]]},
  {"path":"common-lib/README.md","sha256":"94de806ec553f7229fc1043128ca8d7dcd045e19a5815dcbedeb4dbbda15ae47","method":"full-text","ranges":[[1,7]]},
  {"path":"cropper/README.md","sha256":"1959ac0101107c6d56894b0e837f657b11dff66717290f00ff8d6c81720db6a6","method":"full-text","ranges":[[1,11]]},
  {"path":"e2e-tests/README.md","sha256":"cf62997a53b741faf3813974bd8cd9e87c417cef5e2b0efe4f93da762e2b12d4","method":"full-text","ranges":[[1,81]]},
  {"path":"image-counter-lambda/README.md","sha256":"874170d64f0fdcb1316543019acf0e497e49427e4f001d10a9c870107ad0f938","method":"full-text","ranges":[[1,21]]},
  {"path":"image-embedder-lambda/README.md","sha256":"4f2665933b8315df005f050391aad438aede49a6a9e7ce9b4fb2d5b79a640b1b","method":"full-text","ranges":[[1,143]]},
  {"path":"image-loader/README.md","sha256":"00cdec86c8b0ee29df5606d152aa7d0097e6216be15c784a94e4b35abcd0a943","method":"full-text","ranges":[[1,4]]},
  {"path":"kahuna/README.md","sha256":"12fb80434f2865ecb8671b897ae8b060bc82ef5ebdb9b9bc99e007cde5c82794","method":"full-text","ranges":[[1,3]]},
  {"path":"media-api/README.md","sha256":"80b1297e8bea948cad1bed93ba53af21cc812b9c557332f9abe50f1e9be3ecd3","method":"full-text","ranges":[[1,26]]},
  {"path":"persistence-lib/README.md","sha256":"c0217aaed57c0ccdce56a7ebbb144a484383c0da1d88c536e0b114d49d9af431","method":"full-text","ranges":[[1,4]]},
  {"path":"quarantine-status/README.md","sha256":"b3c7e4bf29edf02ec75d930fb67b75d971085a7e0d5cd8937296aa65d614d530","method":"full-text","ranges":[[1,7]]},
  {"path":"rest-lib/README.md","sha256":"7dd89a94070377c536eb0806dd522433cf99ad4c4a9697e415a028a91e76da7b","method":"full-text","ranges":[[1,7]]},
  {"path":"scripts/README.md","sha256":"e606cb6afd522e6923ed225e101757bba01e4f3392453b70b6354be3cf7a64b1","method":"full-text","ranges":[[1,86]]},
  {"path":"stress-test/README.md","sha256":"b134ce5b94893aea1891a5f94b98d4df086d9fbb734dadfa38117dca6069d19b","method":"full-text","ranges":[[1,15]]},
  {"path":"thrall/README.md","sha256":"db97494a604e5acec76d91074a831180ad19b93df93bf92d8b7a021a58aa6d30","method":"full-text","ranges":[[1,3]]},
  {"path":"usage/README.md","sha256":"69ec93e3f9d59827559b566f174a4f2e17235d85fc1eec79fae09234da7426ec","method":"full-text","ranges":[[1,26]]}
]
```

### Bounded Supplemental Original Reads

These 20 full originals answer the deciding questions in F1-F5: service read routes; client and producer consumers; script import/dispatch boundaries; and five content-based exclusions. The short structure document only routes to subproject READMEs. No linked source was silently credited. The two media-api reads were preceded by the applicable media-api instruction read.

```json
[
  {"path":"cropper/conf/routes","sha256":"6d5ec7dd946e3468aff1bee16117064a0c4705e9c6ea17e7bf3de77f684057e4","method":"full-text","ranges":[[1,14]]},
  {"path":"metadata-editor/conf/routes","sha256":"02b03da3e3a8ecda2d5ac1c5e2a89e4ab167153b6f629765adaa6939c6be89ee","method":"full-text","ranges":[[1,39]]},
  {"path":"leases/conf/routes","sha256":"ed1f47b4ed1a45b9eaac8004cd2b7bfabf5e2b502abec5358f80bcb5da3ad9df","method":"full-text","ranges":[[1,22]]},
  {"path":"collections/conf/routes","sha256":"87af886937b1fc0f5138ab1b1411fb5f2788414251c8b3c5b2e33ec36c9bfcd6","method":"full-text","ranges":[[1,22]]},
  {"path":"image-loader/conf/routes","sha256":"507138a7df1e33265cee253568b645ea3136ce3a60155af93dd16175f629e9f8","method":"full-text","ranges":[[1,21]]},
  {"path":"usage/conf/routes","sha256":"db7faa944165f185ad1c336be3540374b606b1940172692cb3572aec1140cb1c","method":"full-text","ranges":[[1,21]]},
  {"path":"auth/conf/routes","sha256":"caa499cc93beee2c902a131b364a2cfc34c8b5e7fb9c49494616e42f4e86b636","method":"full-text","ranges":[[1,22]]},
  {"path":"package-lock.json","sha256":"3a4595fa1f215a2303d9404fbea0bbb18ca141b148da2c2362fc37b4cde6072a","method":"full-text","ranges":[[1,6]]},
  {"path":"docs/00-about/02-structure.md","sha256":"104c5ec575aa16a2554a1621832fbea2f26159deb84d56646e1d5c358ef5fc91","method":"full-text","ranges":[[1,3]]},
  {"path":"kahuna/public/js/services/image-accessor.js","sha256":"e59b93d48807408b1521861de599dd2a0b7371bc9287636b806b1ebb21a07a84","method":"full-text","ranges":[[1,109]]},
  {"path":"image-loader/app/controllers/UploadStatusController.scala","sha256":"2b256954d169c03f652b3b886dab575301782dbda8fd7688ea399059e1fe0645","method":"full-text","ranges":[[1,61]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/Main.scala","sha256":"38fffa2cf4c7cad2340e4c4db81cc0e990ef0e2ec02a974a19194bd9d4f593db","method":"full-text","ranges":[[1,25]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/ConvertConfig.scala","sha256":"9a03a1bf674f60ee16575fbae898091e6423f66e3dd197f820c03aae533c99f6","method":"full-text","ranges":[[1,65]]},
  {"path":"quarantine-status/lambda/quarantine-status-lambda.py","sha256":"c1bbf82db46986997cd037c09b668e87c73dc2772d261b40759a06823a3c74b9","method":"full-text","ranges":[[1,67]]},
  {"path":"kahuna/app/controllers/KahunaController.scala","sha256":"7454077e025280dbb4a8013e3a489ee477692ad16a714f3d0f9df094f067537f","method":"full-text","ranges":[[1,100]]},
  {"path":"media-api/app/MediaApiComponents.scala","sha256":"84406ebe03439633aa91e409dc2c8828dde9984d9d572f99573d5a47230261f7","method":"full-text","ranges":[[1,54]]},
  {"path":"stress-test/stress-upload.sh","sha256":"ec9c2be14fd9ae0aef33749cf5ebed3822ed612a5a9920f371e7cdc4433bbda0","method":"full-text","ranges":[[1,61]]},
  {"path":".editorconfig","sha256":"ccb5362b2481e656b274c17f626493bb523e9b6dfe8a939da22388ca63d951bb","method":"full-text","ranges":[[1,13]]},
  {"path":".prout.json","sha256":"7dd593d35985f9736abf0aed2a9d6714be322cc2d24ff3ee5bce72ea39ddefc8","method":"full-text","ranges":[[1,14]]},
  {"path":"stress-test/ping-grid-search.sh","sha256":"29e41ba68f0c811c056fed97a3404c174611cc57bce0898dd7e9fafb55059d4a","method":"full-text","ranges":[[1,20]]}
]
```

### Context and Administrative Receipts

These are separate from the 23 assignments. Protocol, prompt, worklog, registers and CLI remain excluded administration; the three instruction/context application entries may receive actual reading receipts only through coordinator integration. No stale prior receipt is silently recredited.

```json
[
  {"path":".github/copilot-instructions.md","sha256":"765de30857a0cc81cff1219d8fad37b4971ccab88c97d2b127f85326eee261c7","method":"full-text","ranges":[[1,154]]},
  {"path":".github/instructions/media-api.instructions.md","sha256":"0bcceb19a34ad34d957c5d3e3065ba7b5e061fa1d3c681d4939bab26be21635b","method":"full-text","ranges":[[1,152]]},
  {"path":"kupua/AGENTS.md","sha256":"6698c871e00ea4a9227db9848830f65eb68c38cc62b653c4d4bb6fe6dae6b4a6","method":"full-text","ranges":[[1,226]]},
  {"path":"kupua/exploration/docs/worklog-current.md","sha256":"7b9999c2b5e55a423cb0e4550b17cb2e4473198c744f551ace9857e70ac8a16c","method":"full-text","ranges":[[1,32]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-05-review-protocol.md","sha256":"4f667461beba9f77e3c659fcc91760bae888f7f4d1c5378079399c836651eaa4","method":"full-text","ranges":[[1,250]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-08-review-prompt.md","sha256":"b31cc5769ca2df52b6ff690aec983c33a51d55ca7e77f6f7ac6933ad39ec17bf","method":"full-text","ranges":[[1,152]]},
  {"path":"kupua/exploration/experiments/api-boundary/api-boundary-review.mjs","sha256":"7c1d2247138c79a55ea7efd6b1dc1d31ef65ddc2647bf30a4e23c80f7d0d254d","method":"line-ranges","ranges":[[299,299],[315,318]],"note":"CLI syntax checked via targeted search. Other matches were navigation only; no full tooling review or verification claimed."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-07-evidence.json","sha256":"46585016ee226163080422e2e7598352a74f5cacd34128d2a3801bdb1ba7d790","method":"json-pointers","pointers":["/schemaVersion","/claims/0/id","/claims/0/kind","/claims/0/status","/claims/1/id","/claims/1/kind","/claims/1/status","/claims/2/id","/claims/2/kind","/claims/2/status","/claims/3/id","/claims/3/kind","/claims/3/status","/claims/4/id","/claims/4/kind","/claims/4/status","/claims/5/id","/claims/5/kind","/claims/5/status","/claims/6/id","/claims/6/kind","/claims/6/status","/claims/7/id","/claims/7/kind","/claims/7/status"],"note":"Identity/kind/status metadata only; claim contents and supporting measurements not reviewed."}
]
```

Everything else in the 1,160-path universe remains semantically unread, except the explicitly listed originals. Full-text assigned/supplemental receipts cover **40 of those 1,160 paths** (35 proposed required, five proposed excluded); the other two of the 42 receipts are already-required media-api inputs. Thus **1,120 pending-universe paths have no P05 semantic read**, irrespective of proposed disposition. Binary identity checks, directory summaries, file searches, lockfile metadata and runtime-free validation must not change that number.

## 4. Evidence Dispositions

**E001-E008: retain existing dispositions, without new verification by P05.** Only their identity/kind/status metadata were inspected. No recorded performance claim was reinterpreted or tested. P01-P04 acceptance, D3 completion and baseline protections are supplied authority/context, not independently re-proven source or runtime findings here.

F1-F6 are local source facts plus explicitly labelled classification inferences. Do not create duplicate canonical performance evidence or mark any file `verified`. If the coordinator needs register evidence for classification, cite these findings and their fingerprinted originals as source/inference, not recorded measurement or executed product test. No new central E ID is required merely to store a disposition reason.

The short service READMEs are orientation evidence with known limits. In particular, media-api's older GET example is not its complete current endpoint contract; current scope comes from the protected baseline and future source review. Documentation age and confident prose do not supersede accepted scope.

## 5. Integration Requests

1. **Coordinator only:** verify the coverage/evidence hashes and pending metadata digest, expand all recipes in memory and require 1,160 unique paths, exact per-rule/per-area counts and zero fallback. Apply `disposition`, a source-qualified `reason` and `classifiedBy: "P05"` only to those snapshot records. Preserve prior assignments, receipts, stale flags and unrelated decisions. If current files differ, revalidate only affected classification claims before integration; this snapshot does not freeze development.
2. Keep the original 14 exclusions unchanged. Register this report as excluded review administration on the coordinator's next enumeration. Do not add the report to the application denominator or turn its prose into source coverage.
3. Record P05 as `reviewed`, and `accepted` only after the coordinator checks these conditions and accepts the named remaining-pending decisions. Acceptance is for the classification packet, not D001 closure. Leave D001-D003 open and D004/D005 resolved. Do not consume or revise P06's independent proposal as part of P05 integration.
4. For actual `full-text` receipts above, add reciprocal P05 assignments/packet ownership where absent **before** adding receipts. Of the assigned/supplemental originals, **37 are proposed required and five excluded**; add reading credit only for the 37 required originals. The additional three instruction/context full reads can separately receive current P05 receipts. Existing media-api ownership may coexist; do not replace another packet's work. Excluded originals and administration retain their receipts in this report. No `verified` promotion; metadata-classified paths retain their prior reading status.
5. Reconcile the four already-stale documents independently. P05 actually read current AGENTS and the current deployed general directives; it did not read the human directive copy or changelog. Do not clear all four stale flags because two were read, or because checks passed. Source-wide task correctness is not established by an instruction read.
6. Allocate required Grid envelopes into bounded follow-ups and integrate them with the separately delivered P06 allocation through the coordinator. The broad compatibility envelopes above are not one packet each: Kahuna's 351 and common-lib's 211 inventoried paths require real subdivision, not a promise of full reading in a single session. No allocation or subdelegation was performed here.

### Remaining Pending Decisions

These are dependency requests, **not newly allocated packets or new central D IDs**. The coordinator chooses packet IDs and transfers the questions with exact selectors. Asset selectors are the corresponding JSON rule; no open-ended asset hunt is requested.

| Request | Exact pending scope/count | Deciding question | Intended owner |
|---|---|---|---|
| A1 | P-cropper-assets: 4 | Which profile consumers affect existing crop/delivery response behavior, and which are confined to unchanged crop production? Determine needed evidence/fixture inspection; do not decode profiles speculatively. | Strong image-delivery reviewer |
| A2 | P-doc-assets: 5 | Do linked images carry independent workflow/architecture evidence, or only illustrative/migration UI content that can be excluded with an explicit reason? Preserve historical evidence without adopting migration support. | Strong docs/history reviewer |
| A3 | P-e2e-assets: 2 | Which current read-only assertions consume these fixture images, and what identity/visual properties form the regression contract? | Strong existing-caller/test reviewer |
| A4 | P-embedder-assets: 1 | Which producer assertions depend on this image and are relevant to AI/query compatibility? Can existing source establish its role without AWS or fixture execution? | Strong AI producer reviewer |
| A5 | P-loader-assets: 36 | Which fixtures/profiles define orientation, dimensions, metadata or delivery behavior visible to reads, versus isolated ingestion-only test detail? Trace consumers first; retain unclassified remainder explicitly. | Strong image-model/ingestion reviewer |
| A6 | P-kahuna-assets: 22 | Which image/font consumers carry authentication or interaction semantics that matter to existing-caller compatibility, versus presentation assets requiring only an exclusion receipt? | Strong existing-client reviewer |
| A7 | P-rest-assets: 6 | Which shared REST/image-processing assertions consume the fixtures, and what read-delivery guarantees do they establish? | Strong image-delivery/test reviewer |
| S1 | `scripts/src/main/java/`: 100 | Does configuration conversion or its repository-local config implementation participate in current setup/deployment of the read services? Trace imports and setup call sites first. If absent from the relevant path, propose a provenance-based whole-subtree exclusion; otherwise bound the actual required implementation. | Strong configuration/build reviewer |
| S2 | `scripts/src/` excluding `scripts/src/main/java/` and the two read Scala originals: 13 | Which remaining helpers/commands define live mapping/model/config or supported caller semantics rather than solely manual maintenance? The build alone cannot decide this. | Strong Grid model/configuration reviewer |
| S3 | `scripts/cleanup-s3/` (4), `scripts/embedder-deploy/` (5), `scripts/mass-deletion/` (2), `scripts/sample-images/` (5), `scripts/usage-reindex/` (1): 17 | Which setup, sample-fixture or deployment dependencies exist, versus purely operational writers? Keep the sample lockfile with its package/consumer decision. Do not execute tools or read credential/runtime payloads. | Strong tooling/fixture reviewer |

A1-A7 total 76; S1-S3 total 130. Stop a follow-up at its named dependency boundary if resolving it would require an unbounded audit; return the precise unresolved subset. Missing authority to inspect potentially sensitive material goes to the coordinator for an operator decision, not an implied exception. No present classification requires new live access or a safety-policy relaxation.

## 6. Checks and Limits

- Ran `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs packet P05` and the existing read-only `check` command. The register check returned zero errors, four expected stale-document warnings, 1,793 entries and `readyForSynthesis: false`. P01-P04 were accepted; P05/P06 ready; three dependencies open. An initial packet invocation returned P06 metadata unexpectedly; a repeat and direct JSON extraction confirmed P05. No P06 report/draft was opened or used.
- Used read-only Node JSON extraction for the complete pending metadata, current exclusions, group/kind/line totals, binary and lockfile membership, P05 assignments and dependency metadata. Large initial summaries exceeded terminal scrollback; they were not treated as complete evidence. Compact extraction, complete in-memory accounting and the metadata digest establish membership.
- Recomputed all 1,160 pending SHA-256 values with `lstat` and workspace-containment checks before content access. All matched; no pending symlinks. Separately computed current hashes and physical line counts for every proposed receipt. Credential/runtime exclusions were neither opened nor hashed. No Git child process was used.
- Read-only Node report validation **passed**: all four JSON blocks parsed; 16 rules matched all 1,160 paths with zero overlaps and zero unmatched paths; all 25 area totals reconciled to 949 required, five excluded and 206 pending. The snapshot hash/digest, 22 assigned and 20 supplemental full-text receipts, all 50 receipt hashes/ranges/pointers, evidence references and 35 local Markdown links checked successfully. The empty root lockfile assertion also passed. Bookkeeping validation cannot certify the semantic classification or production safety.
- No npm/test/build suite, browser, app, service, network, ES, AWS or performance command ran. No scripts described by the input documentation ran. No Git mutation, register/worklog/routing edit, code edit or subdelegation occurred. The only intentional workspace output is this report, written with `apply_patch`; no secondary report, scratch program or competing register was created.
- Failed lookups for a guessed prompt filename and a guessed Kahuna controller filename returned no content; the correct originals are receipted above. Navigation searches and the supplied persistent memory informed procedure only, not application evidence. No memory file was modified under this report-only mandate.
- Read-only review cannot promise future API capacity, production topology safety, correctness of unread source, or the absence of ignored/untracked material beyond this frozen inventory. Required review and the named 206 pending paths remain honest unfinished work. Stop after this report and return integration to the coordinator.