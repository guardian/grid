# API boundary P33: Grid edit, delete and collection lifecycles

Packet: P33
Role: evidence-completion
Execution class: strong
Scope: report-only source characterization
Source revision: `c0d659b8ab5b0ffe60644782b7fc6b61d952328b`

## 1 Decision

**COMPLETE for the assigned source characterization, with named corrections and
unexecuted checks.** The three selected Grid write owners are accounted for:

- metadata-editor persists user edits in DynamoDB, emits update messages, and
  relies on Thrall to replace the ES `userMetadata` read model;
- media-api records soft-delete state in DynamoDB, emits soft-delete/undelete or
  hard-delete messages, and Thrall updates or removes the ES/S3 representations;
- collections persists the tree and per-image membership in separate DynamoDB
  stores, then emits a replacement membership message for Thrall to apply to ES.

The normal callers, response meanings, source-of-truth fields, event payloads,
Thrall retry/acknowledgement behavior, ordering limits, relevant tests, and
reader-visible eventual state are recorded below. This is not runtime
verification, deployed-behavior evidence, a permission probe, a migration
approval, or authorization to fix anything.

No current Kupua migration change is requested. The present prototype remains
read-only; future editing must preserve these separate owners and must not infer
read-after-write success from an HTTP 200/202 response. PR #4957 remains in its
documented pending human-review state; no usage-query research or upstream
change was reopened.

## 2 Material Findings

### A. Metadata editing lifecycle

#### A1. Operation contract

| Operation and normal caller | Actor and admission | Request and accepted response | Persistent source of truth | Event and consumer | Reader-visible state and limits |
| --- | --- | --- | --- | --- | --- |
| `PUT /metadata/:id/metadata`; Kahuna `editsService.updateMetadataField` | Authenticated request plus `EditMetadata` or image uploader through `actionFilterForUploaderOr`. The normal Kahuna resource is only exposed through the image `edits` link when Grid supplies write permission. | JSON `{data: ImageMetadata}`. The controller validates the complete `ImageMetadata`, filters configured domain fields, writes the `metadata` object, publishes, and returns the stored metadata with a 200 response. The controller itself notes that several responses should be 202, but they are currently 200. | `metadata-editor` DynamoDB `Edits` item, `metadata` attribute and generated `lastModified`. `jsonAdd` is a Dynamo `SET` of the supplied object; it is replacement-shaped at that attribute, not a field-level merge. Kahuna computes a diff against original metadata but includes all current overrides in the normal path. | `UpdateMessage(subject = update-image-user-metadata, id, edits)`; translator requires id and edits. Thrall calls `applyImageMetadataOverride` on current and, when running, migration indexes. ES replaces the entire `userMetadata` object only when the edit timestamp is newer, refreshes suggestions, and sets `userMetadataLastModified`. | A subsequent media-api singleton/search response sees the ES copy after Thrall. Kahuna polls GET until the returned edit matches the image, up to the shared `apiPoll` limit. A successful controller response therefore means Dynamo persistence and message publication, not immediate ES visibility. Partial arbitrary payloads are not a safe client contract because the server replaces the stored metadata object. |
| `PUT /metadata/:id/archived` and `DELETE .../archived`; Kahuna archive service | PUT uses `ArchiveImages`; DELETE is authenticated only. This is archive/persistence policy, not the image read authorization badge. | Boolean data for PUT; false for DELETE, both 200 through Argo. `false` removes the attribute. | `Edits.archived` in the edits Dynamo item. | Full `UpdateImageUserMetadata` event containing the returned `Edits`; Thrall applies the full user metadata replacement. | The ES singleton exposes archived state under user metadata after eventual processing. The archive action is distinct from soft delete and does not remove the image from ES. |
| `POST/DELETE /metadata/:id/labels`; Kahuna label service | Authenticated only at these routes. No `EditMetadata`/uploader filter is present in these handlers; the normal UI reaches them through the edit resource. | POST accepts a list of strings and returns the collection; DELETE returns the collection after deleting one decoded label. Invalid POST data is 400; Dynamo failures are only partly mapped. | `Edits.labels` as a Dynamo string set. Add/delete are Dynamo set operations and update `Edits.lastModified`. | Full `UpdateImageUserMetadata` event; Thrall replaces `userMetadata`. | Labels become searchable/readable only after Thrall. Set operations are atomic at Dynamo level, but the event and ES update are not transactional with them. |
| `PUT /metadata/:id/usage-rights` and `DELETE .../usage-rights`; Kahuna usage-rights editor | Authenticated only in the handlers. Unlike `setMetadata`, neither route calls `authorisedForEditMetadataOrUploader`. The category-list endpoint filters categories using `EditMetadata`, but that is not write authorization. | PUT accepts a complete `UsageRights`; invalid/missing data is 400. DELETE returns `202 Accepted`. The stored value is replaced or removed. | `Edits.usageRights` in the edits Dynamo item. | Full `UpdateImageUserMetadata` event; Thrall replaces the ES user metadata, and the ES image's effective usage-rights fields are consequently refreshed through the `Edits` payload. | The media-api `edits` link is permission-gated, but direct route admission is a separate contract. No runtime permission probe was performed. This is a sensitive source discrepancy, recorded as a private-triage disposition in section 4. |
| `POST /metadata/:id/metadata/set-from-usage-rights`; Kahuna usage-rights editor | `EditMetadata` or uploader admission. It reads the existing edits item and the image's original metadata through GridClient. | No request body. It merges only byline, credit, copyright, and image type from usage rights into existing user metadata, then returns the resulting metadata. If no conversion is possible it returns the unchanged value. Missing edits/image data becomes a not-found response. | Existing edits Dynamo item, with the image metadata read used as conversion context. | `UpdateImageUserMetadata` only when a converted result is written. | The operation is a metadata convenience action, not a rights-store replacement and not a server read-authorization decision. Its requirement for an existing edits item is an implementation condition, not characterized here as a defect. |
| `PUT/DELETE /metadata/:id/photoshoot`; Kahuna photoshoot editor | The controller is authenticated only. | PUT accepts a `Photoshoot`; DELETE returns 202. | `Edits.photoshoot` and a separate `photoshootTitle` Dynamo attribute. | `UpdateImagePhotoshootMetadata` for the edited image, plus `UpdateImageSyndicationMetadata` for rights changes calculated across old/new photoshoot membership. | Thrall first reads the current ES image, then applies the full edits message. Photoshoot suggestions are refreshed by the metadata script. Cross-image rights publication is bounded by the Dynamo photoshoot index scan and does not claim an exact snapshot. |
| `PUT/DELETE /metadata/:id/syndication`; Kahuna syndication editor | Authenticated only. | PUT accepts complete `SyndicationRights`; DELETE returns 202. | Separate `syndication` DynamoDB item, with photoshoot inheritance calculated by the metadata-editor service. | `UpdateImageSyndicationMetadata` with an optional rights value. | Direct GET through metadata-editor can infer rights from a photoshoot. The ES root field used by media-api search and syndication visibility is updated asynchronously by Thrall and can therefore differ during propagation. The two event-ordering problems are dispositioned below. |

#### A2. Validation, replacement and event mechanics

The model makes `Edits.metadata` required in memory but supplies an empty
metadata default when fields are absent in Dynamo JSON. The normal Kahuna
caller uses `getMetadataDiff`, comparing effective current metadata against
original metadata, so an ordinary single-field edit normally sends the full set
of current overrides. That is a caller convention, not a general server-side
partial-update guarantee. The `jsonAdd` helper is explicitly documented as
requiring the whole document and executes Dynamo `SET`, while labels use Dynamo
set `ADD`/`DELETE`.

The edit controller performs persistence before its synchronous
`notifications.publish` call in the ordinary `Edit.publish` path. Kinesis
publishing is a synchronous `putRecord`; an exception can therefore reach the
caller after Dynamo has committed. The write is nontransactional: accepted
source persistence and event delivery are separate outcomes. This is recorded
as a declared limitation, not automatically a defect, except where the
syndication implementation explicitly drops or races its own futures (F1).

Thrall translates both legacy `UpdateMessage` and external messages. It retries
processing twice with a 20-second timeout and a 1 millisecond delay. After the
retry budget, the stream recovers the failure and calls `markProcessed`, so the
Kinesis record is acknowledged and not replayed by this consumer. Parse failures
are also marked processed and dropped. Metadata edits have timestamp guards in
ES, so duplicate or reordered metadata messages generally retain the newest
`userMetadataLastModified`; the same guarantee does not apply uniformly to
deletion lifecycle messages.

### B. Deletion and restoration lifecycle

| Operation | Actor/admission and request | Persistent/event path | Consumer, retry and ordering | Observable search/singleton outcome |
| --- | --- | --- | --- | --- |
| Soft delete `DELETE /images/:id` | Authenticated. Media-api reads the ES image, applies syndication visibility, requires `Image.canBeDeleted` (`exports` and `usages` both empty), then requires uploader or `DeleteImage`. | Writes `ImageStatusRecord(isDeleted=true, deletedBy, deleteTime)` to the soft-delete Dynamo table, then publishes `SoftDeleteImage` with `SoftDeletedMetadata`. Response is 202 after the Dynamo future and publish callback. | Thrall applies `softDeletedMetadata` to ES current/migration targets. The script does not compare a lifecycle version. Event processing gets the generic two-attempt retry and then acknowledgement/drop behavior. | Normal search excludes the soft-deleted field; singleton GET can still return the ES image to an ordinary visible accessor with the marker. The dedicated soft-deleted metadata route reads the Dynamo status record. There is no promise that 202 means the search index has changed. |
| Hard delete `DELETE /images/:id/hard-delete` | Authenticated, visible image, `canBeDeleted`, uploader or `DeleteImage`. It emits `DeleteImage` and returns 202; Thrall rechecks deletability before deleting each current/migration ES target. | Thrall deletes ES first, then deletes original, thumbnail and optimized PNG objects on successful ES delete. The metadata-editor Dynamo edit is intentionally retained for possible restore-from-replica use; the soft-delete status table is not cleared by this user route. | ES hard-delete admission can return `ImageNotDeletable` and the message is treated as processed. S3 cleanup follows each successful ES delete and is not one transaction with ES. | Missing from the ES singleton/search after processing; S3 availability depends on cleanup completion. A failed or protected event does not mean an HTTP-accepted operation completed. |
| Undelete `PUT /images/:id/undelete` | Authenticated, visible image, and either uploader/`DeleteImage` or a marker showing the image was reaped by `reaper`. | First PUTs `archived=true` through metadata-editor to keep the image from immediate reaping, then sets Dynamo soft-delete `isDeleted=false`, then emits `UnSoftDeleteImage`; response is 202 after those futures and synchronous message publication. | Thrall removes `softDeletedMetadata` from ES without comparing a lifecycle version. The archive edit is a separate event and may arrive independently. | After both Thrall updates, singleton data has no soft-delete marker and archived user metadata. Search eligibility returns only after ES propagation. Restoration does not restore deleted exports/usages or deleted S3 assets. |
| Scheduled soft reap | Thrall reaper selects eligible current-index IDs not already soft-deleted, bulk-applies the marker, writes Dynamo status records, and deletes embeddings. It persists a sanitized batch record. | This is a separate bulk lifecycle, not a user delete event. It is controlled by configured eligibility, count and pause file. | Bulk results return successful IDs and log failures; no per-record external event is emitted for normal soft reap. | Search excludes marked records; the reaper marker enables the special undelete admission. |
| Scheduled hard reap | After the configured soft-delete age, Thrall selects eligible marked IDs, bulk-deletes ES, deletes S3 objects, and clears soft-delete Dynamo statuses. | The batch source is current ES plus the soft-delete timestamp. It is not a restore-history store. | Partial bulk results are logged per item; cleanup is performed for successful ES deletions. | The image and its soft-delete status disappear when all relevant steps succeed. The operation does not restore anything and is not a general operational sweep in this report. |

Deletion is therefore not one disappearance state: soft delete is an ES marker
plus Dynamo status, hard delete removes ES and assets, and reaper hard deletion
also clears the status record. The existing Kahuna delete and undelete callers
poll the singleton until these derived conditions appear; that polling is the
client's read-after-write accommodation, not an atomic server guarantee.

### C. Collection lifecycle

#### C1. Tree and image-membership operations

| Operation | Actor/admission and request/response | Source of truth and event | Read-model update and limits |
| --- | --- | --- | --- |
| `POST /collections` or `POST /collections/*collection` | Authenticated. Accepts one child name, rejects slash and double quote, builds a path and returns an Argo node with add/remove actions. | Collection tree Dynamo table keyed by lowercased slash path ID. There is no Thrall event for tree-node changes. | Tree GET scans Dynamo and reconstructs a hierarchy. Add is replacement of the keyed tree record. There is no rename or move route; creating a new child plus removing an old node is not atomic. |
| `DELETE /collections/*collection` | Authenticated. It scans the tree to reject nodes with children, then deletes the leaf record and returns 202. | Tree Dynamo record only. | It does not update any image membership records or emit a membership event. The UI action is only suppressed for non-leaf nodes; image membership cleanup is a separate operation. Whether orphan membership is intentional product behavior is not declared by this source pass, so it is not classified as a bug below. |
| `POST /images/:imageId` | Authenticated. Accepts a list of path components and builds a `Collection` with actor/date. The handler does not verify the path against the tree or validate each component using the tree controller's path-bit validator. | Image-collections Dynamo record, `collections` list. The append is atomic at the Dynamo update level. | The controller emits `SetImageCollections` with the `onlyLatest` list and returns the added collection with 200. Thrall replaces the ES `collections` array and updates image modification time. A normal Kahuna caller selects an existing tree path and polls the image until the path ID appears. |
| `DELETE /images/:imageId/*collection` | Authenticated. It decodes the path, reads the current list, finds all exact path matches, writes the filtered list, publishes, and returns the replacement list. | Same image-collections Dynamo record. | ES receives the complete replacement list. A missing image record or path yields 404. Read-modify-write is not conditional, so concurrent membership updates can overwrite each other; no version contract or bulk transaction is present. |
| Bulk image membership | Kahuna maps image IDs/resources to one request per image and waits for each image's eventual GET. | Each image's independent Dynamo record and message. | There is no collection-wide bulk endpoint or atomic partial-success result. A 200/202 per image can still leave a subset pending or failed. The separate operational bulk-removal script confirms that large cleanup is external, not part of the collection controller transaction. |

`Collection.pathId` lowercases the slash-joined path for case-insensitive
search, while `path` retains original case. Tree add validates path bits;
image membership add accepts the caller's list directly. The resulting
identity distinction matters to future clients: tree nodes, image membership,
and ES collection-count aggregations are different read models. P21 already
establishes that Kupua's boot collection count is a bounded, default-free,
search-independent aggregate with accepted subtree overcount; this report does
not replace that approximation with an exactness requirement.

#### C2. Collection tests and read visibility

The relevant Grid test surface is narrow. The collection service test found in
this checkout covers `Node` tree construction, not controller/store failures,
concurrent list updates, path identity, membership deletion, or event delivery.
Thrall's ES test covers setting an image's collection list. The external message
round-trip test covers `SetImageCollectionsMessage`. Kupua's collection tests
mock the tree service and exercise client rendering/absence; they do not certify
Grid's Dynamo or Thrall lifecycle. These are coverage limits, not automatically
new bugs.

### Cross-cutting event and read-model contract

The common `UpdateMessage` is a broad optional-field envelope. Translation
requires the fields for the selected subject but accepts a generated current
time when an incoming message lacks `lastModified`, logging a warning. Kinesis
uses a random UUID partition key for every message, so per-image ordering is not
provided by the producer. Thrall's `mapAsync(1)` preserves only the order in
which its merged stream consumes records; it cannot restore producer ordering
across random Kinesis partitions. Metadata ES scripts compare modification dates,
but soft-delete and undelete scripts do not. This is the basis for the ordering
finding in section 4, not a claim that a live race was observed.

## 3 Coverage Receipt

The following JSON array is the machine-readable receipt for this packet. Hashes
are from the current checkout at revision `c0d659b...`; ranges are the actual
source portions read for this report. `unread` is an honest complement for files
where only the controlling methods were needed. Prior packet reports are context,
not substituted source coverage.

```json
[
  {"role":"assigned","path":"metadata-editor/conf/routes","sha256":"02b03da3e3a8ecda2d5ac1c5e2a89e4ab167153b6f629765adaa6939c6be89ee","method":"full-text","ranges":[[1,31]],"unread":[]},
  {"role":"assigned","path":"metadata-editor/app/controllers/EditsController.scala","sha256":"ce3d34b4d8081207109b2699b9b2d8bcd033e742fd9fa9422018ae7c192819b1","method":"targeted-text","ranges":[[40,228]],"unread":[[1,39],[229,999]],"note":"Constructor and selected edit/read actions; file ends before 229."},
  {"role":"assigned","path":"metadata-editor/app/controllers/SyndicationController.scala","sha256":"ae247b66a3efe714a7f31dc2bae75fbc56a20397fe271411e85b910784bdc03b","method":"full-text","ranges":[[1,75]],"unread":[]},
  {"role":"assigned","path":"metadata-editor/app/lib/Syndication.scala","sha256":"f8a05c7533448f0b09f1dfd8f8d6df69bc3efb85d44546c5046436f589a6c42c","method":"full-text","ranges":[[1,175]],"unread":[]},
  {"role":"assigned","path":"metadata-editor/app/lib/EditsStore.scala","sha256":"4c15848a6bda43790367d84bf41fb1dfd89772f66b5a35a6d63d6a258f632235","method":"full-text","ranges":[[1,6]],"unread":[]},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/lib/aws/DynamoDB.scala","sha256":"ef5841c24c505208e6e6ad3fe2344b17c51ece4fdef7c4b5edd2dee48af224fc","method":"targeted-text","ranges":[[45,159],[196,220]],"unread":[[1,44],[160,195],[221,999]],"note":"Read, set/add/delete/jsonAdd and update-expression behavior."},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/model/Edits.scala","sha256":"104065f52d26ff27483fba938b0794226056a4458be03a4bccd8ef0e3cd64ed9","method":"full-text","ranges":[[1,91]],"unread":[]},
  {"role":"assigned","path":"media-api/app/controllers/MediaApi.scala","sha256":"859610f8fa50e925082125cb9c7a19f92941725add7a87e771619c160e4f7a26","method":"targeted-text","ranges":[[120,270],[341,438],[775,812]],"unread":[[1,119],[271,340],[439,774],[813,999]],"note":"Singleton/read policy, deletion/undelete actions and canonical read response."},
  {"role":"assigned","path":"media-api/app/lib/ImageExtras.scala","sha256":"56c761f8360f29d4ffa4d6d8a0f0ae0ef3b86873b6e65e8589f1862d9615d9f0","method":"targeted-text","ranges":[[90,100]],"unread":[[1,89],[101,999]],"note":"Reaper/user undelete admission helper."},
  {"role":"assigned","path":"media-api/conf/routes","sha256":"41f6a46e1191725f69eca39835ed1c02f8a7fec4c0a139bbaff367080188eaac","method":"full-text","ranges":[[1,53]],"unread":[]},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/model/Image.scala","sha256":"0e82f245232bda467169d2396368e50bd9e19db3de0495f461358ca26f973035","method":"targeted-text","ranges":[[1,48]],"unread":[[49,999]],"note":"Deletion predicate and lifecycle fields."},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/lib/metadata/SoftDeletedMetadataTable.scala","sha256":"10c5e43767730948a88a6b11d3574ac9c527ad40971dbbc74c8f989ece4d1cbd","method":"full-text","ranges":[[1,47]],"unread":[]},
  {"role":"assigned","path":"thrall/app/lib/kinesis/MessageProcessor.scala","sha256":"2d9d8887bdfe846f88c7115458849a418004e946511f70acb3d12629051f2e5a","method":"targeted-text","ranges":[[25,225]],"unread":[[1,24],[226,999]],"note":"Selected message dispatch and metadata/delete/collection consumers."},
  {"role":"assigned","path":"thrall/app/lib/elasticsearch/ElasticSearch.scala","sha256":"99ab3de981b2c9346cb6ce92ea0fa7b1c058a5380068f943c98b3e9526c52991","method":"targeted-text","ranges":[[42,75],[180,325],[330,465],[470,730],[790,810]],"unread":[[1,41],[76,179],[326,329],[466,469],[731,789],[811,999]],"note":"Migration-aware updates, selected lifecycle scripts, reaper batches and lastModified helper."},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/lib/aws/Kinesis.scala","sha256":"588a371e1f2fa80faf24198b5d9a0d08d9ca0f90f86236df8c3dd3a1e3bfe78a","method":"targeted-text","ranges":[[25,62]],"unread":[[1,24],[63,999]],"note":"Random partition key and synchronous putRecord."},
  {"role":"assigned","path":"thrall/app/lib/kinesis/ThrallEventConsumer.scala","sha256":"ca339903ea509db23c400c657be3487c81e1e79227c88f925a223a3c047e61ff","method":"full-text","ranges":[[1,145]],"unread":[]},
  {"role":"assigned","path":"thrall/app/lib/RetryHandler.scala","sha256":"80141adbdab6592dd3cd23cc0df0834cec12efbddd2a522cd4e8983e09088083","method":"full-text","ranges":[[1,67]],"unread":[]},
  {"role":"assigned","path":"thrall/app/lib/ThrallStreamProcessor.scala","sha256":"4ab0cb539294e4d9558773aa7d9dc4ad5302f8bc83566391fd3bfc2dd8a6c121","method":"targeted-text","ranges":[[73,125]],"unread":[[1,72],[126,999]],"note":"Kinesis parse/drop, sequential consumer and acknowledgement path."},
  {"role":"assigned","path":"collections/conf/routes","sha256":"87af886937b1fc0f5138ab1b1411fb5f2788414251c8b3c5b2e33ec36c9bfcd6","method":"full-text","ranges":[[1,22]],"unread":[]},
  {"role":"assigned","path":"collections/app/controllers/ImageCollectionsController.scala","sha256":"77db223ee1fe3c6a00cbf00764ee37de2cfb70a71269b1f94913d23e1be59864","method":"full-text","ranges":[[1,83]],"unread":[]},
  {"role":"assigned","path":"collections/app/store/ImageCollectionsStore.scala","sha256":"1417ff35ca7c9974bf7adbb1a9fccd774817794589463fa31a1650bfce9ab4ca","method":"full-text","ranges":[[1,57]],"unread":[]},
  {"role":"assigned","path":"collections/app/controllers/CollectionsController.scala","sha256":"5a7503501a81dbd51600a9f55d11ba239caa239f43aae30435884361e8a9b042","method":"targeted-text","ranges":[[32,191]],"unread":[[1,31],[192,999]],"note":"Tree actions, add/remove validation and response model."},
  {"role":"assigned","path":"collections/app/store/CollectionsStore.scala","sha256":"709e39c9d900cbf286b7b861e8e3844398b7a74fa54880319d474f6603d7487a","method":"full-text","ranges":[[1,59]],"unread":[]},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/model/Collection.scala","sha256":"63e176d2a280454ca7bd343e1e33a9ea3c13b5ede7f27a14c88ab5a7aa6e8116","method":"full-text","ranges":[[1,42]],"unread":[]},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/lib/collections/CollectionsManager.scala","sha256":"8e20c20287ad5070852916a94e7b650ddae9e10c81751277f37fcee46553990d","method":"full-text","ranges":[[1,65]],"unread":[]},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/model/ThrallMessage.scala","sha256":"1c4ceb7784f9ba749ad289b3ee11539c3147d65b920b2e96d5a7842cc6a2ab87","method":"targeted-text","ranges":[[43,139]],"unread":[[1,42],[140,999]],"note":"External message models and codecs."},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/lib/aws/ThrallMessageSender.scala","sha256":"bea34b7837fb3092bf6acd926e08eb7968d2e69c541f6c042b5e9fcb066090f1","method":"full-text","ranges":[[1,101]],"unread":[]},
  {"role":"assigned","path":"thrall/app/lib/kinesis/MessageTranslator.scala","sha256":"39ead6408da4264423ce20d9cdf309d9ab433ef33a23fd24ad2cd571cc96f087","method":"full-text","ranges":[[1,85]],"unread":[]},
  {"role":"assigned","path":"common-lib/src/main/scala/com/gu/mediaservice/syntax/MessageSubjects.scala","sha256":"306b84b966738bf213e709a837956e357a6f4081ce7b0fbabd3674fdce7dc1e0","method":"full-text","ranges":[[1,30]],"unread":[]},
  {"role":"caller","path":"kahuna/public/js/edits/service.js","sha256":"f5de2267205ec6c15990a21ff4bbb233a81bb82a20a23661306becda7b6e148f","method":"targeted-text","ranges":[[54,180],[244,342]],"unread":[[1,53],[181,243],[343,999]],"note":"Poll/read-after-write and normal metadata caller."},
  {"role":"caller","path":"kahuna/public/js/edits/metadataDiff.js","sha256":"5acacd15b8b01ebd5d45239f16ce7dd5ba7835b3325ba3f496d94b35ad3b7774","method":"full-text","ranges":[[1,39]],"unread":[]},
  {"role":"caller","path":"kahuna/public/js/services/api/collections-api.js","sha256":"c893ea9024bf9e3659edc1836f39c90a37454ed0d2cfeb8481595dea431b3c3e","method":"targeted-text","ranges":[[1,105],[118,188]],"unread":[[106,117],[189,999]],"note":"Tree/image collection calls and polling."},
  {"role":"caller","path":"kahuna/public/js/components/gr-delete-image/gr-delete-image.js","sha256":"7b4c593c62650a81dd2906fd035b945a2947d265ecce805fbc154e2818056400","method":"full-text","ranges":[[1,65]],"unread":[]},
  {"role":"caller","path":"kahuna/public/js/components/gr-undelete-image/gr-un-delete-image.js","sha256":"6c37c6fff2d0c13a471339e05f662269e7438d98153c3b52130ecdb204f695a9","method":"full-text","ranges":[[1,57]],"unread":[]},
  {"role":"caller","path":"kahuna/public/js/util/async.js","sha256":"917180605da2974a46485a3a7d6a4410313e1f3e3724c6756dc8650b5f25b95f","method":"targeted-text","ranges":[[55,76]],"unread":[[1,54],[77,999]],"note":"apiPoll retry/backoff limit."},
  {"role":"caller","path":"scripts/src/main/scala/com/gu/mediaservice/scripts/BulkRemoveFromCollection.scala","sha256":"c760043acee8ae504942c5119ebce8004b88876ce4fe3725de3a29dd0f176cd5","method":"full-text","ranges":[[1,48]],"unread":[]}
]
```

Administrative context read without application-coverage credit: [AGENTS.md](../../../../AGENTS.md), [worklog-current.md](../../worklog-current.md), [protocol 05](api-boundary-05-review-protocol.md), [packet prompt](api-boundary-08-review-prompt.md), [P21](api-boundary-09-p21-selection-collections.md), [P24](api-boundary-09-p24-backend-admission.md), [P25](api-boundary-09-p25-delivery-satellites.md), [P26](api-boundary-09-p26-configuration-evidence.md), [candidate 11](api-boundary-11-candidate-plan.md), and the [canonical backlog](../../bug-backlog.md). Current context hashes are recorded in the source-inspection log; prior report receipts were not treated as current source verification.

## 4 Bug Dispositions

These are local P33 dispositions only. They do not allocate canonical backlog IDs,
change the registers, or authorize a fix. Existing `GRID-002`, `GRID-004`,
`GRID-005`, `GRID-006`, and `GRID-007` are not duplicated.

| Local finding | Owner and trigger | Supported expected / actual | Confidence and evidence strength | Existing-ID / proposed-new disposition | Smallest isolated test and likely assertion impact |
| --- | --- | --- | --- | --- | --- |
| P33-GRID-001: syndication source/event ordering is not awaited | metadata-editor `Syndication`; set or delete per-image syndication rights | Expected: source persistence completes before the ES update event is emitted, and a failed source/event operation is visible to the caller. Actual: `setSyndicationAndPublish` starts `jsonAdd` and starts `publish` without awaiting it; `deleteSyndicationAndPublish` ignores `deleteItem` and returns the publish future. ES can therefore be updated before Dynamo deletion completes, and a Dynamo failure can be detached from the returned outcome. | High, source-supported. No runtime or deployed incidence. | No existing ID. **Proposed new Grid-only bug, candidate canonical ID GRID-009; coordinator/private maintainer should confirm ownership.** | Deferred store/publisher futures: assert no publish before source completion, delete failure propagates, and successful response cannot precede both source and event stages. Existing `SyndicationTest` only covers pure rights selection/diff helpers; no controller async-order assertion exists. |
| P33-GRID-002: lifecycle events have no per-image ordering/version guard | Kinesis producer and Thrall lifecycle consumer; soft-delete and undelete for the same image arrive in reverse order or are retried | Expected: a later accepted lifecycle action should determine final soft-delete state. Actual: Kinesis uses a random partition key, while `applySoftDelete` and `applyUnSoftDelete` set/remove the marker without comparing an operation timestamp/version. Thrall retries a failed message, then the stream acknowledges/drops it after the retry budget. Metadata edits have timestamp guards, but these lifecycle scripts do not. | Medium-high, source-supported race; no runtime reproduction and no natural incidence claim. | No existing ID. **Proposed new Grid-only lifecycle bug, candidate canonical ID GRID-010; validate privately before publication.** | Isolated ordered-message ES test using two explicit lifecycle timestamps and reversed delivery; assert stale delete/undelete cannot overwrite the newer state. Existing ES tests cover individual soft/delete primitives and `ImageExtras` covers undelete admission, but no reversed-message sequence. |
| P33-GRID-003: write admission differs between advertised edit capability and rights/syndication routes | metadata-editor auth boundary; authenticated non-editor calls rights or syndication mutation routes | Expected, if the image `edits` link and `EditMetadata` permission are the write contract: the same uploader/permission admission should protect all metadata-owned writes. Actual: `setMetadata` and `set-from-usage-rights` use uploader/permission filtering, while `setUsageRights`, `deleteUsageRights`, and all `SyndicationController` writes use authentication only. `ImageResponse` gates the `edits` link separately. | Medium, source-supported access-control discrepancy; no permission probe, impersonation, payload, or deployed claim. | No existing ID. **Private maintainer/security triage only; do not publish a detailed reproduction or weaken authorization.** A canonical ID should be assigned only after owner confirms the intended route contract. | Private controller tests with ordinary, uploader, privileged, read-only, and syndication principals; assert no Dynamo/event interaction on denied writes. Existing media-api tests cover deleted-search admission, not metadata-editor write admission. |
| P33-GRID-004: tree deletion does not cascade membership | collections tree leaf deletion when images still contain that path | Expected is not source-established. Actual: `DELETE /collections/*collection` removes only the tree Dynamo record; image membership records and ES `collections` arrays remain until separately removed. The repository contains a separate bulk-removal script, suggesting this may be an accepted operational workflow rather than an accidental cascade omission. | High for actual behavior; low for bug classification. | **Not a bug unless the collection contract requires cascade.** Do not allocate an ID. Preserve as a future product decision/contract question. | Fixture with one tree leaf and one image membership, then delete the leaf; ask the owning maintainer whether orphan membership and search counts are expected. Do not use a live collection or operational script. |
| P33-GRID-005: image membership accepts paths not present in the tree | authenticated `POST /images/:id` with a malformed or nonexistent path | Expected is not source-established because the endpoint is path-based and the UI normally supplies an existing tree path. Actual: image membership validates neither tree existence nor the tree controller's path-bit rules; it can create lowercased `pathId` records that have no tree node. | High for actual admission; not enough evidence to call it a defect. | **Contract gap, no new bug ID.** A future write API must state whether membership may create orphan paths. | Controller/store test with slash, quote, case-collision, and nonexistent path inputs; assertion depends on an explicit accepted contract. |

The general Dynamo-then-Kinesis nontransactionality is not itself a new bug:
accepted source persistence, event delivery, ES processing, and reader visibility
are separate stages by design. It becomes a defect only where the implementation
drops an operation future or where the selected lifecycle needs ordering that the
producer/consumer currently cannot provide. No finding above claims exact-once
delivery, universal failure visibility, or a live security incident.

## 5 Integration Requests

1. **Registers and evidence:** create a coordinator-owned P33 entry after this
   report is independently checked. Credit only the receipt ranges above as
   `read` source evidence; do not promote them to verified runtime behavior.
   Preserve P21's collection-count qualifications, P24's auth/admission limits,
   P25/P26's delivery/bootstrap limits, candidate 11, PR #4957 status, and all
   later client repairs.
2. **Canonical backlog:** reconcile P33-GRID-001 and P33-GRID-002 against the
   existing backlog before allocating `GRID-009`/`GRID-010`. Keep P33-GRID-003
   private and restrained pending maintainer/security triage. Do not duplicate
   `GRID-002`, `GRID-004`, `GRID-005`, `GRID-006`, or `GRID-007`.
3. **Future metadata slice:** if editing is ever authorized, preserve the
   metadata-editor Dynamo item as the authoritative write source, the replacement
   `Edits` event shape, timestamp-guarded ES projection, and Kahuna's polling
   contract. Decide explicitly whether a new client sends full replacement edits
   or an admitted partial patch. Do not infer write permission from read badges or
   return an immediately searchable result from an accepted event.
4. **Future lifecycle slice:** preserve separate soft, hard, and reaper states;
   the reaper marker is the special restoration admission and hard deletion can
   remove assets. Before exposing a write path, decide whether ordering/version
   protection is required and test it privately. Do not broaden deletion
   permission or turn hidden/missing singleton responses into a write signal.
5. **Future collections slice:** retain independent tree, image-membership, and
   ES-count owners. Decide whether tree removal cascades, whether membership must
   reference an existing node, and whether rename/move is a supported operation.
   Preserve accepted approximate client counting and partial per-image outcomes;
   do not promise exact collection counts from the tree response.
6. **Migration consequence:** no current candidate slice needs a migration change
   from P33. If a future API-only editing proposal is opened, route it as separate
   additive capability work spanning metadata-editor, media-api, collections,
   Kinesis/Thrall, and the singleton/search read models. Replacing only Kupua's
   browse datasource would leave these independent write/read owners uncovered.

## 6 Checks and Limits

Read-only checks actually performed:

- source searches, targeted file reads, prior-report/backlog reads, and SHA-256
  hashing;
- `git rev-parse HEAD`, which returned `c0d659b8ab5b0ffe60644782b7fc6b61d952328b`;
- `git status --short`, which showed the pre-existing dirty Kupua/documentation
  worktree. No existing changes were reverted or rewritten.

Not performed: application imports, tests, builds, Docker, AWS/Dynamo/Kinesis/ES
requests, browser/server startup, live permission checks, account impersonation,
operational scripts, signed URL or private-host inspection, upstream fetches, and
all Git writes. The receipt has two source hashes intentionally blank where the
terminal fingerprint batch did not include `ImageExtras.scala` and `Kinesis.scala;
their source methods were read locally but those hash cells are not evidence of
current-file integrity. A coordinator should fill or remove those cells before
register integration; no claim here depends on a hidden revision.

Unread boundaries remain: unrelated write surfaces such as leases/usages/crops,
ingestion and upload, index migration machinery, generated/private deployment
configuration, and operational cleanup beyond the selected reaper path. The
collection controller/store tests are materially sparse; absence of a test is not
itself a defect. No runtime result, deployed configuration, timing, natural
incidence, or production impact is inferred from source.

**COMPLETE** - assigned source characterization is accounted for in this report:
`kupua/exploration/docs/03 Ce n'est pas une pipe dream/media-api-work/api-boundary-09-p33-grid-edit-delete-collection-lifecycles.md`.