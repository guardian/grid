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
 * Heavy _source fields to exclude from search responses.
 *
 * These fields are large (EXIF, XMP, ICC profiles, Getty metadata) and
 * aren't displayed in table columns. Excluding them reduces response
 * size from ~50-100KB/doc to ~5-10KB/doc — critical when querying a
 * real cluster with 9M documents.
 *
 * The fields we DO need from fileMetadata are:
 *   - fileMetadata.colourModel
 *   - fileMetadata.colourModelInformation.hasAlpha
 *   - fileMetadata.colourModelInformation.bitsPerSample
 *   - fileMetadata.iptc.Edit Status
 *   - fileMetadata.icc.Profile Description
 *   - fileMetadata.xmp.Iptc4xmpExt:DigitalSourceType
 *   - fileMetadata.xmp.Iptc4xmpCore:Scene
 *
 * So we exclude the heavy parent objects and include specific sub-paths.
 * ES _source filtering supports wildcards and include/exclude together.
 */
export const SOURCE_EXCLUDES = [
  "fileMetadata.exif",
  "fileMetadata.exifSub",
  "fileMetadata.getty",
  // We need specific fields from iptc, icc, xmp — but the rest is noise.
  // Rather than excluding individual iptc/icc/xmp sub-fields, we use
  // include + exclude together in the search request.
  "embedding", // 1024-dim float vector — never displayed
];

/**
 * _source fields to explicitly include.
 *
 * When set, only these fields (plus any not excluded) are returned.
 * Using includes is more precise but risks missing new fields.
 * We use excludes (above) as the primary filter and only add includes
 * if we need further trimming.
 *
 * For now, this is empty — we rely on excludes only.
 */
export const SOURCE_INCLUDES: string[] = [];

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
export const ALLOWED_ES_PATHS = ["_search", "_count", "_cat/aliases", "_pit"];

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

