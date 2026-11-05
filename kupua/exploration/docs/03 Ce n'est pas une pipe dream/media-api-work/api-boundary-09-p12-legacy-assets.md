# API boundary P12: bounded legacy asset classification

## 1. Decision

**Accept the bounded classification: recommend excluding both unchanged JPG payloads from this read-only migration review.** Request coordinator closure of D007 and D012 on that scope basis, not on a claim of universal unusedness or recovered exact provenance. Neither asset has a demonstrated selected migration or active oracle role in the evidence examined. Unknown provenance alone does not justify further historical or pixel investigation for this decision.

The generated packet was checked against the explicit assignment: `P12`, `executionClass: "strong"`, `status: "ready"`, and this exact report path. It did not already exist. This is a report-only recommendation, not register integration, architecture approval, permission to remove files, or proof of runtime behaviour.

| Asset | Recommendation | Reading status to preserve | Dependency request |
|---|---|---|---|
| [docs/00-about/images/roundel.jpg](../../../../../docs/00-about/images/roundel.jpg) | `excluded` | `inventoried`; no payload receipt | Close D007 after coordinator acceptance |
| [rest-lib/src/test/resources/grayscale-with-profile.jpg](../../../../../rest-lib/src/test/resources/grayscale-with-profile.jpg) | `excluded` | `inventoried`; no payload receipt | Close D012 after coordinator acceptance |

All binaries, referring documentation, source assertions and build/resource contracts remain unchanged. P11/D022's separately approved PNG receipts do not supply JPEG coverage and are not needed for these exclusions.

## 2. Material Findings

### F1. The roundel examples need bytes, but do not select these bytes as a migration oracle

The complete [archived upload example](../../../../../docs/99-archives/04.03-upload-image.md#L1) supplies a local file to a binary upload command, with a placeholder API key and target. The complete [archived media-api example](../../../../../docs/99-archives/04.05-media-api.md#L1) describes reading an image by ID and obtaining an ID using a checksum of the same relative filename. Those are real documentary byte/identity dependencies, not merely a decorative image reference. Exclusion must preserve these documents and their contracts; it must not claim the payload is irrelevant to executing the historical examples.

Both commands spell `../images/roundel.jpg`. **If the working directory is the archive directory**, normalization gives `docs/images/roundel.jpg`, which is absent; the assigned asset is elsewhere. Shell paths are relative to the invocation working directory, not automatically to the document. Neither document establishes that directory or an equality between the displayed checksum example and the assigned file. No example command, checksum-to-image-ID comparison, upload or endpoint request was executed. The example identity is not copied here.

The bounded documentation search found these two referring lines, plus review-administration references, and the selected source/configuration-extension search found no literal `roundel` match. These are qualified search results, not proof against dynamic paths, external scripts, another working directory, or unsearched formats. They corroborate [P08 F2](api-boundary-09-p08-asset-scope.md#L31), but do not resolve exact historical provenance.

**Consequence and smallest action:** exclude only the unchanged binary internals. Even if later provenance establishes that the archived examples intended this exact roundel, those preserved historical upload/checksum examples alone do not make its pixels an oracle for the selected read-only migration. No payload inspection or archive repair is required now.

**Reopen D007** if a current migration requirement, selected regression assertion or maintained consumer is shown to depend on this exact payload's bytes, identity or image semantics. The coordinator should name that caller/assertion, its path and bounded source range, and assign its owning documentation/caller reviewer; any needed binary inspection needs separately authorized scope. Exact origin alone is not a reopening criterion without a relevant contract consequence.

### F2. The grayscale companion is not named by the dormant test

The entire [ImageOperationsTest](../../../../../common-lib/src/test/scala/com/gu/mediaservice/lib/imaging/ImageOperationsTest.scala#L15) was read. Its class-level `@Ignore` is accompanied by a comment about GraphicsMagick absence in CI. Its five cases name RGB fixtures without a profile, with an RGB profile, with an incorrect CMYK profile, a CMYK fixture, and the **without-profile** grayscale fixture. They assert `identifyColourModel` results; none names the assigned **with-profile** grayscale file. The crop/conversion TODO does not supply a sixth test or a pixel oracle.

The [resource helper](../../../../../common-lib/src/test/scala/com/gu/mediaservice/lib/imaging/ImageOperationsTest.scala#L66) resolves a caller-supplied resource name through `getClass.getResource`; the calls in this class are explicit names, not directory enumeration. The [build declaration](../../../../../build.sbt#L132) makes rest-lib depend on common-lib using `compile->compile;test->test`. This supports shared test context, not a claim that this ignored class is discovered, runs, or successfully resolves rest-lib resources in any effective build configuration. The selected register path metadata places the assigned file beside the five named fixtures. That establishes companion context, not its actual colour model, embedded profile, original purpose or execution.

The bounded filename search found no literal consumer for `grayscale-with-profile.jpg` in the searched source/configuration extensions. The narrower resource-access search returned only the already-read test's without-profile call/resource helper and two production colour/profile mapping lines; it identified no resource enumeration in that searched subset. Negative searches do not rule out constructed names, other APIs, unsearched files or external/manual use. No test or build was run. This preserves [P08 F7's qualification](api-boundary-09-p08-asset-scope.md#L80).

**Consequence and smallest action:** exclude the unchanged companion payload from the read-only migration review. Do not call it universally unused, infer a sixth colour assertion, remove it, enable the ignored suite, or repair resource wiring. The actual source/test/build contracts remain required evidence and unchanged. There is no demonstrated current oracle needing an additional inspection owner now.

**Reopen D012** if a named current consumer or selected migration regression depends on this exact resource, including a demonstrated dynamically assembled name. The coordinator should assign the shared-library imaging/test owner to read that caller and relevant resource/build settings first, stating exact paths/ranges and the contract consequence. Any subsequent binary analysis or execution requires separate authorization; a suggestive filename or unknown origin alone is insufficient.

## 3. Coverage Receipt

### Assigned payload metadata, not semantic reading

| Path | Current SHA-256 | Bytes | Actual inspection |
|---|---|---:|---|
| [docs/00-about/images/roundel.jpg](../../../../../docs/00-about/images/roundel.jpg) | `05795967e680e0ab07ed3ed487d9091baa8f393a5e4563f37df13b6f3477f279` | 24312 | Path/register metadata, regular-file/symlink check and fingerprint only |
| [rest-lib/src/test/resources/grayscale-with-profile.jpg](../../../../../rest-lib/src/test/resources/grayscale-with-profile.jpg) | `66a466ef7c71aed4cc1bbab9b79786def5f3f297069fde8fdb82c5dad8c458b7` | 35999 | Path/register metadata, regular-file/symlink check and fingerprint only |

Both fingerprints match the assigned register versions. Neither file is a symlink. No JPEG viewing, decoding, EXIF/profile inspection, dimension extraction, image-identity verification or visual receipt occurred. Both payloads remain entirely semantically unread.

### Actual full and partial text reading

Ranges below are 1-based inclusive. `full-text` means the entire named text was actually read. These receipts distinguish application source/documentation from administrative context; the coordinator must not import excluded administrative inputs into application-reading totals.

```json
[
  {"path":"docs/99-archives/04.03-upload-image.md","packetId":"P12","sha256":"6de7c6936d9896b6c95c432535c42365a3412638dee8aeea6631d7c078d162c0","method":"full-text","ranges":[[1,10]],"note":"Entire archived upload example read; commands inert, no execution or binary receipt."},
  {"path":"docs/99-archives/04.05-media-api.md","packetId":"P12","sha256":"446bf8d05657cf2c4d5467b1f06b0065393a431fff187a985e32923b29d48861","method":"full-text","ranges":[[1,16]],"note":"Entire archived read/checksum example read; no checksum identity or endpoint behaviour verified."},
  {"path":"common-lib/src/test/scala/com/gu/mediaservice/lib/imaging/ImageOperationsTest.scala","packetId":"P12","sha256":"15cedc705ca1995717f8e01f9ed35bf8c8edcb2bbb4c416b1fb3a2b6c6870006","method":"full-text","ranges":[[1,70]],"note":"All five assertions, Ignore annotation, TODO and resource helper read; no tests executed."},
  {"path":"build.sbt","packetId":"P12","sha256":"37f61825eb037c03f93cfc3b7ab0b565d67e36612580003216c914d43a00dd6e","method":"line-ranges","ranges":[[88,145]],"note":"Supplemental common-lib/rest-lib declaration and test dependency context only; not effective build/resource resolution."},
  {"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/imaging/ImageOperations.scala","packetId":"P12","sha256":"d8ab565e06951ee8bfca85fac632eee3928a7954bf51974fc0b7bc73ad632601","method":"line-ranges","ranges":[[36,36],[282,282]],"note":"Two displayed search-hit lines only; routing/context, not surrounding function or production contract review. No integration credit requested."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p08-asset-scope.md","packetId":"P12","sha256":"f5dac0e7d59fcb3df1ed4058e6c432ed505dd941004640d85402d11bc7234152","method":"line-ranges","ranges":[[31,36],[80,85],[161,235],[242,249]],"note":"F2/F7, reading and unread accounts, exact legacy-asset fingerprints and integration requests. Other finding bodies not read; receipt rows are earlier claims, not rereading their source files."},
  {"path":".github/copilot-instructions.md","packetId":"P12","sha256":"765de30857a0cc81cff1219d8fad37b4971ccab88c97d2b127f85326eee261c7","method":"full-text","ranges":[[1,154]],"note":"Current applicable directives read; temporary report-only delegation controls."},
  {"path":"kupua/AGENTS.md","packetId":"P12","sha256":"bad917ef0ee92a5191d729f9e6d161aebb1f5f7c56370aef2e244a37f8226ab4","method":"full-text","ranges":[[1,226]],"note":"Current context read; no handoff-named file explicitly routed for this packet. No stale-register clearance requested."},
  {"path":"kupua/exploration/docs/worklog-current.md","packetId":"P12","sha256":"8ccd505ddc4c4350c0fb11c80ad936a456772578ae9a094dcb24fb892e90d8fa","method":"full-text","ranges":[[1,42]],"note":"Shared worklog read, not edited, checked into or reset."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-05-review-protocol.md","packetId":"P12","sha256":"76b7a4c0b2a779db0d2b579e2ce3aedc17c750ff7472d11583c75e522fec2108","method":"full-text","ranges":[[1,261]],"note":"Current review protocol read; no linked performance corpus or other packet inspection implied."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-08-review-prompt.md","packetId":"P12","sha256":"7f46f9e57ecbc9078ba91be0db63b81d3c59ad763440fe30166455c68bebdbb6","method":"full-text","ranges":[[1,156]],"note":"Current assignment, receipt and six-section report rules read."}
]
```

Unlisted portions of partial files have no reading credit. Additional search-result headers, administrative references and truncated P08 lines were routing only, not full-line semantic receipts. P08's historical hashes/statuses are not substituted for current fingerprints. Its historical D022 integration request is superseded by the supplied current assignment/worklog; P11 and PNG payloads were not inspected here.

### Structured inspection and preservation controls

The coverage register was mechanically parsed, not fully semantically reviewed. Exact inspected selections: `/baseline`, `/enumeration`, P12 `/packets/11`; D007 `/dependencies/6` and D012 `/dependencies/11`; selected metadata fields (`path`, `sha256`, `bytes`, `disposition`, `status`, `kind`, `reason`, `classifiedBy`, `lines`) for assigned `/files/256`, `/files/332`, `/files/365`, `/files/367`, `/files/1000`, `/files/1576`. The fixture-context projection read only `path`, `disposition`, `kind` for `/files/1574` through `/files/1580`; no fixture/configuration contents were read through that projection. A name-filtered common-lib test-resource projection returned no grayscale/RGB/CMYK path in the register, not proof against generated or external resources.

The following are current whole-file preservation fingerprints, **not full-reading receipts**. The evidence register and changelog were hashed only, not interpreted. These values deliberately differ from historical administrative hashes in earlier reports.

```json
[
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-06-coverage.json","sha256":"1c70e8a6e7255ed0e9da4f85eb484b8c21b1a3fced7537cd48bcee97b3b7d28c","inspection":"Selected structural fields and preservation fingerprint only"},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-07-evidence.json","sha256":"6c149c81e30e527d841e269ba9f23ef63f6636c6a82db54bbe41b875d8582b62","inspection":"Preservation fingerprint only; claims not re-reviewed"},
  {"path":"kupua/exploration/docs/changelog.md","sha256":"c30be35e25cf37a87bdc523f655a23e8dcde008bb400e42fd0379cefe381caee","inspection":"Preservation fingerprint only; user's rollback untouched"}
]
```

## 4. Evidence Dispositions

- **Existing E records: unchanged.** None was semantically re-reviewed, refuted, independently verified or promoted by this packet. No automatic new E record is needed to implement either exclusion.
- **P08 F2/F7: retain their qualified original observations**, replace only the outstanding scope-pending recommendation for these two assets upon coordinator acceptance. Full original-document/test reading supports the bounded classification; it does not newly prove provenance or universal absence of consumers.
- **Evidence kinds:** documentation contracts and test assertions were read; file identity, path existence and administrative bookkeeping were checked; relevance is a reasoned scope inference. No executed application evidence, binary comprehension, canonical-performance interpretation, or test-correctness claim follows.
- **D022: outside this decision.** Do not reopen it, reuse PNG visual coverage for JPGs or change the receipt validator.

## 5. Integration Requests

Coordinator only, after checking current fingerprints and deciding acceptance: apply the following exact asset proposals. Preserve assignments, existing history, `status: "inventoried"` and empty payload receipts; neither exclusion is a `read` or `verified` promotion.

```json
[
  {
    "path":"docs/00-about/images/roundel.jpg",
    "sha256":"05795967e680e0ab07ed3ed487d9091baa8f393a5e4563f37df13b6f3477f279",
    "disposition":"excluded",
    "classifiedBy":"P12",
    "reason":"P12 F1: unchanged legacy payload has no demonstrated selected read-only migration or active oracle role. Full archived upload/checksum examples retain byte/identity contracts but do not establish this exact file or invocation directory. Bounded consumer search is not universal unusedness; exact provenance and payload semantics remain unknown. Preserve file/docs; reopen for a demonstrated current exact-payload contract."
  },
  {
    "path":"rest-lib/src/test/resources/grayscale-with-profile.jpg",
    "sha256":"66a466ef7c71aed4cc1bbab9b79786def5f3f297069fde8fdb82c5dad8c458b7",
    "disposition":"excluded",
    "classifiedBy":"P12",
    "reason":"P12 F2: unchanged companion test resource has no demonstrated selected migration or active oracle role. Full ignored ImageOperationsTest names five other fixtures; bounded searches found no literal consumer, and the test-to-test build edge does not certify resource resolution or execution. Preserve payload/source/build contracts; dynamic/external uses and exact provenance remain unproven. Reopen for a named current exact-resource dependency."
  }
]
```

1. **Resolve D007 and D012** with this report's F1/F2 rationale and conditional reopen owners. Do not retain either merely to chase unknown exact origin. If the coordinator has contradictory current consumer evidence, retain only the affected dependency and record that specific caller/assertion and bounded owner scope before any further inspection.
2. Add P12's three assigned full-text receipts for the two archived documents and the 70-line test. The documents can move `partial` to `read`; the already-read test remains `read`, never `verified`. Keep their dispositions `review-required`. Preserve P08 receipts and other assignments. If integrating the supplemental build range, first add the reciprocal P12 assignment for lines 88-145 and retain honest partial coverage. The two production search-hit lines need no additional credit. Keep administrative reading accounts in this report; do not clear unrelated staleness.
3. Record P12 `reviewed`, then `accepted` only after coordinator checks. Register this report as excluded review administration during the coordinator's later enumeration. No register change has been applied here.
4. On the unchanged 1,800-entry baseline, the asset delta alone is **1,560 required, zero pending, 240 excluded**, before adding new reports. This is a proposed classification delta, not completed corpus reading or synthesis readiness. All other dependencies, including D001, remain untouched. Shared registers/worklog remain fixed through the P12/P13 reading period.
5. No product/tooling, validator, test-health, archive-path, worklog, routing, AGENTS or changelog edit is requested from this delegate. Preserve the user's evidence-register edits and changelog rollback.

## 6. Checks and Limits

- Ran the prescribed read-only `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs packet P12`; verified the actual returned ID, role, ready status, six assignments and exact report path. No mismatched output was accepted.
- Ran read-only `node kupua/exploration/experiments/api-boundary/api-boundary-review.mjs check`: no errors; expected warnings for stale AGENTS, directive-copy and changelog entries; `readyForSynthesis: false`. Observed baseline: 1,800 files = 1,560 required + two pending + 238 excluded; 99 read, 24 partial, three stale, 21 open dependencies; P01-P11 accepted and P12/P13 ready. This checks bookkeeping, not comprehension.
- Ran in-memory Node `fs`/`crypto`/`path`/positive-assertion extraction for current hashes, sizes, symlinks, exact packet/dependency metadata and the conditional archived-path existence check. No files were written by these commands, no Git child process was spawned, and no payload was decoded. An initial metadata command failed at JavaScript parsing because the sandbox escaped an exclamation operator; it supplied no evidence and was rerun successfully with positive assertions.
- Source filename search: case-insensitive `roundel|gr[ae]yscale[-_]with[-_]profile` over `**/*.{scala,sbt,ts,tsx,js,mjs,sh,html,yml,yaml}` returned zero matches. This excludes other extensions, ignored files and nonliteral references; it is not a universal consumer audit.
- Documentation filename search used the same expression with `docs/**`. The editor also returned nested Kupua review-doc matches, so its glob was not treated as a root-only guarantee. Actual non-administrative hits were the two archived lines already fully read; administrative matches did not establish additional consumers.
- Resource-access search: case-insensitive `getResources?|listFiles|walk\(|resourceDirector|unmanagedResources|grayscale|roundel` over `{common-lib,rest-lib,project}/**/*.{scala,sbt}` returned four lines in two files: test lines 56/67 and production lines 36/282. This limited vocabulary and file scope cannot exclude every dynamic/resource-copy mechanism. Only build lines 88-145 were read; effective settings and test discovery were not evaluated.
- Post-write in-memory report validation passed: three JSON blocks parse; all 16 recorded file fingerprints match; full/partial text ranges are valid; all 11 local links and their line anchors resolve; the six sections and two proposals match P12. Shared coverage/evidence registers, worklog, AGENTS, directives, changelog and both assets retain their recorded fingerprints. The shared register still has both assets pending/inventoried, D007/D012 assigned and P12 ready: no integration was performed. This is an administrative check, not a test/build or semantic verification.
- No Git history was needed: the decision is bounded relevance, not exact provenance recovery. No Git mutation, binary display/decoding, tests/builds, service/app/browser/network/ES/AWS work, ignored runtime/credential inspection, subdelegation or performance analysis occurred. Archived commands remained inert. No private payload, real image identity, credential or author-email output is copied into this report.
- Sole write: this assigned report via `apply_patch`. All shared files and original sources/assets were left untouched. Hashing and metadata never become binary semantic reading; excluded does not mean disposable. No exhaustive-coverage or runtime-correctness claim is made.