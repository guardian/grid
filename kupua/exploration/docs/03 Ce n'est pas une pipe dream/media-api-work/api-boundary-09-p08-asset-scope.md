# API boundary P08: asset and fixture relevance

## 1. Decision

**Accept with named unfinished decisions.** All **101 inputs** are accounted for exactly once: propose **94 excluded, five review-required and two scope-pending**. The two pending provenance decisions are the documentation roundel and the unreferenced grayscale-profile fixture. Four of the five retained inputs are opaque screenshot baselines: their relevance is established, but their pixels remain unread and the present closure vocabulary cannot honestly credit a visual/structural binary review as a full read.

This is a classification proposal for the read-only API-boundary review, not approval to delete, replace, stop shipping or stop testing any asset. Exclusion of unchanged payload internals does not exclude the source contracts producing, presenting or testing those payloads. No workflow, performance baseline, accepted approximation or existing plan is changed. The coordinator alone integrates dispositions, receipts and decisions.

| Dependency / original group | Inputs | Required | Excluded | Pending |
|---|---:|---:|---:|---:|
| D006 / cropper | 4 | 0 | 4 | 0 |
| D007 / docs | 5 | 0 | 4 | 1 |
| D008 / e2e-tests | 2 | 0 | 2 | 0 |
| D009 / image-embedder-lambda | 1 | 0 | 1 | 0 |
| D010 / image-loader | 36 | 0 | 36 | 0 |
| D011 / kahuna | 22 | 0 | 22 | 0 |
| D012 / rest-lib | 6 | 0 | 5 | 1 |
| D022 / kupua/public | 19 | 1 | 18 | 0 |
| D022 / visual baselines | 4 | 4 | 0 | 0 |
| D022 / mail fixtures | 2 | 0 | 2 | 0 |
| **Total** | **101** | **5** | **94** | **2** |

## 2. Material Findings

### F1. Profiles belong to unchanged media production

[CropperComponents](../../../../../cropper/app/CropperComponents.scala#L13) and [ImageLoaderComponents](../../../../../image-loader/app/ImageLoaderComponents.scala#L29) construct `ImageOperations` with the application root. [ImageOperations](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/imaging/ImageOperations.scala#L24) explicitly names all four root profiles: RGB, CMYK, grayscale and the smaller output RGB profile. Its crop, thumbnail and transform operations apply them; [Crops](../../../../../cropper/app/lib/Crops.scala#L34) produces and stores crop assets. This is real upstream delivery relevance, not evidence of a new read-time colour conversion dependency.

**Disposition:** exclude the four cropper profile payloads and the four loader root copies from this review's binary-reading denominator; keep their producing code/contracts required. The loader test-resource sRGB copy is byte-identical to the loader root sRGB profile, but no distinct named consumer was found in the bounded test trace. Exclude that duplicate's internals on verified provenance, not on its extension. No ICC decoding, colour-quality verification or removal is proposed.

### F2. Four documentation illustrations are bounded; one provenance gap remains

[The repository introduction](../../../../../README.md#L14) embeds the dated search screenshot as an introduction, not a current regression oracle. [The migration guide](../../../../../docs/05-migration/02-how-to.md#L39) ties the other three screenshots to starting a migration, viewing errors and an error overview; its prose supplies those operational steps. Exclude these four illustration payloads from the present read-only boundary review. This does not assert that their pixels contain no additional information. They were not viewed. Historical UI/operational illustration is not authority to revive migration support, and the referring text remains available to its owning review.

The [archived upload snippet](../../../../../docs/99-archives/04.03-upload-image.md#L6) and [archived checksum snippet](../../../../../docs/99-archives/04.05-media-api.md#L12) mention a roundel basename, but their relative reference resolves to a missing location, not the assigned [roundel](../../../../../docs/00-about/images/roundel.jpg). Basename similarity alone does not establish this file's provenance. **Keep that one file scope-pending.** Coordinator decision: establish its source/consumer, or obtain an explicit exclusion decision for this otherwise untraced legacy illustration. No visual or broader historical investigation is implied here.

### F3. Grid E2E images exercise upload state and byte thresholds

[Upload setup](../../../../../e2e-tests/steps/upload/setup.ts#L14) obtains the two fixtures' actual byte sizes and assigns smaller/larger roles. [Upload steps](../../../../../e2e-tests/steps/upload/upload.steps.ts#L72) use them for in-progress upload state, selected-file queues and a threshold between their sizes. The same file reads existing-caller navigation assertions: returning to search, preserving the previous query and filtering by uploader. The initial loader-link assertion is also a compatibility contract, not fixture pixel content.

**Disposition:** exclude both JPEG payloads, retaining the source assertions and upload/read-navigation boundary for existing-caller review. No visual assertion or semantic-image oracle was found in this consumer. This does not establish current test success, nor that uploads belong in Kupua's read-only implementation.

### F4. The embedder image is a resize fixture, not an AI relevance oracle

[The downscale test](../../../../../image-embedder-lambda/__tests__/embedder/downscale.test.ts#L13) uses the single image as the source of resized JPEG/PNG cases. It asserts exact dimensions, pixel totals and byte counts, downscaling limits, and object identity when no change is needed. It would write output images if executed; it was only read.

**Disposition:** exclude the original payload from API-boundary reading while preserving these producer constraints and the test source. This does not certify embeddings, ranking quality, model interchangeability or AWS behaviour. No image conversion, AWS operation or fixture execution occurred.

### F5. Loader fixtures encode upstream contracts without making ingestion a migration task

[Metadata-reader assertions](../../../../../image-loader/test/scala/lib/imaging/FileMetadataReaderTest.scala#L26) distinguish raw dimensions from EXIF orientation, including a 90-degree tag and no material zero-degree correction. [Redaction assertions](../../../../../image-loader/test/scala/lib/imaging/FileMetadataReaderTest.scala#L160) cover long ICC/XMP values and preservation of a long description. [Colour assertions](../../../../../image-loader/test/scala/lib/imaging/FileMetadataReaderTest.scala#L654) distinguish palette, true-colour, alpha and grayscale properties. [MIME tests](../../../../../image-loader/test/scala/lib/imaging/MimeTypeDetectionTest.scala#L15) accept existing formats and reject the two raw-format samples.

[C2PA tests](../../../../../image-loader/test/scala/lib/imaging/C2paDetectorTest.scala#L14) cover present/absent containers for three formats, mismatch and missing-file handling. [The metadata producer](../../../../../image-loader/app/lib/imaging/FileMetadataReader.scala#L57) publishes the presence result into `FileMetadata`; this is not signature authenticity validation. Its adjacent namespace normalization explains why supplier/header fixture semantics matter to read models.

The [upload test](../../../../../image-loader/test/scala/model/ImageUploadTest.scala#L97) describes original MIME, JPEG thumbnail and optional optimised-PNG expectations, but **all its image cases are `ignore`**, not evidence of current execution or a passing gate. Do not promote them to working coverage.

The following partition accounts for all 36 loader inputs; names below are existing fixture paths, not copied payload identities. All receive the same exclusion of unchanged payload internals. Consumers and their observable data contracts remain required.

| Loader subset | Count | Actual evidence / boundary |
|---|---:|---|
| Four root profiles and test-resource sRGB copy | 5 | F1; exact duplicate identity for the fifth, no independent test consumer asserted |
| Two raw-format samples | 2 | MIME rejection assertions; no raw decoding performed |
| Two EXIF-orientation JPEGs | 2 | Separate orientation and raw-dimension assertions |
| Four `schaik.com_pngsuite` PNGs | 4 | MIME, dimension and colour-model assertions |
| Six `c2pa` fixtures | 6 | Presence/absence assertions, not authenticity checks |
| `getty.jpg`, `corbis.jpg`, `pa.jpg`, `guardian-turner.jpg`, `cech.jpg`, `flag.tif` | 6 | Named metadata-reader resources; MIME/dimension assertions where read. Large expected metadata maps and original embedded identities were not inspected or copied |
| `longICC.png`, `longXMP.jpg`, `longdescription.png` | 3 | Redaction/preservation assertions actually read |
| `flower.tif`, `lighthouse.tif`, `IndexedColor.png`, two 16-bit PNGs, `rubbish.jpg`, two `tiff_8bpc` TIFFs | 8 | Dimension/colour/C2PA assertions where applicable; dormant upload conversion cases, not live regression evidence |

**Consequence:** the migration must preserve the consumer-visible metadata, orientation and image-delivery contracts; it need not re-ingest or reinterpret these bytes. Exclusion is conditional on that unchanged producer boundary. A future proposal to change image production would need to revisit these exclusions; none is selected here.

### F6. Kahuna presentation assets include authentication help, not authentication decisions

[Kahuna CSS](../../../../../kahuna/public/stylesheets/main.css#L20) references all 18 Open Sans files and both Material Icons encodings, including the two medium-weight fonts. [The font provenance notice](../../../../../kahuna/public/stylesheets/fonts/README.md#L1) identifies the Open Sans licence. The Material Icons CSS reference is not a completed licence audit of that separate font family.

[The global-error template](../../../../../kahuna/public/js/errors/global.html#L1) uses the blocked-cookie PNG in invalid-session and failed-authentication help. Its condition, reauthentication links, alternative text and help link are in the template, not the PNG. [The page shell](../../../../../kahuna/app/views/main.scala.html#L35) uses the 32-pixel PNG as the alternate favicon.

**Disposition:** exclude all 22 unchanged binary presentation payloads from this review. Preserve the auth/help and icon-consumer source review; do not call those behaviours irrelevant, replace icons or change font metrics. No glyph, icon-pixel or browser rendering verification is claimed.

### F7. Five REST fixtures have a dormant colour-model test trace; the sixth does not

[ImageOperationsTest](../../../../../common-lib/src/test/scala/com/gu/mediaservice/lib/imaging/ImageOperationsTest.scala#L15) is class-level `@Ignore`. It names five of the six payload basenames and asserts colour model from JPEG image data, including an incorrect embedded CMYK profile. Its TODO explicitly does not establish crop-conversion coverage. [The build edge](../../../../../build.sbt#L132) makes rest-lib depend on common-lib test code; this is not proof that the disabled common-lib test currently resolves rest-lib's resources or is executed there.

**Disposition:** exclude those five named payloads from the read-only boundary review, with the disabled/shared-resource qualification above. They are provenance for unchanged production identification assertions, not current read-endpoint tests. The bounded source search found no literal consumer for [grayscale-with-profile.jpg](../../../../../rest-lib/src/test/resources/grayscale-with-profile.jpg); the test only names the without-profile grayscale variant. **Keep the sixth scope-pending**, rather than infer a test from its filename. Coordinator decision: establish an actual consumer/provenance or obtain an explicit exclusion for an unused companion fixture. No test-health repair or new run is requested.

### F8. Mail fixtures test quota-import parsing, not a read endpoint

[UsageStoreTest](../../../../../media-api/test/lib/UsageStoreTest.scala#L7) loads both fixtures and asserts CSV extraction/parsing and non-ASCII tolerance. [UsageStore](../../../../../media-api/app/lib/UsageStore.scala#L69) uses a MIME parser, selects a base64 part, then parses a two-column quota CSV. Its [state-loading path](../../../../../media-api/app/lib/UsageStore.scala#L162) normalizes supplier counts and combines them with quotas. [Quota reads](../../../../../media-api/app/controllers/UsageController.scala#L68) and the [under-quota filter](../../../../../media-api/app/lib/elasticsearch/IsQueryFilter.scala#L61) consume the resulting state. Thus the source/state contract really is relevant to reads; the original mail envelopes are not read-request inputs.

**Disposition:** exclude both unchanged mail payloads from this boundary review; keep the parser/state/filter/controller contracts and tests required. Consumers suffice to decide relevance, so a MIME inspection would add exposure without answering a remaining classification question. No mail header, address, body or attachment identity was displayed, parsed or copied. Fixture bytes were accessed only for hashing. No claim is made about their actual encoding tree, identities, harmlessness or absence of secrets. No privacy exception is required for this disposition.

### F9. Kupua presentation stays unchanged; retain licence and pixel baselines

[Kupua CSS](../../../../src/index.css#L284) documents self-hosted copies of Kahuna Open Sans, and declares all 16 files. A byte comparison confirmed all 16 copies and the licence are identical to the corresponding Kahuna files. **Exclude the 16 font binaries**, not their loading, glyph metrics or distribution obligations. [OFL](../../../../public/fonts/OFL.txt#L47) was read fully: retaining its notice/licence when distributing bundled fonts is relevant to deployment, so **keep that one text file required and credit its actual full read**.

Both SVGs were fully read as source. They contain only static geometry/style, with no script or external resource reference. [The HTML shell](../../../../index.html#L7) references the favicon. [SearchBar](../../../../src/components/SearchBar.tsx#L156) and [ImageDetail](../../../../src/components/ImageDetail.tsx#L691) own the logo's home/reset interaction outside the SVG. **Exclude the two unchanged SVG payloads** while retaining those interaction contracts; this is not a home-navigation review or a rendering check.

[Visual-baseline tests](../../../../e2e/local/visual-baseline.spec.ts#L20) explicitly compare grid, table, detail and query screenshots at `maxDiffPixelRatio: 0.001`, after selecting explicit focus mode. **Keep all four PNGs required.** Their pixels are independent expected data, unlike a general documentation illustration. No image was viewed: consumer evidence already decides relevance, and this review does not certify their freshness, content or agreement with today's UI.

**Exact closure limitation:** [fullyRead](../../../experiments/api-boundary/api-boundary-review.mjs#L122) only credits `full-text` or complete line coverage. The [validator](../../../experiments/api-boundary/api-boundary-review.mjs#L240) rejects structural-only `read` status; these four binaries have no line count. A fabricated `full-text` receipt would be dishonest. Leave them `review-required` / `inventoried`, without payload receipts. Coordinator/operator must decide an honest safe visual/structured review and its closure representation, or an explicit scope decision. P08 changes no tooling and does not invent a new status or pretend that a future visual inspection already happened.

## 3. Coverage Receipt

### Exact Input And Disposition Recipe

The current 101 selected metadata records have SHA-256 `03c2e86693f78833f39717d9f7e6d62ab74c00ab8f57eafb3427062e9451fc1c`. Select the seven `metadataFields` below in order, sort paths by JavaScript code-unit order, then hash UTF-8 `JSON.stringify(rows)` without an added newline. All 101 current content hashes matched the register after symlink and workspace-containment checks. Hashing is not semantic reading.

The assigned register snapshot SHA-256 is `b7312357fb208e035b846417e9daa7b1cd519b802e30bb99f5c7e87f13c5f3df`; inventory HEAD is `0e79a4dec637e3eaf05bb252c2ec7f95e8e68c8d`, generated at `2026-09-19T13:05:04.732Z`. Historical P05/P06 whole-register hashes are not current-scope gates. At integration, check path membership and current per-input hashes/digest; unrelated coordinator integration may legitimately alter the whole register hash.

Selectors operate only on the 101-record input union below, not on arbitrary future files. `paths`/`prefixes` are OR alternatives; `kinds` is an AND restriction; `excludePaths` subtracts. Require exactly one rule per input, never first-match wins. Counts and digest changes stop automatic integration. The recipe is a proposal, not another register.

```json
{
  "packetId": "P08",
  "metadataFields": ["path", "area", "present", "kind", "bytes", "lines", "sha256"],
  "metadataSha256": "03c2e86693f78833f39717d9f7e6d62ab74c00ab8f57eafb3427062e9451fc1c",
  "inputCount": 101,
  "inputs": [
    {"prefixes":["cropper/","docs/","e2e-tests/","image-embedder-lambda/","image-loader/","kahuna/","rest-lib/"],"kinds":["binary"],"count":76},
    {"prefixes":["kupua/public/","kupua/e2e/local/visual-baseline.spec.ts-snapshots/","media-api/test/resources/"],"count":25}
  ],
  "rules": [
    {"id":"X-cropper","disposition":"excluded","count":4,"selector":{"prefixes":["cropper/"],"kinds":["binary"]},"evidence":["F1"],"reason":"Unchanged crop-production profile payloads; consumers remain required."},
    {"id":"X-docs","disposition":"excluded","count":4,"selector":{"prefixes":["docs/"],"kinds":["binary"],"excludePaths":["docs/00-about/images/roundel.jpg"]},"evidence":["F2"],"reason":"Consumer-established introductory or migration-operation illustrations, not current pixel regression expectations; pixels unread."},
    {"id":"P-roundel","disposition":"scope-pending","count":1,"selector":{"paths":["docs/00-about/images/roundel.jpg"]},"evidence":["F2"],"reason":"Archived basename references resolve elsewhere; exact provenance or explicit exclusion decision remains with coordinator."},
    {"id":"X-e2e","disposition":"excluded","count":2,"selector":{"prefixes":["e2e-tests/"],"kinds":["binary"]},"evidence":["F3"],"reason":"Upload-state and byte-threshold fixtures; source navigation assertions remain required, no pixel contract found in this consumer."},
    {"id":"X-embedder","disposition":"excluded","count":1,"selector":{"prefixes":["image-embedder-lambda/"],"kinds":["binary"]},"evidence":["F4"],"reason":"Unchanged producer resize fixture, not AI query/embedding relevance evidence."},
    {"id":"X-loader","disposition":"excluded","count":36,"selector":{"prefixes":["image-loader/"],"kinds":["binary"]},"evidence":["F1","F5"],"reason":"Mapped unchanged production/ingestion fixture internals; preserve dimension/orientation/MIME/metadata/C2PA/thumbnail contracts in source review; ignored cases are not passing coverage."},
    {"id":"X-kahuna","disposition":"excluded","count":22,"selector":{"prefixes":["kahuna/"],"kinds":["binary"]},"evidence":["F6"],"reason":"Unchanged CSS/template presentation payloads; auth help and icon semantics remain with their source consumers."},
    {"id":"X-rest","disposition":"excluded","count":5,"selector":{"prefixes":["rest-lib/"],"kinds":["binary"],"excludePaths":["rest-lib/src/test/resources/grayscale-with-profile.jpg"]},"evidence":["F7"],"reason":"Five named dormant colour-identification fixtures; test resource resolution/execution not certified and consumer code remains required."},
    {"id":"P-rest-extra","disposition":"scope-pending","count":1,"selector":{"paths":["rest-lib/src/test/resources/grayscale-with-profile.jpg"]},"evidence":["F7"],"reason":"No named consumer found in bounded shared-library test trace; coordinator must resolve provenance or explicit exclusion."},
    {"id":"X-kupua-fonts","disposition":"excluded","count":16,"selector":{"prefixes":["kupua/public/fonts/"],"kinds":["binary"]},"evidence":["F9"],"reason":"Documented unchanged presentation dependencies, all byte-identical to Kahuna copies; preserve licence and loading declarations."},
    {"id":"R-licence","disposition":"review-required","count":1,"selector":{"paths":["kupua/public/fonts/OFL.txt"]},"evidence":["F9"],"reason":"Bundled-font redistribution conditions relevant to deployment; actual full text read."},
    {"id":"X-logos","disposition":"excluded","count":2,"selector":{"paths":["kupua/public/images/grid-logo.svg","kupua/public/images/grid-favicon.svg"]},"evidence":["F9"],"reason":"Fully read static geometry; reset/navigation behaviour belongs to required surrounding source, not the unchanged SVG payloads."},
    {"id":"R-snapshots","disposition":"review-required","count":4,"selector":{"prefixes":["kupua/e2e/local/visual-baseline.spec.ts-snapshots/"],"kinds":["binary"]},"evidence":["F9"],"reason":"Active pixel-comparison expected data; pixels unread and binary closure requires coordinator/operator decision."},
    {"id":"X-mail","disposition":"excluded","count":2,"selector":{"paths":["media-api/test/resources/example.mail","media-api/test/resources/nonascii.mail"]},"evidence":["F8"],"reason":"Unchanged quota-import parser fixtures, not read requests; source/state/read-filter contracts retained; payload inspection unnecessary and not performed."}
  ],
  "totals":{"review-required":5,"excluded":94,"scope-pending":2},
  "unmatchedExpected":0,
  "overlapExpected":0
}
```

Per-group fingerprints use the same metadata algorithm, within each named input group:

```json
[
  {"group":"cropper","count":4,"metadataSha256":"f49f2f50b7cc6eed57346e5c4e0c674a0571d83f3c724cb83dd40cdff0e0de3e"},
  {"group":"docs","count":5,"metadataSha256":"6efcbe4eb2efdc41a1e5f96093caed6e2067c557f49753ce6e7e32aa1322d1b1"},
  {"group":"e2e-tests","count":2,"metadataSha256":"0c023048c19f0729ffeafe252ec62c86ca41015e809552740578681e879f8398"},
  {"group":"image-embedder-lambda","count":1,"metadataSha256":"974ebbe4907abe8771d831f3eee177d028efca0c84f7557f707ec8ec25b18817"},
  {"group":"image-loader","count":36,"metadataSha256":"f116871ffce3fe3994a7438c5c06b77b76bfb39990d82cc6e07439270d11ec07"},
  {"group":"kahuna","count":22,"metadataSha256":"77fa42653f1d21fa3df8dee41f0257c73822c09585d711b0ce818c4865ed94ad"},
  {"group":"rest-lib","count":6,"metadataSha256":"c98d4c25a6f4c523042c72044dad45dd7612ef1cdf84e833cb1f69ae36592149"},
  {"group":"kupua-public","count":19,"metadataSha256":"d14a4fa949b99d913fa5a5cc5f5eadd702b5aa5b72a2d450b957742c4d535a47"},
  {"group":"snapshots","count":4,"metadataSha256":"8bdee453c86823553e85dfd19fd42553688d52fa6da8b67fbb17313055718900"},
  {"group":"mail","count":2,"metadataSha256":"98d038ac806f7606b4a39a0bd6999bc2cbf6f42988fdbcbe688840807ce07152"}
]
```

### Actual Reading Receipts

Ranges are 1-based inclusive. `full-text` below means actual source/text reading, never font, raster or MIME inspection. The register was parsed structurally: `/baseline`, `/enumeration`, P08's `/packets/7`, D006-D012 and D022 under `/dependencies`, and the selected metadata fields under `/files`. Filtering traversed metadata, not all source contents. No application-reading credit follows from register metadata, checksums or a basename search.

The first eight receipts cover instructions/assigned context. **P05 and P06 were not fully read.** P05's F6/selectors/A1-A7 and P06's ASSETS selector/purpose/ALLOC-ASSETS are covered in the ranges shown; additional displayed accounting/recipe/integration prose is context only. Unlisted lines remain uncredited. P07, P09, P10 and any drafts were not consulted. The worklog was read, not edited or reset.

```json
[
  {"path":".github/copilot-instructions.md","sha256":"765de30857a0cc81cff1219d8fad37b4971ccab88c97d2b127f85326eee261c7","method":"full-text","ranges":[[1,154]]},
  {"path":".github/instructions/media-api.instructions.md","sha256":"0bcceb19a34ad34d957c5d3e3065ba7b5e061fa1d3c681d4939bab26be21635b","method":"full-text","ranges":[[1,152]]},
  {"path":"kupua/AGENTS.md","sha256":"6698c871e00ea4a9227db9848830f65eb68c38cc62b653c4d4bb6fe6dae6b4a6","method":"full-text","ranges":[[1,226]]},
  {"path":"kupua/exploration/docs/worklog-current.md","sha256":"88a5797e85afb50d12e3152d42fc3776d5914cf2f38b4241c3131181924a7a17","method":"full-text","ranges":[[1,35]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-05-review-protocol.md","sha256":"4f667461beba9f77e3c659fcc91760bae888f7f4d1c5378079399c836651eaa4","method":"full-text","ranges":[[1,250]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-08-review-prompt.md","sha256":"b31cc5769ca2df52b6ff690aec983c33a51d55ca7e77f6f7ac6933ad39ec17bf","method":"full-text","ranges":[[1,152]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p05-grid-scope.md","sha256":"9b43a508e0ed7b72ade9010f20a569f8ce3523614fad56f67544a2cf5b5fd0f1","method":"line-ranges","ranges":[[53,144],[220,271]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p06-corpus-allocation.md","sha256":"dfda9c0c595125b27432351c6eb11a91d44db04814c68e520eb467a191560896","method":"line-ranges","ranges":[[180,279],[300,380],[635,660]]},
  {"path":"media-api/test/lib/UsageStoreTest.scala","sha256":"93c4f6d7af6fdf4c189c333f0f78a81b023eeccecb8a44d9d6d21258998d0534","method":"full-text","ranges":[[1,30]]},
  {"path":"media-api/app/lib/UsageStore.scala","sha256":"8c1b0fc4ddc1d8a200c3990dcc808cbbeee6f0ed016c41d9b7ed0c1db04b7866","method":"full-text","ranges":[[1,231]]},
  {"path":"media-api/app/lib/elasticsearch/IsQueryFilter.scala","sha256":"4d06533f44ddf6dd5fc48ff7b4cb78e8664dcb9f8d0dc9fa1931385201cca121","method":"line-ranges","ranges":[[28,76]]},
  {"path":"media-api/app/controllers/UsageController.scala","sha256":"2a72c37435f0522649928c577ef6e9d9068722f4e56d1ace63580949cd271f30","method":"line-ranges","ranges":[[65,110]]},
  {"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/imaging/ImageOperations.scala","sha256":"d8ab565e06951ee8bfca85fac632eee3928a7954bf51974fc0b7bc73ad632601","method":"line-ranges","ranges":[[1,280]]},
  {"path":"cropper/app/lib/Crops.scala","sha256":"e1c8f77213437702bc80498c0ed913ded27b8276669d2382724617c99331ae91","method":"full-text","ranges":[[1,150]]},
  {"path":"cropper/app/CropperComponents.scala","sha256":"6d5f96870b01045a82f9397e55c437602ebb3134c2dde5fb8ab682fd3c33625c","method":"full-text","ranges":[[1,24]]},
  {"path":"image-loader/app/ImageLoaderComponents.scala","sha256":"7fa6bd7e3ff2430374b52a00801921d0d3b3c01743e7143fc2411d69287c9d72","method":"line-ranges","ranges":[[18,42]]},
  {"path":"image-loader/app/lib/imaging/FileMetadataReader.scala","sha256":"acaa00a85437534186baf612455f8e358eb71cb0e09363f35af5d2438daccd58","method":"line-ranges","ranges":[[30,86]]},
  {"path":"image-loader/test/scala/lib/imaging/FileMetadataReaderTest.scala","sha256":"6730520c81f4161db218cb56c4a1d822330568af4899dfd300471cae2273471d","method":"line-ranges","ranges":[[1,84],[117,117],[123,123],[153,185],[190,190],[234,234],[246,248],[250,250],[260,260],[289,291],[293,293],[303,303],[347,347],[358,358],[366,366],[398,398],[420,420],[487,487],[509,509],[585,585],[648,723]],"note":"Continuous source reads were 1-83, 153-185 and 648-723; isolated additional lines are displayed resource/metadata search hits only, not the intervening expected maps."},
  {"path":"image-loader/test/scala/model/ImageUploadTest.scala","sha256":"5d00a6a9223c5bae9abdcc23fca2f2764c1b8370dc082090a2421e43ab866213","method":"full-text","ranges":[[1,150]]},
  {"path":"image-loader/test/scala/lib/imaging/C2paDetectorTest.scala","sha256":"0d952f98f11cd9a02e80d26f07a0d9700b74edade6a2ad328a6ca0f7176f4593","method":"full-text","ranges":[[1,60]]},
  {"path":"image-loader/test/scala/lib/imaging/MimeTypeDetectionTest.scala","sha256":"f6b003e431297da94708a5c95f72dd57fc4ffe304e846ac1ede071f37726fe9e","method":"full-text","ranges":[[1,45]]},
  {"path":"common-lib/src/test/scala/com/gu/mediaservice/lib/imaging/ImageOperationsTest.scala","sha256":"15cedc705ca1995717f8e01f9ed35bf8c8edcb2bbb4c416b1fb3a2b6c6870006","method":"full-text","ranges":[[1,70]]},
  {"path":"e2e-tests/steps/upload/setup.ts","sha256":"f70e2ae8215772df97a38c57bbe6f7d465077e987ce8f502044f4e3327df8a11","method":"full-text","ranges":[[1,52]]},
  {"path":"e2e-tests/steps/upload/upload.steps.ts","sha256":"94c4320e5b1466a057503a3de052f5726f50154af581a6605cf2cfbc190d318c","method":"full-text","ranges":[[1,182]]},
  {"path":"image-embedder-lambda/__tests__/embedder/downscale.test.ts","sha256":"4cdb3924371e9009784b2ff2a92412b0f74541ae54481731570435c1e7f56730","method":"full-text","ranges":[[1,176]]},
  {"path":"kupua/e2e/local/visual-baseline.spec.ts","sha256":"ba737d5dc257c831c24d117291ed1d3a55f22cb0b6867345d99ca8bd26efb320","method":"full-text","ranges":[[1,51]]},
  {"path":"kahuna/public/stylesheets/fonts/README.md","sha256":"fe2f4db2d0cb23bfe3b1ec5506c7e95ea8b55a240f4a856f84f45fefbeff6ed1","method":"full-text","ranges":[[1,10]]},
  {"path":"kahuna/public/js/errors/global.html","sha256":"cb50e7ecf6e40755000bc8768b1ebaeae9704bfc510ebef7583a596ce3704abf","method":"full-text","ranges":[[1,61]]},
  {"path":"kupua/public/fonts/OFL.txt","sha256":"29d0877530019331700511ef4224c74fbb2d46c98f96a3ef511f19ca2e5c1cd1","method":"full-text","ranges":[[1,93]]},
  {"path":"kupua/src/index.css","sha256":"b52496cf28fa7eac1d0db50a3937c96ff09082bc8dae9f3be192b5e39173162e","method":"line-ranges","ranges":[[280,440]]},
  {"path":"kahuna/public/stylesheets/main.css","sha256":"932677324f47067e47d690006d02c0f56901fa3a9af7bc9e4a359dc72d0fa4a3","method":"line-ranges","ranges":[[1,420]]},
  {"path":"kupua/public/images/grid-logo.svg","sha256":"2007b6c86b23e9a543a8dae4ad7d42e060179e28df549eab5c4533bff3ec2115","method":"full-text","ranges":[[1,3]]},
  {"path":"kupua/public/images/grid-favicon.svg","sha256":"e33d1919aa2c216175141fe152cf1c14ae78ed31444e9e13795e7c10ca47fba5","method":"full-text","ranges":[[1,4]]},
  {"path":"kupua/index.html","sha256":"19a6ca695b3406ee6c95806ad7b2c4aa7f2e0e173fc970e3403b7513e2e2012e","method":"full-text","ranges":[[1,15]]},
  {"path":"docs/05-migration/02-how-to.md","sha256":"f5020e860d1b518f09731c2c1bd6aaa709a47bd2bfb2ee5bdcb9f1cbf9c84f1c","method":"full-text","ranges":[[1,93]]},
  {"path":"README.md","sha256":"6f9df4afdda2b826c73adcbd762acdd14aaad3042f8f0b478ad4dd50a1aa1a48","method":"full-text","ranges":[[1,26]]},
  {"path":"kupua/exploration/experiments/api-boundary/api-boundary-review.mjs","sha256":"7c1d2247138c79a55ea7efd6b1dc1d31ef65ddc2647bf30a4e23c80f7d0d254d","method":"line-ranges","ranges":[[17,17],[115,155],[217,250]]},
  {"path":"build.sbt","sha256":"37f61825eb037c03f93cfc3b7ab0b565d67e36612580003216c914d43a00dd6e","method":"line-ranges","ranges":[[88,142]]},
  {"path":"kupua/src/components/SearchBar.tsx","sha256":"55ee9516b93e4f5616ed86490f02c37a583b64ad69846baa4e8a95b309056cba","method":"line-ranges","ranges":[[151,179]]},
  {"path":"kupua/src/components/ImageDetail.tsx","sha256":"96ef263e395375da1c0939ca8f613e6a403e1b551934de80c0cae1abb41ee71b","method":"line-ranges","ranges":[[689,720]]},
  {"path":"kahuna/app/views/main.scala.html","sha256":"051d778b73d9f54953141f7024e7b736e9e0750261fa3401c433ff684713b0f0","method":"line-ranges","ranges":[[30,40]]},
  {"path":"docs/99-archives/04.03-upload-image.md","sha256":"6de7c6936d9896b6c95c432535c42365a3412638dee8aeea6631d7c078d162c0","method":"line-ranges","ranges":[[6,6]],"note":"Displayed filename-reference search hit only; not an archive-document read."},
  {"path":"docs/99-archives/04.05-media-api.md","sha256":"446bf8d05657cf2c4d5467b1f06b0065393a431fff187a985e32923b29d48861","method":"line-ranges","ranges":[[12,12]],"note":"Displayed filename-reference search hit only; not an archive-document read."}
]
```

Other search-result snippets were routing only; no full-read credit, findings about their behaviour, or full-search-scope comprehension is claimed. Persistent procedure memory and tool-output captures are not application evidence. No handoff-named file was explicitly routed by AGENTS for this packet.

### Structural, Visual And Unread Accounts

All 101 asset fingerprints were verified; **only three selected assets were text-read**: the licence and two SVGs. The other **98 selected inputs have no payload semantic receipt**. There were **zero visual inspections, zero font/profile decodes and zero MIME parses**. Test-source reading is not test execution. No binary inspection is disguised as a `full-text` receipt.

The mechanical copy check covers all 16 selected Kupua fonts and their selected Kahuna counterparts. The unselected Kahuna licence was hashed only for equality with the fully read Kupua licence (`29d0877530019331700511ef4224c74fbb2d46c98f96a3ef511f19ca2e5c1cd1`); no additional text-reading credit is requested. The loader test-resource/root sRGB pair shared `2b3aa1645779a9e634744faf9b01e9102b0c9b88fd6deced7934df86b949af7e`. These are identity/provenance checks, not structural comprehension of binary internals.

Exact unfinished inputs and current fingerprints:

```json
[
  {"path":"docs/00-about/images/roundel.jpg","sha256":"05795967e680e0ab07ed3ed487d9091baa8f393a5e4563f37df13b6f3477f279","disposition":"scope-pending","status":"inventoried","dependency":"D007"},
  {"path":"rest-lib/src/test/resources/grayscale-with-profile.jpg","sha256":"66a466ef7c71aed4cc1bbab9b79786def5f3f297069fde8fdb82c5dad8c458b7","disposition":"scope-pending","status":"inventoried","dependency":"D012"},
  {"path":"kupua/e2e/local/visual-baseline.spec.ts-snapshots/grid-view-chromium-darwin.png","sha256":"c732759044ed03d1ca476445a6036dcfe3df8ddb4d0e200450bdb499f1bdcd48","disposition":"review-required","status":"inventoried","dependency":"D022"},
  {"path":"kupua/e2e/local/visual-baseline.spec.ts-snapshots/image-detail-chromium-darwin.png","sha256":"40f19aaa65337a96ea8388a17605fd48b58c74d3e570a0f261dd545b63a40c0a","disposition":"review-required","status":"inventoried","dependency":"D022"},
  {"path":"kupua/e2e/local/visual-baseline.spec.ts-snapshots/search-query-chromium-darwin.png","sha256":"65fb1b5902b09166bdb45c63812130d8f8764b0a203424f20a98b7e9965122f7","disposition":"review-required","status":"inventoried","dependency":"D022"},
  {"path":"kupua/e2e/local/visual-baseline.spec.ts-snapshots/table-view-chromium-darwin.png","sha256":"abc25db859fb612839688214ff351cd519f6592d5f1248b8672b26b5131db080","disposition":"review-required","status":"inventoried","dependency":"D022"}
]
```

## 4. Evidence Dispositions

**Leave existing E claims unchanged.** Their payloads and canonical measurements were not inspected by P08; none is newly verified or refuted. There is no new performance inference or campaign recommendation.

**Qualify P05 F6/A1-A7 and P06 ALLOC-ASSETS:** their metadata-only caution was justified. Consumer/provenance reading now supports the specified 94 exclusions and five retained inputs, not blanket binary irrelevance or automatic reading credit. Two provenance decisions remain. F1-F9 here distinguish source facts, assertions merely read, mechanical identity checks and classification inferences. If evidence-register records are needed for integration, cite these originals/report sections with those kinds; no duplicate canonical E record or `verified` file promotion is requested.

## 5. Integration Requests

1. **Coordinator only:** validate the current 101 input hashes/digest, expand all 14 disjoint rules, require exact per-rule/per-group totals, no overlaps and no fallback. Apply only `disposition`, a source-qualified `reason` and `classifiedBy: "P08"` for those records. Preserve existing assignments, receipts, staleness and other reviewers' work. The asset-only delta is 74 pending-to-excluded and 20 required-to-excluded; five required and two pending remain. This does not apply P07's independent script decisions.
2. Integrate actual text receipts only after reciprocal P08 assignments exist, adding the required `packetId` and explicit reading-account `note`. Full source reads may receive `read`; partial ranges remain `partial` unless legitimate earlier coverage already closes them. Excluded assets/admin inputs retain their receipts here, not as application-read credit. Credit the retained licence's full read. No `verified` promotion, no blanket clearing of stale documents, and no payload receipts/status changes for the four PNGs or two pending binaries.
3. Resolve **D006** (four excluded), **D008** (two excluded), **D009** (one excluded), **D010** (36 excluded) and **D011** (22 excluded) after source/disposition checks. For **D007**, integrate four exclusions and retain only the exact roundel provenance/exclusion decision. For **D012**, integrate five qualified exclusions and retain only the exact grayscale-with-profile consumer/provenance decision. Both remaining decisions belong to the coordinator, escalating to the operator if an explicit scope decision is needed; P08 allocates no further packet.
4. For **D022**, integrate 20 exclusions (16 fonts, two SVGs, two mails), the licence read and four required/unread baselines. Keep the dependency unfinished only for these four exact PNGs' safe review/closure representation. The supported next question is how to represent an honest non-text inspection without inventing `full-text`, not whether to open private mail or rerun visual tests. Any validator/protocol amendment requires coordinator/operator authority; none is made here.
5. Add this report as excluded review administration on coordinator enumeration. Record P08 `reviewed`, and `accepted` only after the coordinator validates and accepts the named unfinished decisions. Do not close D001 or declare synthesis ready. No changes to AGENTS, the worklog, existing plans, tests, assets or code are requested from the delegate.

## 6. Checks and Limits

- Ran the assigned `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs packet P08` and the permitted read-only `check`. Check reported zero errors, the two expected stale-document warnings, 1,795 entries (1,568 required / 206 pending / 21 excluded), 46 read / four partial, and `readyForSynthesis: false`. It does not validate this unintegrated proposal or certify comprehension.
- Used local read-only Node extraction/hashing with explicit selectors and positive assertions: 101 current input hashes and containment/symlink checks; ten group counts/digests; 16 font-copy equalities, licence equality and sRGB equality; missing archived roundel target. No Git child process was spawned. The first metadata listing was truncated, so it was not treated as a complete viewed manifest; a compact marked extraction supplied all paths and the digest.
- One terminal response contained unrelated Git-history output rather than the requested extraction. It was discarded, not used as source evidence; the read-only operation was repeated with P08 output markers. No Git command was issued by this delegate. Tool-generated output captures are not additional authored files or coverage receipts.
- The initial report edit passed a focused in-memory check of six sections, receipt hashes/ranges and local links. **Final report validation passed:** four JSON blocks, 101 inputs accounted exactly once by 14 rules, ten group digests, 43 current reading-receipt hashes/ranges, six unfinished identities and all 39 local Markdown links/line anchors. Totals are 94 excluded, five required and two pending, with zero overlaps, unmatched inputs or broken links. These are bookkeeping checks, not tests of product behaviour.
- During final validation, an in-memory checker initially applied a kind-filter to summary rows without a kind field; it was corrected to use original inventory rows. The next pass confirmed all accounting/hashes/ranges and detected two relative tooling links, corrected in this report. Neither issue required a source, register or tooling edit.
- No npm, test/build suite, browser, app, service, network, ES, AWS, image conversion, MIME decoding, generated-JS evaluation, ignored auth/runtime payload access, temporary payload write, Git mutation or subdelegation occurred. No image was viewed. Only this assigned report was intentionally written, via `apply_patch`; central registers, worklog, routing and tooling are untouched.
- The two pending provenance decisions and four retained PNGs' uncredited pixels/closure limit are explicit unfinished work. The report neither removes assets nor substitutes a plan, introduces a new test/campaign, certifies licensing of every binary, or guarantees future API capacity. Stop here and return integration to the coordinator.