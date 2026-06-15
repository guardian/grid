/**
 * API client for POST /images/search-after.
 *
 * Called by StranglerAdapter when VITE_USE_MEDIA_API=true. Routes cursor
 * pagination through the media-api server instead of direct ES access.
 *
 * PITs opened by kupua's openPit() are forwarded to the server — both kupua
 * and the local media-api connect to the same ES cluster (TEST), so PIT IDs
 * are valid across both connections.
 */

import type { Image } from "@/types/image";
import type { SearchAfterResult, SearchParams, SortValues } from "./types";
import { buildSortClause } from "./adapters/elasticsearch/sort-builders";
import { type EnrichmentFields } from "@/stores/enrichment-store";

type SearchAfterApiResponse = {
  data: Array<{ data?: unknown; actions?: unknown }>;
  total: number;
  sortValues: SortValues[];
  pitId?: string | null;
};

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
  const d = raw as Record<string, unknown>;

  // usages: unwrap doubly-nested Argo entity
  const usagesEntity = d.usages as { data?: Array<{ data?: unknown }> } | undefined;
  const usages = usagesEntity?.data?.map((u) => u.data).filter(Boolean) ?? [];

  // leases: unwrap single Argo entity — keep the data object shape ({ leases: [...] })
  const leasesEntity = d.leases as { data?: unknown } | undefined;
  const leases = leasesEntity?.data ?? { leases: [] };

  // collections: array of Argo entities, extract each .data
  const collectionsRaw = d.collections as Array<{ data?: unknown }> | undefined;
  const collections = collectionsRaw?.map((c) => c.data).filter(Boolean) ?? [];

  return { ...d, usages, leases, collections } as unknown as Image;
}

/**
 * Extracts the server-authoritative enrichment fields from a search-after hit entity
 * into an `EnrichmentFields` overlay entry. media-api computes these via
 * `imageResponse.create` (cost incl. overquota, valid, persisted, actions, the
 * `isPotentiallyGraphic` script field, etc.) — values kupua cannot fully derive from ES
 * alone. Returns `[id, fields]` or null when the hit has no id.
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
    isPotentiallyGraphic: d.isPotentiallyGraphic as boolean | undefined,
    syndicationStatus: d.syndicationStatus as EnrichmentFields["syndicationStatus"],
    usages: usages as EnrichmentFields["usages"],
  }];
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
    length: params.length ?? 200,
    reverse: reverse ?? false,
    seekToEnd: seekToEnd ?? false,
    countAll: !searchAfterValues,
  };

  if (searchAfterValues) body.sortValues = searchAfterValues;
  if (pitId) body.pitId = pitId;

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

  const res = await fetch("/api/images/search-after", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`search-after API ${res.status}: ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as SearchAfterApiResponse;

  // Single pass: build enrichment map and hits array together.
  // Previously two separate passes over json.data (a for-loop then three chained
  // .map/.filter/.map calls). Combined here to halve the iterations and avoid
  // computing the usages-unwrap twice per entity.
  const enrichment = new Map<string, EnrichmentFields>();
  const hits: Image[] = [];
  for (const entity of json.data) {
    const entry = extractEnrichment(entity);
    if (entry) enrichment.set(entry[0], entry[1]);
    if (entity.data != null) hits.push(mapApiImageToImage(entity.data));
  }

  return {
    hits,
    total: json.total,
    sortValues: json.sortValues ?? [],
    pitId: json.pitId ?? null,
    fetchDuration: Date.now() - t0,
    enrichment,
  };
}
