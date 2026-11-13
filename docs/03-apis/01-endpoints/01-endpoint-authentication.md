# Endpoint authentication and permissions

This inventory covers the Play HTTP services in `../../../build.sbt`: `auth`, `collections`, `cropper`, `image-loader`, `kahuna`, `leases`, `media-api`, `metadata-editor`, `thrall`, and `usage`. It records the route and the authentication/authorization applied by the endpoint itself; downstream services may apply additional checks.

## How to read this inventory

- **Authenticated** means the action uses the shared `Authentication` action builder (`auth`, `authenticated`, or an equivalent login-redirect wrapper). It accepts a valid signed inner-service request, an API key in `X-Gu-Media-Key`, or a Panda user session. Authentication tries those providers in that order.
- **Unauthenticated** means no authentication wrapper is apparent on the route/action. Shared Play filters such as CSRF and request logging are not endpoint permissions.
- **Permission** names refer to Grid permissions in `rest-lib/.../auth/Permissions.scala`. For user principals, the Guardian provider maps them to `grid_access`, `upload_images`, `edit_metadata`, `delete_image`, `delete_crops_or_usages`, `show_paid`, and `pinboard`.
- API-key tiers are enforced centrally during authentication, not by a separate permission on each route: `Internal` permits any method/path; `ReadOnly` permits `GET`; `Syndication` permits `GET` only when the host is the configured API host and the path starts with `/images`. Inner-service principals and internal-tier keys bypass the fine-grained permission checks. `UploadImages` is always allowed unless `enforceUploadImagesPermission` is enabled; `ArchiveImages` is currently always allowed by the Guardian provider.
- “No additional permission” means no endpoint-specific named permission was found; it does not mean the endpoint is public if it is marked **Authenticated**.

## `auth`

| Method and path | Action | Authentication | Permission / additional check |
|---|---|---|---|
| `GET /` | `AuthController.index` | Authenticated | None |
| `GET /login` | `AuthController.doLogin` | Unauthenticated | None; starts user login |
| `GET /oauthCallback` | `AuthController.oauthCallback` | Unauthenticated | None; completes user login |
| `GET /logout` | `AuthController.logout` | Unauthenticated | None; clears the user session |
| `GET /session` | `AuthController.session` | Authenticated | Reports permission-derived capabilities; does not gate the endpoint on them |
| `GET /cookieMonster` | `AuthController.cookieMonster` | Authenticated | None |

## `collections`

All application routes below use `authenticated`; no named permission or role gate was found.

| Method and path | Action |
|---|---|
| `GET /` | `CollectionsController.index` |
| `GET /images/:imageId` | `ImageCollectionsController.getCollections` |
| `POST /images/:imageId` | `ImageCollectionsController.addCollection` |
| `DELETE /images/:imageId/*collection` | `ImageCollectionsController.removeCollection` |
| `GET /collections` | `CollectionsController.getCollections` |
| `GET /collections/*collection` | `CollectionsController.getCollection` |
| `POST /collections` | `CollectionsController.addChildToRoot` |
| `POST /collections/*collection` | `CollectionsController.addChildToCollection` |
| `DELETE /collections/*collection` | `CollectionsController.removeCollection` |
| `POST /corrected-collections` | `CollectionsController.correctedCollections` |

## `cropper`

| Method and path | Action | Authentication | Permission / additional check |
|---|---|---|---|
| `GET /` | `CropperController.index` | Authenticated | None |
| `POST /crops` | `CropperController.addExport` | Authenticated | None |
| `GET /crops/:id` | `CropperController.getCrops` | Authenticated | The response includes the delete action only when `DeleteCropsOrUsages` is allowed |
| `DELETE /crops/:id` | `CropperController.deleteCrops` | Authenticated | `DeleteCropsOrUsages` |

## `image-loader`

| Method and path | Action | Authentication | Permission / additional check |
|---|---|---|---|
| `GET /` | `ImageLoaderController.index` | Authenticated | `UploadImages` |
| `POST /prepare` | `ImageLoaderController.getPreSignedUploadUrlsAndTrack` | Authenticated | `UploadImages` |
| `POST /images` | `ImageLoaderController.loadImage` | Authenticated | `UploadImages` |
| `POST /enqueueDerivativeImage` | `ImageLoaderController.enqueueDerivativeImage` | Authenticated | `UploadImages` |
| `POST /images/restore` | `ImageLoaderController.restoreFromReplica` | Authenticated | `UploadImages` |
| `GET /images/project/:imageId` | `ImageLoaderController.projectImageBy` | Authenticated | None |
| `GET /uploadStatus/:imageId` | `UploadStatusController.getUploadStatus` | Authenticated | None |
| `POST /uploadStatus/:imageId` | `UploadStatusController.updateUploadStatus` | Authenticated | `UploadImages` |
| `GET /uploadStatuses` | `UploadStatusController.getCurrentUserUploads` | Authenticated | Returns the current principal's uploads |
| `GET /uploadStatuses/:userId` | `UploadStatusController.getUploadsBy` | Authenticated | User ID must match the authenticated principal's identity; otherwise `403` |

## `kahuna`

| Method and path | Action | Authentication | Permission / additional check |
|---|---|---|---|
| `GET /` | `KahunaController.index` | Optional-login wrapper | No endpoint permission gate; configured scripts are filtered by their permissions |
| `GET /images/:id` | `KahunaController.index` | Optional-login wrapper | Same as `GET /` |
| `GET /images/:id/crop` | `KahunaController.index` | Optional-login wrapper | Same as `GET /` |
| `GET /images/:id/takedown` | `KahunaController.index` | Optional-login wrapper | Same as `GET /` |
| `GET /search` | `KahunaController.index` | Optional-login wrapper | Same as `GET /` |
| `GET /upload` | `KahunaController.index` | Optional-login wrapper | Same as `GET /` |
| `GET /quotas` | `KahunaController.quotas` | Authenticated | None |
| `GET /notifications` | `KahunaController.notifications` | Authenticated | None |
| `GET /ok` | `KahunaController.ok` | Unauthenticated | None |
| `GET /assets/*file` | `Assets.versioned` | Unauthenticated | None |

The optional-login wrapper may redirect to login when a login link is configured; when login is disabled, it can render without a principal. Script permission filtering controls the UI payload, not access to the page or the underlying APIs.

## `leases`

All application routes use `auth`; no named permission or role gate was found.

| Method and path | Action |
|---|---|
| `GET /` | `MediaLeaseController.index` |
| `GET /leases/media/:id` | `MediaLeaseController.getLeasesForMedia` |
| `DELETE /leases/media/:id` | `MediaLeaseController.deleteLeasesForMedia` |
| `PUT /leases/media/:id` | `MediaLeaseController.replaceLeasesForMedia` |
| `POST /leases/media/:id` | `MediaLeaseController.addLeasesForMedia` |
| `GET /leases/reindex` | `MediaLeaseController.reindex` |
| `GET /leases/:id` | `MediaLeaseController.getLease` |
| `DELETE /leases/:id` | `MediaLeaseController.deleteLease` |
| `POST /leases` | `MediaLeaseController.postLease` |

## `media-api`

All application routes use `auth` except `GET /configuration/crop-variations`, which is deliberately unauthenticated because its contents are not sensitive. Unless noted, no named permission gate is applied to the endpoint itself.

| Method and path | Action | Permission / additional check |
|---|---|---|
| `GET /` | `MediaApi.index` | `UploadImages` and `ArchiveImages` determine whether related links are included; do not gate the endpoint |
| `GET /images/metadata/:field` | `SuggestionController.metadataSearch` | None |
| `GET /images/edits/:field` | `SuggestionController.editsSearch` | None |
| `GET /images/:id/softDeletedMetadata` | `MediaApi.getSoftDeletedMetadata` | None |
| `GET /images/aggregations/date/:field` | `AggregationController.dateHistogram` | None |
| `GET /images/:id` | `MediaApi.getImage` | Syndication-tier image visibility rules apply |
| `GET /capiUsages/:id` | `MediaApi.getCapiUsages` | None |
| `GET /images/:id/_elasticsearch` | `MediaApi.getImageFromElasticSearch` | Syndication-tier image visibility rules apply |
| `GET /images/:id/projection/diff` | `MediaApi.diffProjection` | Syndication-tier image visibility rules apply |
| `GET /images/:id/fileMetadata` | `MediaApi.getImageFileMetadata` | Syndication-tier image visibility rules apply |
| `GET /images/:imageId/uploadedBy` | `MediaApi.uploadedBy` | None |
| `GET /images/:imageId/export` | `MediaApi.getImageExports` | Syndication-tier image visibility rules apply |
| `GET /images/:imageId/export/:exportId` | `MediaApi.getImageExport` | Syndication-tier image visibility rules apply |
| `GET /images/:imageId/export/:exportId/asset/:width/download` | `MediaApi.downloadImageExport` | Syndication-tier image visibility rules apply |
| `GET /images/:imageId/download` | `MediaApi.downloadOriginalImage` | Syndication-tier image visibility rules apply |
| `GET /images/:imageId/downloadOptimised` | `MediaApi.downloadOptimisedImage` | Syndication-tier image visibility rules apply |
| `POST /images/:id/:partnerName/:startPending/syndicateImage` | `MediaApi.syndicateImage` | Syndication-tier keys cannot call this POST; image visibility rules apply |
| `DELETE /images/:id` | `MediaApi.deleteImage` | `DeleteImage` or the image's uploader; image must also be deletable |
| `DELETE /images/:id/hard-delete` | `MediaApi.hardDeleteImage` | `DeleteImage` or the image's uploader; image must also be deletable |
| `PUT /images/:id/undelete` | `MediaApi.unSoftDeleteImage` | `DeleteImage` or uploader; reaped-image handling can also permit undelete |
| `GET /images` | `MediaApi.imageSearch` | Deleted-image search scope and returned edit/delete actions use `DeleteImage`, `EditMetadata`, and `DeleteCropsOrUsages`; syndication-tier results are restricted |
| `GET /suggest/metadata/credit` | `SuggestionController.suggestMetadataCredit` | None |
| `GET /suggest/metadata/photoshoot` | `SuggestionController.suggestPhotoshoot` | None |
| `GET /usage/suppliers` | `UsageController.bySupplier` | None |
| `GET /usage/suppliers/:id` | `UsageController.forSupplier` | None |
| `GET /usage/suppliers/:id/images` | `UsageController.imageUsagesBySupplier` | None |
| `GET /usage/suppliers/:id/quotaCount` | `UsageController.quotaCountForSupplier` | None |
| `GET /usage/quotas` | `UsageController.quotas` | None |
| `GET /usage/quotas/:id` | `UsageController.quotaForImage` | None |
| `GET /configuration/crop-variations` | `ConfigurationController.cropVariations` | Unauthenticated; no permission gate |

The syndication visibility check returns image-not-found behavior for inaccessible images; it is separate from the API-key tier's host/path/method restriction.

## `metadata-editor`

All routes use `auth`. Unless noted, no named permission gate is applied to the endpoint itself.

| Method and path | Action | Permission / additional check |
|---|---|---|
| `GET /` | `EditsApi.index` | None |
| `GET /usage-rights/categories` | `EditsApi.getUsageRights` | None |
| `GET /usage-rights/filtered-categories` | `EditsApi.getFilteredUsageRights` | Results are filtered by `EditMetadata` or uploader status; endpoint remains authenticated-only |
| `GET /metadata/:id` | `EditsController.getAllMetadata` | None |
| `GET /edits/:id` | `EditsController.getEdits` | None |
| `GET /metadata/:id/archived` | `EditsController.getArchived` | None |
| `PUT /metadata/:id/archived` | `EditsController.setArchived` | `ArchiveImages` |
| `DELETE /metadata/:id/archived` | `EditsController.unsetArchived` | None |
| `GET /metadata/:id/labels` | `EditsController.getLabels` | None |
| `POST /metadata/:id/labels` | `EditsController.addLabels` | None |
| `DELETE /metadata/:id/labels/*label` | `EditsController.removeLabel` | None |
| `GET /metadata/:id/metadata` | `EditsController.getMetadata` | None |
| `PUT /metadata/:id/metadata` | `EditsController.setMetadata` | `EditMetadata` or the image's uploader |
| `POST /metadata/:id/metadata/set-from-usage-rights` | `EditsController.setMetadataFromUsageRights` | `EditMetadata` or the image's uploader |
| `GET /metadata/:id/usage-rights` | `EditsController.getUsageRights` | None |
| `PUT /metadata/:id/usage-rights` | `EditsController.setUsageRights` | None |
| `DELETE /metadata/:id/usage-rights` | `EditsController.deleteUsageRights` | None |
| `GET /metadata/:id/photoshoot` | `SyndicationController.getPhotoshoot` | None |
| `PUT /metadata/:id/photoshoot` | `SyndicationController.setPhotoshoot` | `EditMetadata` |
| `DELETE /metadata/:id/photoshoot` | `SyndicationController.deletePhotoshoot` | `EditMetadata` |
| `GET /metadata/:id/syndication` | `SyndicationController.getSyndication` | None |
| `PUT /metadata/:id/syndication` | `SyndicationController.setSyndication` | `EditMetadata` |
| `DELETE /metadata/:id/syndication` | `SyndicationController.deleteSyndication` | `EditMetadata` |

## `thrall`

Application routes use the login-redirect wrapper or `auth`; no named permission is applied except to batch reaping. Login-redirect actions require an authenticated principal when login is available/configured.

| Method and path | Action | Authentication | Permission / additional check |
|---|---|---|---|
| `GET /` | `ThrallController.index` | Login redirect | None |
| `GET /upsertProject` | `ThrallController.upsertProjectPage` | Login redirect | None |
| `GET /restoreFromReplica` | `ThrallController.restoreFromReplica` | Login redirect | None |
| `GET /migrationFailuresOverview` | `ThrallController.migrationFailuresOverview` | Login redirect | None |
| `GET /migrationFailures` | `ThrallController.migrationFailures` | Login redirect | None |
| `POST /migrationFailures/reattempt` | `ThrallController.reattemptMigrationFailures` | Login redirect | None |
| `POST /startMigration` | `ThrallController.startMigration` | Login redirect | None |
| `POST /pauseMigration` | `ThrallController.pauseMigration` | Login redirect | None |
| `POST /resumeMigration` | `ThrallController.resumeMigration` | Login redirect | None |
| `POST /migrate` | `ThrallController.migrateSingleImage` | Login redirect | None |
| `POST /upsertProject` | `ThrallController.upsertFromProjectionSingleImage` | Login redirect | None |
| `POST /completeMigration` | `ThrallController.completeMigration` | Login redirect | None |
| `POST /previewMigrationCompletion` | `ThrallController.previewMigrationCompletion` | Login redirect | None |
| `POST /unPreviewMigrationCompletion` | `ThrallController.unPreviewMigrationCompletion` | Login redirect | None |
| `GET /reaper` | `ReaperController.index` | Login redirect | None |
| `GET /reaper/:key` | `ReaperController.reaperRecord` | Authenticated | None |
| `DELETE /doBatchSoftReap` | `ReaperController.doBatchSoftReap` | Authenticated | `DeleteImage` |
| `DELETE /doBatchHardReap` | `ReaperController.doBatchHardReap` | Authenticated | `DeleteImage` |
| `POST /pauseReaper` | `ReaperController.pauseReaper` | Authenticated | None |
| `POST /resumeReaper` | `ReaperController.resumeReaper` | Authenticated | None |

## `usage`

All routes use `auth`. No named permission gate was found except where specified.

| Method and path | Action | Permission / additional check |
|---|---|---|
| `GET /` | `UsageApi.index` | None |
| `GET /usages/:id` | `UsageApi.forUsage` | None |
| `GET /usages/media/:mediaId` | `UsageApi.forMedia` | None |
| `DELETE /usages/media/:mediaId` | `UsageApi.deleteUsages` | `DeleteCropsOrUsages` |
| `DELETE /usages/media/:mediaId/*usageId` | `UsageApi.deleteSingleUsage` | `DeleteCropsOrUsages` |
| `POST /usages/media/:mediaId/delete` | `UsageApi.deleteUsagesByIds` | `DeleteCropsOrUsages` |
| `POST /usages/print` | `UsageApi.setPrintUsages` | None |
| `POST /usages/syndication` | `UsageApi.setSyndicationUsages` | None |
| `POST /usages/front` | `UsageApi.setFrontUsages` | None |
| `POST /usages/download` | `UsageApi.setDownloadUsages` | None |
| `POST /usages/child` | `UsageApi.setChildUsages` | None |
| `PUT /usages/status/update/:mediaId/*usageId` | `UsageApi.updateUsageStatus` | `DeleteCropsOrUsages` |
| `GET /usages/digital/content/*contentId/reindex` | `UsageApi.reindexForContent` | None |

## Shared management routes

These are also endpoints and are listed separately to avoid repeating the same route rows in every service section.

| Service(s) | Method and path | Authentication | Permission / additional check |
|---|---|---|---|
| All ten services | `GET /management/healthcheck` | Unauthenticated | None |
| All ten services | `GET /management/manifest` | Unauthenticated | None |
| All ten services | `GET /management/whoAmI` | Authenticated | No named permission |
| All ten services | `GET /robots.txt` | Unauthenticated | None |
| `media-api` | `GET /management/imageCounts` | Unauthenticated | None |
| `thrall` | `GET /management/innerServiceStatusCheck` | Authenticated | No named permission |
| `thrall` | `GET /assets/*file` | Unauthenticated | None |

The `auth` service's management health check is the standard management action; `media-api` uses an Elasticsearch health check, and `thrall` uses its own health-check action. These do not change the route's authentication status.

### Raw Play `Action` sweep

I checked the service controller sources for direct Play `Action`/`Action.async` construction. These actions do not use the shared `auth` builder, except where a helper such as `withLoginRedirect` explicitly performs authentication internally. The unauthenticated application endpoints found by this sweep are:

| Service | Method and path | Action | Source |
|---|---|---|---|
| `auth` | `GET /login` | `AuthController.doLogin` | `auth/app/auth/AuthController.scala` |
| `auth` | `GET /oauthCallback` | `AuthController.oauthCallback` | `auth/app/auth/AuthController.scala` |
| `auth` | `GET /logout` | `AuthController.logout` | `auth/app/auth/AuthController.scala` |
| `kahuna` | `GET /ok` | `KahunaController.ok` | `kahuna/app/controllers/KahunaController.scala` |
| `media-api` | `GET /configuration/crop-variations` | `ConfigurationController.cropVariations` | `media-api/app/controllers/ConfigurationController.scala` |

The other direct `Action` declarations found are the unauthenticated management endpoints in the shared-route table above, plus `Kahuna` and `Thrall` static assets. `whoAmI` and `statusCheck` in `InnerServiceStatusCheckController` use `auth.async`; they are authenticated even though the source file contains `Action`-related types elsewhere.

## Projects without Play HTTP routes

The root build also includes libraries, scripts, and event-driven Lambda projects (for example `common-lib`, `rest-lib`, `scripts`, `image-counter-lambda`, `image-embedder-lambda`, and `image-cache-purger`). They do not define Play `conf/routes` files, so they have no Grid HTTP routes to list here. The optional `bbc` project likewise has no `conf/routes` file in this checkout.

## Source map

Routes are declared in each service's `conf/routes`. Authentication and authorization behavior is implemented in:

- `../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authentication.scala`
- `../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Authorisation.scala`
- `../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/Permissions.scala`
- `../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/auth/provider/ApiKeyAuthenticationProvider.scala`
- `../../../rest-lib/src/main/scala/com/gu/mediaservice/lib/guardian/auth/PermissionsAuthorisationProvider.scala`
- `../../../common-lib/src/main/scala/com/gu/mediaservice/lib/auth/ApiAccessor.scala`
