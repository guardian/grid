# Mutating endpoints without a named permission gate

This inventory lists `POST`, `PUT`, and `DELETE` routes that change stored data, enqueue work, or change service state without an endpoint-level fine-grained Grid permission check. They still require the authentication noted below; this does **not** mean they are publicly accessible.

API-key tiers also apply centrally: `ReadOnly` keys cannot call these non-GET routes, and `Syndication` keys are restricted to eligible `GET /images...` routes. Internal keys and authenticated user/inner-service principals may pass authentication without a named permission gate.

Routes that do have a named permission gate (for example `UploadImages`, `DeleteImage`, `DeleteCropsOrUsages`, or `EditMetadata`) are intentionally not included. `ArchiveImages` is checked on its route, but the current Guardian provider allows it unconditionally.

| Service | Method and path | Authentication | What the endpoint changes |
|---|---|---|---|
| `collections` | `POST /images/:imageId` | Authenticated | Adds a collection path to an image's collection assignments and publishes an image-collections update. |
| `collections` | `DELETE /images/:imageId/*collection` | Authenticated | Removes the specified collection assignment from an image and publishes the updated assignments. |
| `collections` | `POST /collections` | Authenticated | Creates a child collection under the root. |
| `collections` | `POST /collections/*collection` | Authenticated | Creates a child collection under the specified collection. |
| `collections` | `DELETE /collections/*collection` | Authenticated | Removes a collection that has no children. |
| `collections` | `POST /corrected-collections` | Authenticated | Rewrites stored collection paths to match the paths derived from the collection hierarchy. |
| `cropper` | `POST /crops` | Authenticated | Generates and stores a crop/export for an image and publishes an image-exports update. |
| `leases` | `POST /leases` | Authenticated | Creates a media lease from the submitted lease data. |
| `leases` | `POST /leases/media/:id` | Authenticated | Adds the submitted leases to the specified image. |
| `leases` | `PUT /leases/media/:id` | Authenticated | Replaces the specified image's leases with the submitted list. |
| `leases` | `DELETE /leases/media/:id` | Authenticated | Removes all leases associated with the specified image. |
| `leases` | `DELETE /leases/:id` | Authenticated | Removes the lease with the specified ID. |
| `media-api` | `POST /images/:id/:partnerName/:startPending/syndicateImage` | Authenticated | Records a syndication usage for the image, partner, and pending status by posting to the Usage service. |
| `metadata-editor` | `DELETE /metadata/:id/archived` | Authenticated | Removes the image's archived override and publishes a metadata update. |
| `metadata-editor` | `POST /metadata/:id/labels` | Authenticated | Adds the submitted labels to the image and publishes a metadata update. |
| `metadata-editor` | `DELETE /metadata/:id/labels/*label` | Authenticated | Removes the specified label from the image and publishes a metadata update. |
| `metadata-editor` | `PUT /metadata/:id/usage-rights` | Authenticated | Creates or replaces the image's usage-rights override and publishes a metadata update. |
| `metadata-editor` | `DELETE /metadata/:id/usage-rights` | Authenticated | Removes the image's usage-rights override and publishes a metadata update. |
| `thrall` | `POST /migrationFailures/reattempt` | Login redirect | Requeues migration failures on the selected page for reattempt, if a migration is running. |
| `thrall` | `POST /startMigration` | Login redirect | Starts a migration by requesting creation of a migration index; requires the `start` confirmation field. |
| `thrall` | `POST /pauseMigration` | Login redirect | Pauses the current migration. |
| `thrall` | `POST /resumeMigration` | Login redirect | Resumes the current migration. |
| `thrall` | `POST /migrate` | Login redirect | Queues migration of the submitted image ID. |
| `thrall` | `POST /upsertProject` | Login redirect | Fetches the image-loader projection for the submitted image ID and queues an upsert. |
| `thrall` | `POST /completeMigration` | Login redirect | Requests completion of the running migration; requires the `complete` confirmation field. |
| `thrall` | `POST /previewMigrationCompletion` | Login redirect | Enables migration-completion preview mode. |
| `thrall` | `POST /unPreviewMigrationCompletion` | Login redirect | Disables migration-completion preview mode. |
| `thrall` | `POST /pauseReaper` | Authenticated | Creates the reaper pause control file so scheduled reaping is paused. |
| `thrall` | `POST /resumeReaper` | Authenticated | Removes the reaper pause control file so scheduled reaping can resume. |
| `usage` | `POST /usages/print` | Authenticated | Records print usages from the submitted batch of print-usage records. |
| `usage` | `POST /usages/syndication` | Authenticated | Records the submitted syndication usage. |
| `usage` | `POST /usages/front` | Authenticated | Records the submitted front usage. |
| `usage` | `POST /usages/download` | Authenticated | Records the submitted download usage. |
| `usage` | `POST /usages/child` | Authenticated | Records the submitted child-image usage. |
