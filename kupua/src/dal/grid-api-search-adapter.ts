/**
 * Request mapping and transport for media-api's image reads
 * (POST /images/search-after, /window, /rank, /sort-profile, /keys; GET /images/:id).
 *
 * Used by ApiDataSource when VITE_USE_MEDIA_API=true.
 */

import type { Image } from "@/types/image";
import type { ImageByIdResult, SearchAfterResult, SearchParams, SortValues } from "./types";
import { buildSortClause } from "./adapters/elasticsearch/sort-builders";
import { type EnrichmentFields } from "@/stores/enrichment-store";
import { unwrapEntity } from "./grid-api/argo";
import type { ImageData } from "./grid-api/types";

type ImagePageResponse = {
  data: Array<{ data?: unknown; actions?: unknown }>;
  sortValues: SortValues[];
  pitId?: string | null;
};

type SearchAfterApiResponse = ImagePageResponse & { total: number };

type ImageWindowApiResponse = ImagePageResponse & { total?: number; offset: number; rawHitCount: number };

/**
 * Maps the API image response (ImageData with Argo-wrapped fields) to the
 * flat Image format that the store and UI expect (matching the ES _source shape).
 *
 * Key differences:
 *   API usages: EmbeddedEntity<EmbeddedEntity<Usage>[]>  →  Image usages: Usage[]
 *   API leases: EmbeddedEntity<LeasesByMedia>            →  Image leases: { leases? }
 *   API collections: EmbeddedEntity<CollectionResponse>[] → Image collections: Collection[]
 */
function mapApiImageToImage(raw: unknown): Image {
  const d = raw as ImageData;
  const edits = d.userMetadata && unwrapEntity(d.userMetadata);
  const userMetadata = edits ? {
    archived: unwrapEntity(edits.archived) ?? undefined,
    labels: unwrapEntity(edits.labels)?.map((label) => unwrapEntity(label)) ?? undefined,
    metadata: unwrapEntity(edits.metadata) ?? undefined,
    usageRights: unwrapEntity(edits.usageRights) ?? undefined,
    photoshoot: unwrapEntity(edits.photoshoot) ?? undefined,
    lastModified: edits.lastModified,
  } : undefined;
  const fileMetadata = d.fileMetadata ? unwrapEntity(d.fileMetadata) ?? undefined : undefined;

  // usages: unwrap doubly-nested Argo entity
  const usagesEntity = d.usages as { data?: Array<{ data?: unknown }> } | undefined;
  const usages = usagesEntity?.data?.map((u) => u.data).filter(Boolean) ?? [];

  // leases: unwrap single Argo entity — keep the data object shape ({ leases: [...] })
  const leasesEntity = d.leases as { data?: unknown } | undefined;
  const leases = leasesEntity?.data ?? { leases: [] };

  // collections: array of Argo entities, extract each .data
  const collectionsRaw = d.collections as Array<{ data?: unknown }> | undefined;
  const collections = collectionsRaw?.map((c) => c.data).filter(Boolean) ?? [];

  return { ...d, userMetadata, fileMetadata, usages, leases, collections } as unknown as Image;
}

/**
 * Extracts the server-authoritative enrichment fields from a search-after hit entity
 * into an `EnrichmentFields` overlay entry. media-api computes these via
 * `imageResponse.create` (cost incl. overquota, valid, persisted, actions, etc.) —
 * values kupua cannot fully derive from ES alone.
 * Returns `[id, fields]` or null when the hit has no id.
 *
 * Exported for unit testing.
 */
export function extractEnrichment(entity: { data?: unknown; actions?: unknown }): [string, EnrichmentFields] | null {
  const d = entity.data as Record<string, unknown> | undefined;
  const id = d?.id as string | undefined;
  if (!d || !id) return null;

  // usages: unwrap the doubly-nested Argo entity (same shape as mapApiImageToImage)
  const usagesEntity = d.usages as { data?: Array<{ data?: unknown }> } | undefined;
  const usages = usagesEntity?.data?.map((u) => u.data).filter(Boolean);

  return [id, {
    cost: d.cost as EnrichmentFields["cost"],
    valid: d.valid as boolean | undefined,
    invalidReasons: d.invalidReasons as Record<string, string> | undefined,
    persisted: d.persisted as EnrichmentFields["persisted"],
    usageRights: d.usageRights as EnrichmentFields["usageRights"],
    actions: entity.actions as EnrichmentFields["actions"],
    syndicationStatus: d.syndicationStatus as EnrichmentFields["syndicationStatus"],
    usages: usages as EnrichmentFields["usages"],
  }];
}

export class SearchAfterApiError extends Error {
  readonly kind: "unavailable" | "pit-expired" | "refused";
  readonly status?: number;

  constructor(kind: SearchAfterApiError["kind"], status?: number) {
    super(status ? `media-api read ${status}` : "media-api read unavailable");
    this.name = "SearchAfterApiError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * The query and filter fields shared by every media-api ordered read: the admitted search scope
 * and the client-resolved sort clause. Paging, cursor and operation fields are added per endpoint.
 */
export function buildReadBody(params: SearchParams): Record<string, unknown> {
  // Restore the two default-hide clauses that Kahuna applies to every query
  // (via Parser.scala thingsToHideByDefault). The server's Parser.run only
  // fires these when the query explicitly contains the terms, so we must
  // inject them client-side unless the user has opted in.
  let effectiveQ = params.query ?? "";
  if (!effectiveQ.includes("is:deleted")) effectiveQ = effectiveQ ? `${effectiveQ} -is:deleted` : "-is:deleted";
  if (!effectiveQ.includes("usages@status:replaced")) effectiveQ = effectiveQ ? `${effectiveQ} -usages@status:replaced` : "-usages@status:replaced";

  const body: Record<string, unknown> = {
    q: effectiveQ,
    orderBy: params.orderBy,
    sort: buildSortClause(params.orderBy),
  };

  if (params.since) body.since = params.since;
  if (params.until) body.until = params.until;
  if (params.takenSince) body.takenSince = params.takenSince;
  if (params.takenUntil) body.takenUntil = params.takenUntil;
  if (params.modifiedSince) body.modifiedSince = params.modifiedSince;
  if (params.modifiedUntil) body.modifiedUntil = params.modifiedUntil;
  if (params.uploadedBy) body.uploadedBy = params.uploadedBy;
  if (params.ids) body.ids = params.ids;
  // payType is disabled in Kahuna (the UI control is commented out; live cost
  // filter is the single nonFree/free boolean). Not sent — see deviations.md.
  if (params.syndicationStatus) body.syndicationStatus = params.syndicationStatus;
  if (params.hasCrops === "true") body.hasExports = true;
  else if (params.hasCrops === "false") body.hasExports = false;
  // nonFree !== "true" means free filter active — mirror the ES adapter's buildQuery behaviour
  if (params.nonFree !== "true") body.free = true;
  // hasRightsAcquired is a live filter (URL-driven syndication workflow param)
  if (params.hasRightsAcquired === "true") body.hasRightsAcquired = true;
  else if (params.hasRightsAcquired === "false") body.hasRightsAcquired = false;

  return body;
}

/** POSTs one ordered read to media-api and returns its JSON, classifying failures for recovery. */
export async function postImageRead(path: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
  const res = await fetchImageRead(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, signal);
  if (!res.ok) throw await readFailure(res, signal);
  return readJson(res, signal);
}

/** Reads one image through GET /images/:id; undefined when media-api has no visible image with that ID. */
export async function apiGetImage(id: string, signal?: AbortSignal): Promise<ImageByIdResult | undefined> {
  const res = await fetchImageRead(`/api/images/${encodeURIComponent(id)}`, {}, signal);
  if (res.status === 404) return undefined;
  if (!res.ok) throw await readFailure(res, signal);
  const json = await readJson(res, signal) as { data?: { id?: unknown }; actions?: unknown };
  if (json.data?.id !== id) return undefined;
  return { image: mapApiImageToImage(json.data), enrichment: extractEnrichment(json)?.[1] };
}

async function fetchImageRead(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  signal?.throwIfAborted();
  try {
    return await fetch(url, { ...init, signal });
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof TypeError) throw new SearchAfterApiError("unavailable");
    throw error;
  }
}

async function readFailure(res: Response, signal?: AbortSignal): Promise<SearchAfterApiError> {
  const errorBody: unknown = await res.json().catch(() => undefined);
  signal?.throwIfAborted();
  const errorKey = errorBody && typeof errorBody === "object" && "errorKey" in errorBody
    ? errorBody.errorKey : undefined;
  const kind = res.status === 410 && errorKey === "search-after-pit-expired"
    ? "pit-expired"
    : (res.status === 502 || res.status === 504) && errorBody === undefined && !res.headers.has("Retry-After")
      ? "unavailable"
      : "refused";
  return new SearchAfterApiError(kind, res.status);
}

async function readJson(res: Response, signal?: AbortSignal): Promise<unknown> {
  const json: unknown = await res.json().catch((error: unknown) => {
    signal?.throwIfAborted();
    if (error instanceof TypeError) throw new SearchAfterApiError("unavailable");
    throw error;
  });
  signal?.throwIfAborted();
  return json;
}

function decodeImagePage(data: ImagePageResponse["data"]): { hits: Image[]; enrichment: Map<string, EnrichmentFields> } {
  const enrichment = new Map<string, EnrichmentFields>();
  const hits: Image[] = [];
  for (const entity of data) {
    const entry = extractEnrichment(entity);
    if (entry) enrichment.set(entry[0], entry[1]);
    if (entity.data != null) hits.push(mapApiImageToImage(entity.data));
  }
  return { hits, enrichment };
}

export async function apiSearchAfter(
  params: SearchParams,
  searchAfterValues: SortValues | null,
  pitId: string | null | undefined,
  signal: AbortSignal | undefined,
  reverse: boolean | undefined,
  seekToEnd: boolean | undefined,
): Promise<SearchAfterResult> {
  const t0 = Date.now();
  const body: Record<string, unknown> = {
    ...buildReadBody(params),
    length: params.length ?? 200,
    reverse: reverse ?? false,
    seekToEnd: seekToEnd ?? false,
    countAll: params.trackTotalHits === true,
  };
  if (searchAfterValues) body.sortValues = searchAfterValues;
  if (pitId) body.pitId = pitId;

  const json = await postImageRead("/images/search-after", body, signal) as SearchAfterApiResponse;
  const { hits, enrichment } = decodeImagePage(json.data);
  return {
    hits,
    total: json.total,
    sortValues: json.sortValues ?? [],
    pitId: json.pitId ?? null,
    fetchDuration: Date.now() - t0,
    enrichment,
  };
}

/** One page at a shallow offset through POST /images/window (offsets below media-api's window limit). */
export async function apiImageWindow(params: SearchParams, pitId: string | null | undefined, signal?: AbortSignal): Promise<SearchAfterResult> {
  const t0 = Date.now();
  const body: Record<string, unknown> = {
    ...buildReadBody(params),
    offset: params.offset ?? 0,
    length: params.length ?? 200,
    countAll: params.trackTotalHits === true,
  };
  if (pitId) body.pitId = pitId;

  const json = await postImageRead("/images/window", body, signal) as ImageWindowApiResponse;
  const { hits, enrichment } = decodeImagePage(json.data);
  return {
    hits,
    total: json.total ?? 0,
    sortValues: json.sortValues ?? [],
    pitId: json.pitId ?? null,
    fetchDuration: Date.now() - t0,
    enrichment,
  };
}
