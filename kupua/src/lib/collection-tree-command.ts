import { gridServiceUrl, gridServiceOrigin, mediaApiUrl } from "@/dal/grid-api/proxy-target";
import { fetchCollectionTree, useCollectionStore, type CollectionNode } from "@/stores/collection-store";
import { editingAllowedAtStartup } from "./editing-preference";
import { getGridServiceOrigin, getGridSessionPermissions, invalidateGridSession, isGridSessionInvalidated, serviceLink } from "./grid-api-instance";
import { collectionNameError, isCollectionTreeWrite } from "./collection-tree-policy";

const enabled = () => import.meta.env.VITE_USE_MEDIA_API === "true" && editingAllowedAtStartup && !isGridSessionInvalidated();
const options = () => ({ credentials: "include", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) }) as const;
const segment = (value: string) => encodeURIComponent(value).replace(/[!'()~]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

export async function hasRootCollectionAccess(imageId?: string): Promise<boolean> {
  if (!enabled() || !imageId || !/^[a-f\d]{40}$/i.test(imageId)) return false;
  try {
    const usage = gridServiceOrigin(await serviceLink("usage"));
    if (!usage || !await getGridSessionPermissions()) return false;
    const res = await fetch(mediaApiUrl(`/images/${imageId}`), options());
    if (res.status === 401 || res.status === 419) invalidateGridSession();
    if (!res.ok || !enabled()) return false;
    const body = await res.json();
    return body?.data?.id === imageId && Array.isArray(body.actions) && body.actions.some((a: { name: string; method: string; href: string }) => a?.name === "delete-usages" && a.method === "DELETE" && a.href === `${usage}/usages/media/${imageId}`);
  } catch { return false; }
}

function locate(tree: CollectionNode, path: readonly string[]) {
  let node = tree;
  for (const bit of path) {
    const matches = node.data.children.filter(child => child.data.basename.toLowerCase() === bit.toLowerCase());
    if (matches.length !== 1 || matches[0].data.basename !== bit) return;
    node = matches[0];
  }
  if (path.length && (!node.data.data || JSON.stringify(node.data.fullPath) !== JSON.stringify(path) || node.data.data.pathId !== path.join("/").toLowerCase())) return;
  return node;
}

export function canRemoveTreeNode(tree: CollectionNode, node: CollectionNode) {
  return !!node.data.data && locate(tree, node.data.fullPath) === node && !node.data.children.length && node.actions.some(action => (action as { name?: string })?.name === "remove" && (action as { method?: string })?.method === "DELETE");
}

type Receipt = { observed: boolean; message: string };
let busy = false;
export async function changeCollectionTree(path: readonly string[], name: string | null, adminImage?: string): Promise<Receipt> {
  const fail = (message: string) => ({ observed: false, message });
  if (!enabled() || busy) return fail("Collection editing is unavailable.");
  busy = true;
  let sent = false, acknowledged = false;
  try {
    const deleting = name === null, privileged = deleting ? path.length === 1 : !path.length;
    const origin = await getGridServiceOrigin("collections");
    if (!origin || origin !== useCollectionStore.getState().countServiceUri || !await getGridSessionPermissions() || privileged && !await hasRootCollectionAccess(adminImage)) return fail("Not permitted. Nothing sent.");
    const before = await fetchCollectionTree(origin, true);
    const target = before && locate(before, path);
    if (!target || deleting && !canRemoveTreeNode(before!, target)) return fail("Collection changed or is unavailable. Nothing sent.");
    const error = name !== null && collectionNameError(name, target.data.children);
    if (error) return fail(error);
    const method = deleting ? "DELETE" : "POST", expectedPath = "/collections" + path.map(bit => "/" + segment(bit)).join("");
    const action = target.actions.find(item => (item as { name?: string })?.name === (deleting ? "remove" : "add-child") && (item as { method?: string })?.method === method) as { href?: string } | undefined;
    const url = gridServiceUrl("collections", action?.href, expectedPath, origin);
    if (!url || !isCollectionTreeWrite(method, expectedPath) || !enabled()) return fail("Action unavailable. Nothing sent.");
    sent = true;
    const res = await fetch(url, { ...options(), method, ...(name !== null && { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: name.trim() }) }) });
    if (res.status === 401 || res.status === 419) invalidateGridSession();
    if (!res.ok) return fail([400,401,403,404,409,419,422].includes(res.status) ? `Grid rejected the change (${res.status}).` : "Submission uncertain. Check Browse before trying again.");
    acknowledged = true;
    const after = await fetchCollectionTree(origin, true);
    if (!after || origin !== useCollectionStore.getState().countServiceUri) return fail("Grid accepted the change. Reload the page to refresh Browse.");
    useCollectionStore.setState({ tree: after, status: "ready" });
    const actualPath = name === null ? path : [...path, name.trim()];
    const parent = locate(after, actualPath.slice(0,-1));
    const observed = deleting ? !!parent && !parent.data.children.some(child => child.data.basename.toLowerCase() === actualPath.at(-1)?.toLowerCase()) : !!locate(after, actualPath);
    return observed ? { observed, message: `${deleting ? "Deleted" : "Created"} ${actualPath.join(" / ")}.` } : fail("Grid accepted the change; Browse has not confirmed it.");
  } catch { return fail(acknowledged ? "Grid accepted the change. Could not refresh Browse." : sent ? "Submission uncertain. Check Browse before trying again." : "Could not check the collection. Nothing sent."); }
  finally { busy = false; }
}