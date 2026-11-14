import { z } from "zod";
import { gridServiceUrl, mediaApiUrl } from "@/dal/grid-api/proxy-target";
import { buildReadBody, postImageRead, SearchAfterApiError } from "@/dal/grid-api-search-adapter";
import { getGridServiceOrigin, getGridSessionPermissions, invalidateGridSession, isGridSessionInvalidated } from "./grid-api-instance";
import { uploadsAllowedAtStartup } from "./upload-preference";
import { siteSettings } from "./site-settings";

export type UploadStage = "preparation" | "transfer" | "queued";
export type UploadWriteOutcome = "acknowledged" | "blocked" | "rejected" | "uncertain";
export type UploadSubmission = {
  outcome: "accepted" | "blocked" | "failed" | "uncertain";
  stage: UploadStage;
  imageId?: string;
  queued?: UploadWriteOutcome;
  reason?: string;
};
export type UploadObservation =
  | { outcome: "status"; status: string }
  | { outcome: "visible" }
  | { outcome: "missing" | "unavailable" | "failed" };
const imageIdPattern = /^[a-f0-9]{40}$/;
const linksSchema = z.object({ links: z.array(z.object({ rel: z.string(), href: z.string() })) });
const statusSchema = z.object({ data: z.object({ status: z.enum(["PREPARED", "QUEUED", "PROCESSING", "PENDING", "COMPLETED", "FAILED"]) }) });
type Loader = { origin: string; prepare?: string; load?: string; status: string };
let loaderRead: Promise<Loader | undefined> | undefined;

export function gridUploadsEnabled(): boolean {
  return import.meta.env.VITE_USE_MEDIA_API === "true" && uploadsAllowedAtStartup;
}

async function loader(): Promise<Loader | undefined> {
  return loaderRead ??= (async () => {
    try {
      const origin = await getGridServiceOrigin("loader");
      const root = gridServiceUrl("loader", `${origin}/`, "/", origin);
      if (!root || isGridSessionInvalidated()) return undefined;
      const response = await fetch(root, { credentials: "include", redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (response.status === 401 || response.status === 419) invalidateGridSession();
      if (!response.ok) return undefined;
      const parsed = linksSchema.safeParse(await response.json());
      if (!parsed.success) return undefined;
      const link = (rel: string) => parsed.data.links.find(item => item.rel === rel)?.href;
      if (link("uploadStatus") !== `${origin}/uploadStatus/{id}`) return undefined;
      return { origin: origin!, status: `${origin}/uploadStatus/`,
        ...(link("prepare") === `${origin}/prepare` ? { prepare: `${origin}/prepare` } : {}),
        ...(link("load") === `${origin}/images{?uploadedBy,identifiers,uploadTime,filename}` ? { load: `${origin}/images` } : {}),
      };
    } catch { return undefined; }
  })();
}

async function admission(): Promise<string | undefined> {
  if (!gridUploadsEnabled()) return "Uploads are disabled. Apply the upload preference and reload before submitting again.";
  if (isGridSessionInvalidated()) return "Session expired. Reload and explicitly submit again.";
  const session = await getGridSessionPermissions();
  if (isGridSessionInvalidated()) return "Session expired. Reload and explicitly submit again.";
  return session?.canUpload === true ? undefined : "Upload permission is unavailable.";
}

function signedStorageTarget(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && !url.hash
      && (/^(?:[a-z0-9][a-z0-9.-]*\.)?s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)
        || url.origin === "https://localstack.media.local.dev-gutools.co.uk")
      && url.pathname.length > 1 && url.searchParams.get("X-Amz-Algorithm") === "AWS4-HMAC-SHA256"
      && !!url.searchParams.get("X-Amz-Signature") && !!url.searchParams.get("X-Amz-Credential")
      && !!url.searchParams.get("X-Amz-Date") && !!url.searchParams.get("X-Amz-Expires");
  } catch { return false; }
}

async function write(target: string, init: RequestInit, signal: AbortSignal, storage = false): Promise<UploadWriteOutcome> {
  if (signal.aborted || await admission() || signal.aborted) return "blocked";
  try {
    const response = await fetch(target, { ...init, credentials: storage ? "omit" : "include", redirect: "error",
      referrerPolicy: "no-referrer", signal: storage ? signal : AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (!storage && (response.status === 401 || response.status === 419)) invalidateGridSession();
    return response.ok ? "acknowledged" : [400, 401, 403, 413, 415, 419, 422].includes(response.status) ? "rejected" : "uncertain";
  } catch { return "uncertain"; }
}

export async function submitGridUpload(file: File, progress: (stage: UploadStage, imageId?: string) => void,
  signal: AbortSignal): Promise<UploadSubmission> {
  let stage: UploadStage = "preparation";
  let imageId: string | undefined;
  let dispatched = false;
  try {
    const reason = await admission();
    if (reason || signal.aborted) return { outcome: "blocked", stage, reason: reason ?? "Submission stopped." };
    const config = siteSettings().upload;
    if (!config) return { outcome: "blocked", stage, reason: "Upload configuration is unavailable." };
    if (config.maxFileBytes && file.size > config.maxFileBytes) return { outcome: "failed", stage, reason: "File exceeds the configured upload size limit." };
    const service = await loader();
    if (!service) return { outcome: "blocked", stage, reason: "Loader service is unavailable." };
    if (config.transport === "direct") {
      if (!service.load) return { outcome: "blocked", stage, reason: "Direct loading is unavailable." };
      const path = `/images?${new URLSearchParams({ filename: file.name })}`;
      const target = gridServiceUrl("loader", `${service.origin}${path}`, path, service.origin);
      if (!target || await admission() || signal.aborted) return { outcome: "blocked", stage };
      stage = "transfer";
      progress(stage);
      dispatched = true;
      const response = await fetch(target, { method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" },
        credentials: "include", redirect: "error", signal });
      if (response.status === 401 || response.status === 419) invalidateGridSession();
      if (!response.ok) return { outcome: [400, 401, 403, 413, 415, 419, 422].includes(response.status) ? "failed" : "uncertain", stage };
      const body: unknown = await response.json();
      const receipt = z.object({ uri: z.string() }).safeParse(body);
      const candidate = receipt.success && receipt.data.uri.startsWith(service.status) ? receipt.data.uri.slice(service.status.length) : "";
      if (!imageIdPattern.test(candidate)) return { outcome: "uncertain", stage, reason: "Loader accepted the file without a valid status receipt." };
      imageId = candidate;
      return { outcome: "accepted", stage, imageId };
    }
    if (!service.prepare) return { outcome: "blocked", stage, reason: "Signed upload preparation is unavailable." };
    progress(stage);
    const digest = await crypto.subtle.digest("SHA-1", await file.arrayBuffer());
    imageId = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    progress(stage, imageId);
    const prepare = gridServiceUrl("loader", service.prepare, "/prepare", service.origin);
    if (!prepare || await admission() || signal.aborted) return { outcome: "blocked", stage, imageId };
    dispatched = true;
    const prepared = await fetch(prepare, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [imageId]: file.name }), credentials: "include", redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (prepared.status === 401 || prepared.status === 419) invalidateGridSession();
    if (!prepared.ok) return { outcome: [400, 401, 403, 413, 415, 419, 422].includes(prepared.status) ? "failed" : "uncertain", stage, imageId };
    const body: unknown = await prepared.json();
    const capability = z.record(z.string(), z.string()).safeParse(body);
    const target = capability.success ? capability.data[imageId] : undefined;
    if (!signedStorageTarget(target)) return { outcome: "failed", stage, imageId, reason: "Preparation returned an invalid storage target. No bytes sent." };
    stage = "transfer";
    progress(stage, imageId);
    const transferred = await write(target, { method: "PUT", body: file, headers: { "x-amz-meta-media-id": imageId } }, signal, true);
    if (transferred !== "acknowledged") return { outcome: transferred === "blocked" ? "blocked" : transferred === "rejected" ? "failed" : "uncertain", stage, imageId };
    stage = "queued";
    progress(stage, imageId);
    const path = `/uploadStatus/${imageId}`;
    const queuedTarget = gridServiceUrl("loader", `${service.origin}${path}`, path, service.origin)!;
    const queued = await write(queuedTarget, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "QUEUED" }) }, signal);
    return { outcome: "accepted", stage, imageId, queued };
  } catch {
    return { outcome: dispatched ? "uncertain" : "failed", stage, imageId, reason: "Upload did not finish normally. No automatic retry was made." };
  }
}

export async function observeGridUpload(imageId: string, signal: AbortSignal): Promise<UploadObservation> {
  if (import.meta.env.VITE_USE_MEDIA_API !== "true" || !imageIdPattern.test(imageId) || isGridSessionInvalidated()) return { outcome: "unavailable" };
  try {
    const service = await loader();
    if (!service || signal.aborted) return { outcome: "unavailable" };
    const path = `/uploadStatus/${imageId}`;
    const target = gridServiceUrl("loader", `${service.origin}${path}`, path, service.origin);
    if (!target) return { outcome: "unavailable" };
    const response = await fetch(target, { credentials: "include", redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    if (response.status === 401 || response.status === 419) invalidateGridSession();
    if (response.status === 404) return { outcome: "missing" };
    if (!response.ok) return { outcome: "unavailable" };
    const status = statusSchema.safeParse(await response.json());
    if (!status.success) return { outcome: "unavailable" };
    return status.data.data.status === "FAILED" ? { outcome: "failed" } : { outcome: "status", status: status.data.data.status };
  } catch { return { outcome: "unavailable" }; }
}

export async function observeUploadedImage(imageId: string, signal: AbortSignal): Promise<UploadObservation> {
  if (import.meta.env.VITE_USE_MEDIA_API !== "true" || !imageIdPattern.test(imageId) || isGridSessionInvalidated()) return { outcome: "unavailable" };
  try {
    const readSignal = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
    const response = await fetch(mediaApiUrl(`/images/${imageId}`), { credentials: "include", redirect: "error",
      signal: readSignal });
    if (response.status === 401 || response.status === 419) invalidateGridSession();
    if (response.status === 404) return { outcome: "missing" };
    if (!response.ok) return { outcome: "unavailable" };
    const resource = z.object({ data: z.object({ id: z.literal(imageId) }) }).safeParse(await response.json());
    if (!resource.success || isGridSessionInvalidated()) return { outcome: "unavailable" };
    const body = buildReadBody({ nonFree: "true", imageScope: { key: `upload-visibility:${imageId}`, revision: 0, ids: [imageId] } });
    delete body.sort;
    const count = z.object({ total: z.number().int().nonnegative() }).safeParse(await postImageRead("/images/count", body, readSignal));
    if (!count.success || isGridSessionInvalidated()) return { outcome: "unavailable" };
    return { outcome: count.data.total > 0 ? "visible" : "missing" };
  } catch (error) {
    if (error instanceof SearchAfterApiError && (error.status === 401 || error.status === 419)) invalidateGridSession();
    return { outcome: "unavailable" };
  }
}