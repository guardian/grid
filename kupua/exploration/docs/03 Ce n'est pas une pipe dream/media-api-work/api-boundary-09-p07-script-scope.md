# API boundary P07: script and configuration dependency scope

## 1. Decision

**Accept the classification packet, subject to coordinator integration.** Resolve the exact 130 pending inputs as **12 review-required, 118 excluded, zero scope-pending**. Request closure of D013-D015 as scope decisions, not completion of the wider configuration, model, caller or deployment reviews. No architecture, deployment or implementation is approved.

| Dependency / P05 question | Input | Required | Excluded | Pending |
|---|---:|---:|---:|---:|
| D013 / S1: local configuration library | 100 | 0 | 100 | 0 |
| D014 / S2: other scripts/src inputs | 13 | 3 | 10 | 0 |
| D015 / S3: auxiliary inputs | 17 | 9 | 8 | 0 |
| Total | 130 | 12 | 118 | 0 |

Actual reading within those 130: **30 full-text files, one structurally inspected lockfile, 99 semantically unread library files**. Exclusion is not reading credit, deletion, an unused-code claim or permission to execute. Across original source/configuration/documentation inputs outside review context, this packet read 37 files fully and four partially, plus the lockfile structurally. Context and administrative receipts are separate below.

The current register fingerprint is used, not P05's historical register hash. If integrated alone into this fixed 1,795-file snapshot, disposition totals become **1,580 required, 76 pending, 139 excluded**. Concurrent reviewers' reports, subsequent enumeration and later coordinator decisions may change those totals; do not overwrite them with this projection.

## 2. Material Findings

### F1. The shaded library belongs to a historical converter, not the demonstrated service configuration path

**Source-read evidence:** [ConvertConfig.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/ConvertConfig.scala#L23) walks supplied properties inputs and writes converted HOCON using the shaded namespace and compact-key rendering. [ConfigRenderOptions.java](../../../../../scripts/src/main/java/com/gu/typesafe/config/ConfigRenderOptions.java#L1) explicitly identifies the rendering modification; its setter describes compact dotted keys. This is a modified fork, not a claim of byte-identical upstream code.

The actual setup function invokes the Node generator ([setup.sh](../../../../../dev/script/setup.sh#L297)); [generate-config.js](../../../../../dev/script/generate-config/generate-config.js#L59) calls its separate service-config module and writes service configuration directly. The read-service consumer, [GridConfigLoader.scala](../../../../../common-lib/src/main/scala/com/gu/mediaservice/lib/config/GridConfigLoader.scala#L5), imports standard `com.typesafe.config.ConfigFactory`, loads development and deployed configuration with fallback precedence, and still accepts historical properties files. Its warning at line 58 points to the conversion utility. Thus the converter can affect an operator's configuration artifact without its private parser becoming a read-service runtime dependency.

[build.sbt](../../../../../build.sbt#L203) makes scripts depend on common-lib; [the Play helper](../../../../../build.sbt#L234) makes services depend on rest-lib. [CI](../../../../../.github/workflows/ci.yml#L67) explicitly compiles scripts, but compilation is not evidence that services consume this fork. A finite reverse-symbol scan of 685 current required non-Kupua, non-scripts source/build inputs found no references to the shaded namespace, converter, script namespace, script JSON codec or bucket uploader. This is a qualified negative search, not proof about external operator automation or dynamically constructed references.

**Historical provenance, not current-source reading:** bounded Git subject/stat inspection identifies `b8ffce806fd1e60166c47cc292dfabf29a8a8b7a` as the shaded import, `fec543b30116b2039bbaaeece67a5d6a33b0421a` as compact-key support, `e723e86f5d0875614cd2d33a20702b62e1b696a2` as the converter introduction, and `3b68cfd0331bb8253feaae31b5cad3773a46f995` as a subsequent rendering adjustment. No historical implementation diff, upstream equivalence or deployed usage was audited.

**Consequence / smallest action:** exclude all 100 fork-subtree paths from further application review for this migration, retaining the converter, dispatcher and README already required by P05. Preserve the fork and existing conversion behavior unchanged. Current generator/loader configuration remains required in its owning corpus; the unread generator helpers are not credited by this boundary trace. Reopen the fork scope only if a proposed change actually touches conversion or makes the shaded implementation a service dependency. A speculative full library audit is not justified.

### F2. Three S2 files retain concrete setup, model or read-caller contracts

| Required original | Source finding and bounded review interest |
|---|---|
| [EsScript.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/EsScript.scala#L197) | Mapping updates consume common-lib mappings and carry the dense-vector switch; the helper resolves its configured alias to one index. Reindex code also exists, but reading it does not require migration-transparent sessions or changes to production migration. These are setup/mapping provenance, not a configuration authority for every deployment. |
| [BackfillEditLastModified.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/BackfillEditLastModified.scala#L137) | Reads indexed `userMetadataLastModified` and writes the edits table's `lastModified` field. This operational writer documents cross-store date provenance relevant to a read model. Retain that relationship without proposing or running a backfill. |
| [AlamyCleanUp.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/AlamyCleanUp.scala#L42) | Before mutation, performs an existing `/images` query using supplier-reference syntax and reads IDs through the nested response data envelope. Retain this existing-reader compatibility evidence even though the eventual operation is deletion/metadata mutation. |

All 13 S2 originals were fully read. The other ten are excluded for the following source-grounded reasons, not their filenames:

- [BucketMetadata.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/BucketMetadata.scala#L16), [EsImageMetadata.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/EsImageMetadata.scala#L15), [ProposeS3Changes.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/ProposeS3Changes.scala#L15), [EnactS3Changes.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/EnactS3Changes.scala#L35), [DecodeComparator.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/DecodeComparator.scala#L9) and [JsonValueCodecJsValue.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/lib/JsonValueCodecJsValue.scala#L8) form export, reconciliation, historical decoding-check and repair machinery. Their local DTOs serialize operation inputs/outputs. The proposal code uses canonical common-lib storage-key/URI helpers; it is not the service's read-model definition. The codec is consumed by the repair implementation, not made a shared runtime library merely by its package name. Preserve the observed storage-key/encoding relationship for the model owner's follow-up; do not import every repair/parser line into this review.
- [BulkDeleteS3Files.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/BulkDeleteS3Files.scala#L30), [BulkRemoveFromCollection.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/BulkRemoveFromCollection.scala#L25) and [LoadFromS3Bucket.scala](../../../../../scripts/src/main/scala/com/gu/mediaservice/scripts/LoadFromS3Bucket.scala#L35) issue explicitly supplied deletion/upload operations. Unlike the retained search caller, they add no discovery/query/response-read contract needed by this read-only migration. Their production endpoints and ingestion/collection owners remain in the required corpus; no operation is removed or declared unsupported.
- [logback.xml](../../../../../scripts/src/main/resources/logback.xml#L1) configures the scripts console logger. The build boundary does not put this resource on the read services' declared dependency path.

**Consequence / smallest action:** retain three files for model/setup/caller integration and exclude ten operational implementations. Do not change the scripts or claim runtime correctness from static reading. The full ES helper read does not revive archived migration guarantees.

### F3. Sample-data generation is also an existing media-api reader

[The uploader](../../../../../scripts/sample-images/index.js#L30) first GETs the configured media-api root, finds the `loader` relation in `links`, and then POSTs an import. Its read/discovery dependency is explicit. [The README](../../../../../scripts/sample-images/README.md#L3) documents random external sample uploads, not canonical Kupua fixture data or recorded performance evidence. [The package](../../../../../scripts/sample-images/package.json#L5) owns the executable and three direct dependencies; the tracked [template](../../../../../scripts/sample-images/grid-sample-images-config.json.template#L1) contains empty configuration placeholders only. No user's configuration or downloaded image was opened.

The paired [lockfile](../../../../../scripts/sample-images/package-lock.json) is v2, with one root plus ten package entries and ten legacy dependency entries; root dependencies agree with the package. Only graph identity/version/dependency fields were inspected. URLs, integrity values and other package metadata were not semantically reviewed, nor were installed packages inspected or the uploader tested.

**Consequence / smallest action:** keep all five paths required as a caller/configuration/package family. Four have full-text receipts; the lockfile remains partial after structural inspection. Preserve API-root link discovery in the existing-caller review. Neither sample acquisition nor its external credentials become a prerequisite for Kupua's standalone workflow.

### F4. Two embedder scripts are build dependencies; three are manual operational probes

[CI](../../../../../.github/workflows/ci.yml#L77) invokes [cdk.sh](../../../../../scripts/embedder-deploy/cdk.sh#L5) and [build.sh](../../../../../scripts/embedder-deploy/build.sh#L5). The former drives existing CDK tasks; the latter builds the embedder and packages its target-platform native image dependency. Keep both required: deployment of the AI producer is a real dependency, though deployment changes are not authorized here.

[send-message.sh](../../../../../scripts/embedder-deploy/send-message.sh#L29) and [send-message-batch.sh](../../../../../scripts/embedder-deploy/send-message-batch.sh#L33) are manual queue senders. Their four-field payload is represented by the actual [SQSMessageBody type](../../../../../image-embedder-lambda/src/shared/sqsMessageBody.ts#L1); the batch script explicitly describes duplicate-message testing, not a recorded assertion or measurement. [get-s3-vector-by-key.sh](../../../../../scripts/embedder-deploy/get-s3-vector-by-key.sh#L28) is a manual vector inspector. Its legacy index choice differs from the current [CDK declaration](../../../../../cdk/lib/image-embedder-lambda.ts#L48). That source discrepancy prevents treating the utility as authoritative current deployment configuration; it does not establish what exists in a live environment.

**Consequence / smallest action:** exclude these three manual tools while preserving their source evidence and required production producer/CDK ownership. The remaining CDK and embedder implementations need their existing review, not a new AWS check or an unsolicited script repair.

### F5. Cleanup provenance is useful; cleanup execution machinery is not a migration dependency

[Cleanup documentation](../../../../../scripts/cleanup-s3/README.md#L1) and [mass-deletion documentation](../../../../../scripts/mass-deletion/README.md#L1) explain explicitly operational boundaries, consistent with P05 retaining stress-tool provenance. Keep these two short READMEs required and read.

The [prefix deletion implementation](../../../../../scripts/cleanup-s3/delete-images-by-prefix.sh#L13) lists and deletes S3 objects; [the root wrapper](../../../../../scripts/cleanup-s3/images-in-root.sh#L8) and [empty-prefix wrapper](../../../../../scripts/cleanup-s3/images-with-empty-prefix.sh#L8) invoke it. [Mass deletion](../../../../../scripts/mass-deletion/mass-deletion.sh#L33) operates on supplied IDs and a hard-delete endpoint, without a discovery or search response dependency. [Usage reindex](../../../../../scripts/usage-reindex/reindex-usages.sh#L12) consumes a CSV and invokes explicit usage regeneration, recording progress locally. None is canonical performance evidence or the owning implementation of the read contracts.

**Consequence / smallest action:** exclude those five executable files. Preserve services and ordinary existing-caller compatibility in the owning reviews. No credential, CSV, progress, audit or runtime payload named by these tools was read, and no tool was executed.

### Exact Disjoint Classification Recipe

Apply only to the fingerprinted input selector below, taken from P05's P-scripts rule with its three explicit exclusions. `paths` and `prefixes` are OR alternatives; `excludePaths` subtracts matches. Require exactly one rule per input: no first-match precedence. Any missing path, changed hash, overlap or unmatched input stops automatic integration. Metadata digests hash UTF-8 `JSON.stringify(rows)` with no trailing newline, after sorting by JavaScript code-unit ascending path and projecting fields in the declared order. S1 is the Java subtree; S2 is the remaining input under scripts/src; S3 is the input outside scripts/src.

```json
{
  "packetId": "P07",
  "snapshot": {
    "coveragePath": "kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-06-coverage.json",
    "coverageSha256": "b7312357fb208e035b846417e9daa7b1cd519b802e30bb99f5c7e87f13c5f3df",
    "inventoryHead": "0e79a4dec637e3eaf05bb252c2ec7f95e8e68c8d",
    "generatedAt": "2026-09-19T13:05:04.732Z",
    "inputDisposition": "scope-pending",
    "count": 130,
    "inputSelector": {"prefixes":["scripts/"],"excludePaths":["scripts/README.md","scripts/src/main/scala/com/gu/mediaservice/scripts/Main.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/ConvertConfig.scala"]},
    "metadataFields": ["path","area","present","kind","bytes","lines","sha256"],
    "metadataSha256": "05c85fb48dfb702da6df4be3ad0215d98c4872a17ab346838ac09c382c995be3",
    "groups": {
      "S1": {"count":100,"metadataSha256":"b1a46e765acfb8ff5aa3fc4c002eaf0332df58c5054bdce28f80f3ac16f6c391"},
      "S2": {"count":13,"metadataSha256":"5ddc57aba94259037dc1a8c494be435675410614137499acdea958e437412b88"},
      "S3": {"count":17,"metadataSha256":"e7250cc9254bc1e1e8de2572946dd45321c8639a58b2991320bee30756ab2052"}
    }
  },
  "rules": [
    {"id":"X-config-fork","disposition":"excluded","count":100,"selector":{"prefixes":["scripts/src/main/java/"]},"evidence":["F1"],"reason":"Historical shaded conversion implementation, including its local provenance/license material; current setup and service loader use separate paths. Preserve unchanged; no full library audit or upstream-equivalence claim."},
    {"id":"R-script-contracts","disposition":"review-required","count":3,"selector":{"paths":["scripts/src/main/scala/com/gu/mediaservice/scripts/EsScript.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/BackfillEditLastModified.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/AlamyCleanUp.scala"]},"evidence":["F2"],"reason":"Mapping/setup switches, cross-store date provenance and an existing media-api search reader; not approval of operational execution or migration support."},
    {"id":"X-script-operations","disposition":"excluded","count":10,"selector":{"paths":["scripts/src/main/resources/logback.xml","scripts/src/main/scala/com/gu/mediaservice/lib/JsonValueCodecJsValue.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/BucketMetadata.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/BulkDeleteS3Files.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/BulkRemoveFromCollection.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/DecodeComparator.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/EnactS3Changes.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/EsImageMetadata.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/LoadFromS3Bucket.scala","scripts/src/main/scala/com/gu/mediaservice/scripts/ProposeS3Changes.scala"]},"evidence":["F2"],"reason":"Fully read export/repair DTOs, codec and operations, explicit uploads/deletes and scripts-only logging. Canonical model/storage helpers and service endpoints remain required with their owners."},
    {"id":"R-operation-provenance","disposition":"review-required","count":2,"selector":{"paths":["scripts/cleanup-s3/README.md","scripts/mass-deletion/README.md"]},"evidence":["F5"],"reason":"Retain read provenance documenting the excluded operational boundaries."},
    {"id":"R-sample-caller","disposition":"review-required","count":5,"selector":{"prefixes":["scripts/sample-images/"]},"evidence":["F3"],"reason":"Existing API-root discovery caller with paired entrypoint, documentation, empty template, package and lockfile; no external sample-data prerequisite."},
    {"id":"R-embedder-build","disposition":"review-required","count":2,"selector":{"paths":["scripts/embedder-deploy/build.sh","scripts/embedder-deploy/cdk.sh"]},"evidence":["F4"],"reason":"Direct CI consumers package the AI producer and synthesize its infrastructure."},
    {"id":"X-cleanup-writers","disposition":"excluded","count":3,"selector":{"paths":["scripts/cleanup-s3/delete-images-by-prefix.sh","scripts/cleanup-s3/images-in-root.sh","scripts/cleanup-s3/images-with-empty-prefix.sh"]},"evidence":["F5"],"reason":"Explicit S3 object cleanup and its wrappers; no read-service contract implementation."},
    {"id":"X-embedder-manual","disposition":"excluded","count":3,"selector":{"paths":["scripts/embedder-deploy/get-s3-vector-by-key.sh","scripts/embedder-deploy/send-message-batch.sh","scripts/embedder-deploy/send-message.sh"]},"evidence":["F4"],"reason":"Manual diagnostic/synthetic senders, not canonical config or recorded tests; actual message type and CDK remain required."},
    {"id":"X-mass-delete","disposition":"excluded","count":1,"selector":{"paths":["scripts/mass-deletion/mass-deletion.sh"]},"evidence":["F5"],"reason":"Explicit supplied-ID deletion workflow; provenance retained, no search/discovery response dependency."},
    {"id":"X-usage-regeneration","disposition":"excluded","count":1,"selector":{"paths":["scripts/usage-reindex/reindex-usages.sh"]},"evidence":["F5"],"reason":"Operational CSV-driven regeneration endpoint caller; production usage read owners remain required."}
  ],
  "fallback": {"disposition":"scope-pending","expectedCount":0,"intendedOwner":"coordinator","nextAction":"Stop integration on any unmatched input or changed fingerprint; retain the precise discrepant subset."},
  "totals": {"review-required":12,"excluded":118,"scope-pending":0}
}
```

## 3. Coverage Receipt

### Assignment Accounting

All six assignments were inspected at their declared scope. The register inspection is structural metadata only; all 130 current fingerprints were recomputed after symlink/realpath containment checks. P05 was **partially** read: F4/F6, the exhaustive recipe and receipts, S questions and checks; F5 and A questions encountered in those ranges are contextual only. P05's earlier claims and receipts do not transfer source-reading credit. The assigned build region and relevant dependency links were read within lines 1-260; the existing P05 full-file receipt must not be downgraded because P07's own receipt is partial.

The following 41 original source/configuration/documentation text receipts comprise 37 full reads and four partial reads. Full ranges use physical 1-based inclusive lines. None is independent verification or a runtime test. Receipts for excluded files stay in this report, not application reading totals.

```json
[
  {"path":"scripts/README.md","sha256":"e606cb6afd522e6923ed225e101757bba01e4f3392453b70b6354be3cf7a64b1","method":"full-text","ranges":[[1,86]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/Main.scala","sha256":"38fffa2cf4c7cad2340e4c4db81cc0e990ef0e2ec02a974a19194bd9d4f593db","method":"full-text","ranges":[[1,25]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/ConvertConfig.scala","sha256":"9a03a1bf674f60ee16575fbae898091e6423f66e3dd197f820c03aae533c99f6","method":"full-text","ranges":[[1,65]]},
  {"path":"build.sbt","sha256":"37f61825eb037c03f93cfc3b7ab0b565d67e36612580003216c914d43a00dd6e","method":"line-ranges","ranges":[[1,260]],"unreadRanges":[[261,279]]},
  {"path":"scripts/src/main/java/com/gu/typesafe/config/ConfigRenderOptions.java","sha256":"03707e143efd93ee79f1a4a022480901f6665f8a022f78d5d0ae1f9700531dc3","method":"full-text","ranges":[[1,214]]},
  {"path":"scripts/src/main/resources/logback.xml","sha256":"dcae82fac39c9379273f19c24b3da629c6d2294af90b4f47fc080ed191d7daa9","method":"full-text","ranges":[[1,13]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/lib/JsonValueCodecJsValue.scala","sha256":"c5d6fb925e66037fb542b3e5ae5d8fbad167e1dcb10611bfadf61e5f879f46f8","method":"full-text","ranges":[[1,107]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/AlamyCleanUp.scala","sha256":"074dcb72fbb7e0bc2099228bd1f80e8b881f0afa436d38855c85e9601a94547a","method":"full-text","ranges":[[1,112]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/BackfillEditLastModified.scala","sha256":"24e13939f859e643dc80408be14380c6491be5a27a89732193dcffc5198ec010","method":"full-text","ranges":[[1,188]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/BucketMetadata.scala","sha256":"53c7cf83baf8b52b805da12b045130fa061732b66cb453c859a3257e6da15353","method":"full-text","ranges":[[1,68]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/BulkDeleteS3Files.scala","sha256":"b3eaa02c7b6dc1b2cd8faba2f94c55e66fc7dc4182ac894c84aa66dfd084f92f","method":"full-text","ranges":[[1,68]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/BulkRemoveFromCollection.scala","sha256":"c760043acee8ae504942c5119ebce8004b88876ce4fe3725de3a29dd0f176cd5","method":"full-text","ranges":[[1,49]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/DecodeComparator.scala","sha256":"7e783b082f2a09d3f11f727b5e0ef36a16b793c5cdb5eddfea3772c0ad4e3cc3","method":"full-text","ranges":[[1,39]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/EnactS3Changes.scala","sha256":"0940afc61e7ba2f7ade6f9b4ecda0e04fb3b60f09549097d251ca056011306d2","method":"full-text","ranges":[[1,196]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/EsImageMetadata.scala","sha256":"144521cdb0e655a2ff5670becc55d7a46b00353a9304158fd38886fba63895e1","method":"full-text","ranges":[[1,165]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/EsScript.scala","sha256":"2c3e869c22e95e41fd8965fc5d839e289b02e13684ae19fdee21b6e4e4094ece","method":"full-text","ranges":[[1,456]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/LoadFromS3Bucket.scala","sha256":"ef2a7f50a73faf81ca1c387a24762e94e31c30b7481a1adf79ba6dfb1dc10427","method":"full-text","ranges":[[1,61]]},
  {"path":"scripts/src/main/scala/com/gu/mediaservice/scripts/ProposeS3Changes.scala","sha256":"643657da3e4c9dee5cec768b5dc37f5535f92263af8aaff4a89e72ab8c07fc3a","method":"full-text","ranges":[[1,254]]},
  {"path":"scripts/cleanup-s3/README.md","sha256":"b342a37ba9c0af1523da8b3cab3e9386c9441f63ae3977668c37ad87dc60a00a","method":"full-text","ranges":[[1,40]]},
  {"path":"scripts/cleanup-s3/delete-images-by-prefix.sh","sha256":"25ba875ca73a58d5e947794f047a3ed6ca020f1f8f6903c7130edd49e33e0a97","method":"full-text","ranges":[[1,55]]},
  {"path":"scripts/cleanup-s3/images-in-root.sh","sha256":"909b70a4b0e530032c182f7ebca5a721ea003c9d71804340b947b8673a91afef","method":"full-text","ranges":[[1,17]]},
  {"path":"scripts/cleanup-s3/images-with-empty-prefix.sh","sha256":"fbc85b7168ed82432953e5852cf9041c2a6274136bb047bc6e8de8be6eef5a13","method":"full-text","ranges":[[1,10]]},
  {"path":"scripts/embedder-deploy/build.sh","sha256":"ccbc7320b29a6e3049dd9564a0c17a2b2e2a71f10a7d1cfc75b207d7dd9ce070","method":"full-text","ranges":[[1,28]]},
  {"path":"scripts/embedder-deploy/cdk.sh","sha256":"b97e15d264b85df5b1aa8c002d7e1047bd33f7b301398520e68b4b3cc7d6a50f","method":"full-text","ranges":[[1,11]]},
  {"path":"scripts/embedder-deploy/get-s3-vector-by-key.sh","sha256":"b9b35c4e0bd85610622b953fc4bd035575743e17599a07c61a07f88bb47fdcbd","method":"full-text","ranges":[[1,35]]},
  {"path":"scripts/embedder-deploy/send-message-batch.sh","sha256":"8ffc28aaf40618641f0d494c44b0037f057dece38e0a3940c51bdeab5e5ba2b9","method":"full-text","ranges":[[1,48]]},
  {"path":"scripts/embedder-deploy/send-message.sh","sha256":"bcb6bf57f17bf64f88f904d9fdc7d31606b7210fbd18a38e3288eb302bc261cb","method":"full-text","ranges":[[1,36]]},
  {"path":"scripts/mass-deletion/README.md","sha256":"6d0d70a9312f13ff11a93781380d334bc3a645ac281f96394e29852924ba2d40","method":"full-text","ranges":[[1,43]]},
  {"path":"scripts/mass-deletion/mass-deletion.sh","sha256":"fac0dc3a1211c444f3f6bdf1597d1c4bff8c6f107e8ee7a5d748d99b6b1e17f5","method":"full-text","ranges":[[1,53]]},
  {"path":"scripts/sample-images/README.md","sha256":"4946f50d97fd29952f398f868fb7c01ff1eef5171ac34efed8d3e49697bb007d","method":"full-text","ranges":[[1,18]]},
  {"path":"scripts/sample-images/grid-sample-images-config.json.template","sha256":"dca9bb0f967fcb1a4c3ddea6e60009fe7420f201c85366c803e6533e5f9b1f33","method":"full-text","ranges":[[1,10]]},
  {"path":"scripts/sample-images/index.js","sha256":"5ddee93d53c556fa9c74a9c9ab99015b25f9637b24a8b645c0741001cb49f7b9","method":"full-text","ranges":[[1,72]]},
  {"path":"scripts/sample-images/package.json","sha256":"da0353d3a3ebed892baad6619d4b1a1fd87a0542e80768e33ac174f14ee481f2","method":"full-text","ranges":[[1,18]]},
  {"path":"scripts/usage-reindex/reindex-usages.sh","sha256":"3aa0846802f49978c26c6ba1769167dfa336afbcfef0c11d74a3dd5bd98fda84","method":"full-text","ranges":[[1,35]]},
  {"path":"dev/script/setup.sh","sha256":"724b9e48f4874743778a758178c3dbe0c99f8dae4dd752dbac0b8f0d8c63ddd0","method":"line-ranges","ranges":[[270,330]],"unreadRanges":[[1,269],[331,359]]},
  {"path":"dev/script/generate-config/generate-config.js","sha256":"b3d8027d3432018116203339455a58c6d206a5a2094be3874e2aae30260a2162","method":"full-text","ranges":[[1,92]]},
  {"path":"dev/script/generate-config/README.md","sha256":"3606445ccb7815eb4da37ec577c93b4d60db7e75a3009280483561f1b934a5e0","method":"full-text","ranges":[[1,12]]},
  {"path":"common-lib/src/main/scala/com/gu/mediaservice/lib/config/GridConfigLoader.scala","sha256":"d14087c06320d1535e4bf625535cb876f83759288e3f32c2590fe0b81ce8589d","method":"full-text","ranges":[[1,73]]},
  {"path":".github/workflows/ci.yml","sha256":"362eb61a53ce155059428badcde4c5464c18d6309fb2126cf81f05fc9e0e89c7","method":"line-ranges","ranges":[[52,103]],"unreadRanges":[[1,51],[104,127]]},
  {"path":"image-embedder-lambda/src/shared/sqsMessageBody.ts","sha256":"9f9b48497a569a258c7e6238d4167397e01fb83f64f632c7f2c1557602071d74","method":"full-text","ranges":[[1,6]]},
  {"path":"cdk/lib/image-embedder-lambda.ts","sha256":"af271830c1ad63870a26500b38235e19b9e387c3688ec3d72bd747824dba74eb","method":"line-ranges","ranges":[[1,95]],"unreadRanges":[[96,236]]}
]
```

### Structural Receipts

The register projection, lockfile graph and evidence identities are not semantic source reading. Pointers into the fixed register identify the P07 packet and D013-D015; the complete 130-input projection is `/files/1582` through `/files/1713`, excluding `/files/1705` and `/files/1711`. The three prior required script anchors are at indices 1581, 1705 and 1711. Snapshot-wide disposition counting does not credit other files as read.

```json
[
  {"path":"scripts/sample-images/package-lock.json","sha256":"45677441406fd7e79938dfecc86b0467579961a85660c8a26c5f13555bf53397","method":"json-pointers","pointers":["/name","/version","/lockfileVersion","/packages","/dependencies"],"inspection":"Object keys plus name/version/lockfileVersion; all packages projected to path/version/dependencies and all legacy dependencies to name/version/requires. Root dependencies compared with package.json. Eleven packages including root; ten legacy dependency entries.","unread":"Other values, including resolved/integrity/engines/license metadata and root requires, were not semantically inspected; no installed dependency implementation read. Partial only."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-06-coverage.json","sha256":"b7312357fb208e035b846417e9daa7b1cd519b802e30bb99f5c7e87f13c5f3df","method":"json-pointers","pointers":["/baseline","/enumeration","/packets/6","/dependencies/12","/dependencies/13","/dependencies/14","/files"],"inspection":"P07 packet view, D013-D015 entries, scripts metadata and prior anchor receipts; 130-input projection fingerprinted with all source hashes checked. Whole-file parse/filter/count and finite reverse-symbol candidate selection are administrative operations, not semantic reading of every record or source.","unread":"Other packets, dependencies and application contents outside declared receipts; no other reviewer draft read or relied upon."},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-07-evidence.json","sha256":"46585016ee226163080422e2e7598352a74f5cacd34128d2a3801bdb1ba7d790","method":"json-pointers","pointers":["/claims/0/id","/claims/0/kind","/claims/0/status","/claims/1/id","/claims/1/kind","/claims/1/status","/claims/2/id","/claims/2/kind","/claims/2/status","/claims/3/id","/claims/3/kind","/claims/3/status","/claims/4/id","/claims/4/kind","/claims/4/status","/claims/5/id","/claims/5/kind","/claims/5/status","/claims/6/id","/claims/6/kind","/claims/6/status","/claims/7/id","/claims/7/kind","/claims/7/status"],"inspection":"E001-E008 identity/kind/status only; no claim text, measurement or supporting source revalidated."}
]
```

### Context and Prior-Report Receipts

These six text inputs are separate from the 41 original source/doc receipts above. All application-context reading credit remains for the coordinator to integrate; excluded review administration does not acquire application status. The report-only exception supplies confirmation and forbids a delegate worklog check-in or reset.

```json
[
  {"path":".github/copilot-instructions.md","sha256":"765de30857a0cc81cff1219d8fad37b4971ccab88c97d2b127f85326eee261c7","method":"full-text","ranges":[[1,154]]},
  {"path":"kupua/AGENTS.md","sha256":"6698c871e00ea4a9227db9848830f65eb68c38cc62b653c4d4bb6fe6dae6b4a6","method":"full-text","ranges":[[1,226]]},
  {"path":"kupua/exploration/docs/worklog-current.md","sha256":"88a5797e85afb50d12e3152d42fc3776d5914cf2f38b4241c3131181924a7a17","method":"full-text","ranges":[[1,35]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-05-review-protocol.md","sha256":"4f667461beba9f77e3c659fcc91760bae888f7f4d1c5378079399c836651eaa4","method":"full-text","ranges":[[1,250]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-08-review-prompt.md","sha256":"b31cc5769ca2df52b6ff690aec983c33a51d55ca7e77f6f7ac6933ad39ec17bf","method":"full-text","ranges":[[1,152]]},
  {"path":"kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p05-grid-scope.md","sha256":"9b43a508e0ed7b72ade9010f20a569f8ce3523614fad56f67544a2cf5b5fd0f1","method":"line-ranges","ranges":[[35,226],[244,271]],"unreadRanges":[[1,34],[227,243]],"note":"F4/F6, recipe/receipts, S1-S3 and checks inspected; F5 and A questions incidental context. Not a full-report assignment or full-report read."}
]
```

**Explicit unread remainder:** within the 130-input set, every path under the Java subtree except the receipted render-options file remains semantically unread: exactly 99 paths, reproducible as X-config-fork minus that exact path. Their identity hashes are verified, not their implementations. All 29 non-lockfile S2/S3 inputs were fully read; the one lockfile retains the stated unread fields. Supplemental partial files retain the exact unread ranges above. Generator helper/configuration contents, remaining service/model/producer implementations, historical diffs and external configuration are not silently included. Navigation search snippets outside these receipts receive no application-reading credit.

## 4. Evidence Dispositions

- **Qualify P05 F4:** confirm its dispatcher/import/build distinction from originals, and resolve its uncertainty through current setup and loader evidence plus historical fork provenance. This supports exclusion of unchanged conversion internals, not the stronger assertion that the converter is unused everywhere.
- **Qualify P05 F6 / S3:** keep the sample lockfile with its real package/caller. A structurally inspected dependency graph is partial evidence, not implementation comprehension or proof the uploader currently runs correctly.
- **No E001-E008 status change:** only their identity metadata was inspected. P07 does not independently verify those claims or canonical performance measurements, and proposes no new performance experiment.
- **Proposed new source facts, IDs assigned only by the coordinator:** F1's current generator/loader versus converter boundary; F2's mapping switch, cross-store date provenance and nested search-response consumer; F3's root `loader` discovery; F4's CI build consumers, queue payload owner and diagnostic/CDK index discrepancy. Original file hashes/ranges are above. Scope exclusions are reasoned inferences from these facts, not mechanically proven absence of all future dependencies.
- **Docs versus source versus checks:** operational READMEs and P05 supply orientation/provenance; actual source supplies the consumer relationships; Git metadata supplies historical provenance; hashing, JSON parsing, finite symbol search and recipe validation establish only identity/accounting. No source-read assertion here is a live-system observation.

## 5. Integration Requests

1. Recheck the current register and all 130 fingerprints; expand the ten disjoint rules exactly once per path. Apply disposition/reason changes by path only, preserving unrelated fields, earlier receipts and other reviewers' integration. If the whole-register hash has legitimately changed, recompute this input's membership/digest and review the delta rather than silently applying against a new corpus.
2. Request D013, D014 and D015 become `resolved`, citing F1, F2 and F3-F5 respectively. Record that these close classification questions only. There is no unresolved subset of these 130; do not leave the fork pending for a speculative full audit or label it read to make it disappear.
3. For the newly required 12, append P07 full-text receipts for eleven and a partial structural receipt for the sample lockfile. Preserve the 19 full-text excluded-file receipts here without counting them as application coverage. Do not promote the 99 unread fork files. Append actual supplemental/anchor/context receipts at their declared scope; retain earlier full build coverage, and do not mark the partial CI/setup/CDK reads full or any claim `verified`.
4. Accept P07 after coordinator checks of recipes, decisive originals, hashes, links and receipt accounting. Do not change P08-P10 or either stale document. P07 did not read their drafts or refresh the human directive copy/changelog.
5. Transfer or merge the following finite follow-ups with existing corpus ownership. These are requests to the coordinator, not new packet assignments or reserved D IDs. The coordinator owns them until allocation; their open state must remain visible even after D013-D015 close.

| Request | Deciding question / exact evidence boundary | Named owner |
|---|---|---|
| C1: read configuration | When proposing service configuration changes, are current loader precedence, existing properties compatibility and Node-generated service configuration preserved without introducing the shaded converter into runtime? F1 receipts; unread generator helpers and normal service-config owners remain in their already-required corpus. No private configuration read is needed. | Coordinator, for the Grid configuration/build reviewer |
| C2: read model and setup | Are the retained dense-vector mapping switch and cross-store edited-date provenance consistent with the canonical mappings and ordinary producer/read models? Also retain F2's historical storage-key/URI decoding relationship as context for the canonical common-lib helpers, not a requirement to review or alter all repair machinery. Index migration guarantees remain excluded. | Coordinator, for the Grid model/producer reviewer |
| C3: existing read callers | Will the ordinary `/images` supplier-reference query/envelope and API-root `loader` relation remain compatible for the two retained callers? Use the actual Alamy cleanup and sample uploader reads; do not infer current end-to-end functionality from static source or broaden this into write-workflow implementation. Finish only the lockfile fields relevant to its consumer/dependency review, retaining any explicit remainder. | Coordinator, for the Grid existing-caller/API reviewer |
| C4: AI producer deployment | Does the candidate preserve the actual CI packaging/native dependency and current CDK/message contract, without using the manual legacy vector inspector as deployment truth? Remaining CDK/producer review belongs to the existing required corpus; the observed index discrepancy needs interpretation there, not an unsolicited repair or AWS probe. | Coordinator, for the AI producer/deployment reviewer |

No central register, shared worklog, routing file, earlier report or plan was edited. No stronger prototype guarantee, production migration change or performance cost is proposed.

## 6. Checks and Limits

- Executed the explicitly authorized P07 packet command and read-only Node JSON/hash/accounting probes. The input is 130 unique currently pending paths; S1/S2/S3 are 100/13/17. All 130 current content hashes match the snapshot after containment and symlink checks. Metadata parsing and hashing did not become semantic reading credit.
- Focused post-write validation returned `P07_REPORT_CHECK: PASS`: four JSON blocks parsed, ten rules covered the 130 inputs exactly once, rule/group totals and digests matched, all 50 receipt hashes/ranges/pointers and 41 local Markdown links checked, and shared worklog/register fingerprints remained unchanged. The first invocation returned unrelated-looking revision output without a validation summary and was not counted as a pass; the repeated read-only probe returned the explicit result. These checks do not test production behavior or prove the classification semantically.
- The finite reverse-symbol probe searched current `review-required`, present, non-Kupua/non-scripts files with Scala/SBT/shell/JS/TS/YAML/XML extensions: 685 candidates, no matches for the five F1 symbols. SHA-256 of the register-order `[{path,sha256},...]` candidate list is `77fc77ec9eb99968aee427991416d4efd07841d55c7a843dc91b2dcf8ef8fa22`. This is mechanical search coverage, not 685 source-reading receipts.
- Read-only Git history operations used bounded `log` subjects and `show --stat` for the named fork/converter paths. Author metadata was omitted. Compressed stat output is not claimed as complete historical source reading. No Git child process was spawned from Node and no Git mutation occurred.
- One guessed prompt filename did not exist; the correct prompt is receipted. Initial broad navigation searches included unwanted nested documentation hits and truncated library matches; these were not used as exhaustive evidence. Absolute-path searches and the finite metadata-selected probe supplied the qualified consumer check. Tool-managed output captures were read where needed; no scratch program, alternate register or second report was authored.
- No npm/test/build suite, operational script or operational command described in documentation, browser, app/service, network request, ES/AWS access or subdelegation ran. The packet invocation was explicitly authorized in the delegation. No excluded credential/runtime payload was opened or hashed. No real identities, email addresses, service hosts, credential values, signed URLs or runtime bodies are reproduced here.
- The only intentional workspace write is this report via `apply_patch`. Source and all old plans remain unchanged. Stop after this report; coordinator integration and the four named dependency follow-ups are the remaining work.