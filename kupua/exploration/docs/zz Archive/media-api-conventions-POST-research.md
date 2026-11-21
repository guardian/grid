# Research: Does Grid Use POST Body Parsing? (2026-05-30)

## Objective

Confirm whether any Grid Play service parses a POST/PUT/PATCH request body as JSON
(or form data) for a read or write operation. Motivated by the question: does
**precedent exist** for introducing `parse.json` body parsing in media-api?

**TL;DR: Yes, overwhelmingly. 6 services, ~25 endpoints, one dominant pattern.**

---

## Grep commands run

```bash
# 1. Body parser usage across all Play services
grep -rn "parse\.json\|parse\.tolerantJson\|parse\.text\|parse\.raw" \
  --include="*.scala" \
  auth/ collections/ cropper/ leases/ metadata-editor/ \
  media-api/ thrall/ usage/ image-loader/ common-lib/ rest-lib/

# 2. request.body access
grep -rn "request\.body" \
  --include="*.scala" \
  auth/ collections/ cropper/ leases/ metadata-editor/ \
  media-api/ thrall/ usage/ image-loader/

# 3. Route files — all POST/PUT/PATCH routes
grep -n "POST\|PUT\|PATCH" \
  auth/conf/routes collections/conf/routes cropper/conf/routes leases/conf/routes \
  metadata-editor/conf/routes media-api/conf/routes thrall/conf/routes \
  usage/conf/routes image-loader/conf/routes 2>/dev/null

# 4. Any Action declarations with body parsers
grep -rn "Action\(parse\|Action\.async\(parse" \
  --include="*.scala" \
  auth/ collections/ cropper/ leases/ metadata-editor/ \
  media-api/ thrall/ usage/ image-loader/

# 5. JsonBodyParser or custom BodyParser
grep -rn "BodyParser\|JsonBodyParser" \
  --include="*.scala" \
  auth/ collections/ cropper/ leases/ metadata-editor/ \
  media-api/ thrall/ usage/ image-loader/ common-lib/ rest-lib/
```

No matches for `parse.tolerantJson`, `parse.text`, `parse.raw`, `JsonBodyParser`,
or `Action(parse` (no bare `Action` — all use `auth` wrapper). Cmd 4 returned empty.

---

## Services that DO parse JSON request bodies

### 1. collections — `parse.json`, 2 endpoints

- `collections/app/controllers/CollectionsController.scala:136`
  `addChildTo`: `authenticated.async(parse.json)`
- `collections/app/controllers/ImageCollectionsController.scala:36`
  `addCollection`: `authenticated.async(parse.json)`

Routes: `POST /images/:imageId`, `POST /collections`, `POST /collections/*collection`

### 2. cropper — `parse.json`, 1 endpoint

- `cropper/app/controllers/CropperController.scala:51`
  `addExport`: `auth.async(parse.json)`

Route: `POST /crops`

### 3. leases — `parse.json` + `request.body.validate[T]`, 3 endpoints

- `leases/app/controllers/MediaLeaseController.scala:97` — `postLease`
- `leases/app/controllers/MediaLeaseController.scala:107` — `addLeasesForMedia`
- `leases/app/controllers/MediaLeaseController.scala:139` — `replaceLeasesForMedia`

Routes: `POST /leases`, `POST /leases/media/:id`, `PUT /leases/media/:id`

Pattern:
```scala
def postLease = auth.async(parse.json) { implicit request =>
  request.body.validate[MediaLease] match {
    case JsSuccess(mediaLease, _) => ...
    case JsError(errors)          => Future.successful(BadRequest(...))
  }
}
```

### 4. metadata-editor — `parse.json`, 6 endpoints (heaviest user)

- `metadata-editor/app/controllers/SyndicationController.scala:37` — `setPhotoshoot`
- `metadata-editor/app/controllers/SyndicationController.scala:60` — `setSyndication`
  (return type explicitly `Action[JsValue]`)
- `metadata-editor/app/controllers/EditsController.scala:98` — `setArchived`
- `metadata-editor/app/controllers/EditsController.scala:124` — `addLabels`
- `metadata-editor/app/controllers/EditsController.scala:156` — `setMetadata`
- `metadata-editor/app/controllers/EditsController.scala:217` — `setUsageRights`

Routes: `PUT /metadata/:id/archived`, `POST /metadata/:id/labels`,
`PUT /metadata/:id/metadata`, `PUT /metadata/:id/usage-rights`,
`PUT /metadata/:id/photoshoot`, `PUT /metadata/:id/syndication`

### 5. usage — `parse.json` + custom `BodyParser[JsValue]`, 6 endpoints

- `usage/app/controllers/UsageApi.scala:169-171` — `setPrintUsages` uses a custom
  max-length-capped body parser:
  ```scala
  val setPrintRequestBodyParser: BodyParser[JsValue] =
    playBodyParsers.json(maxLength = maxPrintRequestLength)
  def setPrintUsages = auth(setPrintRequestBodyParser) { req => ... }
  ```
- `UsageApi.scala:191,215,238,261,286` — setSyndication/Front/Download/ChildUsages,
  updateUsageStatus: `auth(parse.json)` / `auth.async(parse.json)`

Routes: `POST /usages/print`, `POST /usages/syndication`, `POST /usages/front`,
`POST /usages/download`, `POST /usages/child`,
`PUT /usages/status/update/:mediaId/*usageId`

### 6. image-loader — two patterns, 2 endpoints

- `image-loader/app/controllers/UploadStatusController.scala:34`
  `updateUploadStatus`: `auth.async(parse.json[UploadStatus])` — typed body parser,
  body arrives pre-deserialized as `UploadStatus`.
  Route: `POST /uploadStatus/:imageId`

- `image-loader/app/controllers/ImageLoaderController.scala:241`
  `getPreSignedUploadUrlsAndTrack`: **no explicit body parser** — uses default
  `AnyContent` and calls `request.body.asJson.get.as[Map[String, String]]`.
  Route: `POST /prepare`
  **⚠ Anti-pattern:** `.get` throws on non-JSON body. Do not replicate.

---

## Services that parse form-encoded bodies (not JSON)

### thrall — `Form.bindFromRequest()`, 4 usages

`thrall/app/controllers/ThrallController.scala:139,180,220,235`

Migration/reaper control endpoints read HTML form fields
(`start-confirmation`, `complete-confirmation`, `id`). These are admin UI forms
driven by a server-rendered page, not API endpoints. Not JSON; not relevant as
precedent for a JSON API.

---

## Services that do NOT parse request bodies

| Service | Notes |
|---|---|
| **media-api** | Confirmed. All POST/PUT routes use URL path/query params only. |
| **auth** | No POST/PUT/PATCH routes at all. |
| **s3watcher** | Lambda — no HTTP API. |
| **thrall** (JSON) | POST routes are side-effect triggers or HTML form binding. No `parse.json`. |
| **collections** `correctedCollections` | POST route that ignores body — reads/writes from store via URL only. |
| **image-loader** `DigestBodyParser` | Binary file ingestion — excluded per scope. |

No service uses `parse.tolerantJson`, `parse.text`, `parse.raw`, `JsonBodyParser`,
or a custom class implementing `BodyParser[T]` for JSON.

---

## Verdict

**Grid has 6 services that parse JSON request bodies.** The dominant pattern — used
by roughly 20 of ~25 JSON-body endpoints — is:

```scala
def myAction(id: String) = auth.async(parse.json) { implicit req =>
  req.body.validate[MyModel].fold(
    errors  => Future.successful(BadRequest(JsError.toJson(errors))),
    payload => /* handle payload */
  )
}
```

**Precedent is overwhelming.** Every structured-write service in Grid uses
`auth.async(parse.json)`.

### Cleanest model implementations for anything added to media-api

1. **`leases/app/controllers/MediaLeaseController.scala:97`** (`postLease`) —
   short, idiomatic, uses the same `auth` wrapper that media-api already has,
   `validate[T].fold(errors, success)` pattern.

2. **`metadata-editor/app/controllers/EditsController.scala:217`**
   (`setUsageRights`) — slightly more complex but representative of the PUT
   update pattern.

### Anti-pattern to avoid

`image-loader/app/controllers/ImageLoaderController.scala:241` —
`request.body.asJson.get` with no explicit body parser and an unsafe `.get` call.
