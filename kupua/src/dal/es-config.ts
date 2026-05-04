/**
 * Elasticsearch connection configuration.
 *
 * All values come from environment variables (set via `.env` or shell).
 * Vite exposes env vars prefixed with VITE_ to client code.
 *
 * Defaults point at kupua's local docker ES (port 9220, index "images").
 * To connect to a real ES cluster (e.g. TEST via SSH tunnel), set:
 *
 *   VITE_ES_BASE=/es           # Vite proxy path (the proxy target is set in vite.config.ts)
 *   VITE_ES_INDEX=images       # or the real alias, e.g. "images_current"
 *
 * The actual ES URL is configured in vite.config.ts as a proxy target
 * (KUPUA_ES_URL env var, defaults to http://localhost:9220).
 * This keeps credentials and URLs out of client-side code.
 *
 * See kupua/exploration/docs/infra-safeguards.md for safety documentation.
 */

/** Vite proxy path for ES requests. */
export const ES_BASE = import.meta.env.VITE_ES_BASE ?? "/es";

/** ES index or alias to query. */
export const ES_INDEX = import.meta.env.VITE_ES_INDEX ?? "images";

/**
 * _source fields to exclude from search responses.
 *
 * Now empty — we use SOURCE_INCLUDES (whitelist) instead.
 * Kept as an export so es-adapter.ts doesn't need a code change.
 */
export const SOURCE_EXCLUDES: string[] = [];

/**
 * _source fields to explicitly include in search responses (whitelist).
 *
 * Only these fields are returned from ES. Everything else — the bulk of
 * fileMetadata (EXIF, XMP sub-fields, Getty), embedding (1024-dim vector),
 * usages, exports, leases, originalMetadata, originalUsageRights,
 * collections, softDeletedMetadata, identifiers, userMetadata — is
 * excluded implicitly.
 *
 * Reduces response payload from ~1.5MB to ~250KB raw (~65KB gzip) for 200
 * hits. See perceived-perf-phase-2-handoff.md §Measurement results.
 *
 * Tier 1 — grid density (thumbnail + overlay):
 *   id, uploadTime, lastModified, metadata.description, metadata.title,
 *   metadata.byline, metadata.credit, metadata.dateTaken
 *
 * Tier 2 — table density (extra columns):
 *   metadata.imageType, metadata.copyright, metadata.source,
 *   metadata.specialInstructions, metadata.subjects,
 *   metadata.peopleInImage, metadata.subLocation, metadata.city,
 *   metadata.state, metadata.country, uploadedBy, uploadInfo.filename,
 *   source.dimensions, source.orientedDimensions, usageRights.category
 *
 * Tier 3 — detail panel, hidden table columns, imgproxy rotation:
 *   metadata.suppliersReference, metadata.bylineTitle, metadata.keywords,
 *   source.size, source.mimeType, source.orientationMetadata,
 *   fileMetadata.colourModel, fileMetadata.colourModelInformation,
 *   fileMetadata.iptc.Edit Status, fileMetadata.icc.Profile Description,
 *   fileMetadata.xmp.Iptc4xmpExt:DigitalSourceType,
 *   fileMetadata.xmp.Iptc4xmpCore:Scene
 */
export const SOURCE_INCLUDES = [
  // Tier 1 — grid
  "id",
  "uploadTime",
  "lastModified",
  "metadata.description",
  "metadata.title",
  "metadata.byline",
  "metadata.credit",
  "metadata.dateTaken",
  // Tier 2 — table
  "metadata.imageType",
  "metadata.copyright",
  "metadata.source",
  "metadata.specialInstructions",
  "metadata.subjects",
  "metadata.peopleInImage",
  "metadata.subLocation",
  "metadata.city",
  "metadata.state",
  "metadata.country",
  "uploadedBy",
  "uploadInfo.filename",
  "source.dimensions",
  "source.orientedDimensions",
  "usageRights.category",
  // Tier 3 — detail panel, hidden table columns, imgproxy
  "metadata.suppliersReference",
  "metadata.bylineTitle",
  "metadata.keywords",
  "userMetadata.labels",
  "source.size",
  "source.mimeType",
  "source.orientationMetadata",
  "fileMetadata.colourModel",
  "fileMetadata.colourModelInformation",
  "fileMetadata.iptc.Edit Status",
  "fileMetadata.icc.Profile Description",
  "fileMetadata.xmp.Iptc4xmpExt:DigitalSourceType",
  "fileMetadata.xmp.Iptc4xmpCore:Scene",
];

/**
 * Allowed ES API paths (for write protection).
 *
 * When connected to a non-local ES (e.g. TEST via tunnel), only these
 * paths are permitted. Any request to a path not in this list is blocked
 * at the adapter level.
 *
 * This is a safeguard against accidentally issuing write operations
 * (index, delete, bulk, etc.) against a shared cluster.
 */
export const ALLOWED_ES_PATHS = ["_search", "_count", "_cat/aliases", "_pit", "_mget"];

/**
 * Allowed HTTP methods for ES requests.
 *
 * DELETE is further restricted to _pit paths only (closing a PIT snapshot).
 * No other ES endpoint should ever receive a DELETE, PUT, or PATCH.
 */
export const ALLOWED_ES_METHODS = new Set(["GET", "POST", "DELETE"]);

/**
 * Whether the current ES target is "local" (kupua's own docker instance).
 *
 * When local, write protection is disabled (load-sample-data.sh needs to
 * write). When non-local, only read operations are allowed.
 *
 * Detection: if the proxy target URL contains port 9220, it's local.
 * This is evaluated at build time via the KUPUA_ES_URL env var.
 */
export const IS_LOCAL_ES =
  (import.meta.env.VITE_ES_IS_LOCAL ?? "true") === "true";

