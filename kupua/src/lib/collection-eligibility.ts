import type { Image } from "@/types/image";
import type { EnrichmentFields } from "@/stores/enrichment-store";

type Grants = Pick<EnrichmentFields, "actions" | "removableCollections">;

export function directMembershipCounts(ids: ReadonlySet<string>, pathId: string | undefined, peek: (id: string) => Image | undefined) {
  let direct = 0, unknown = 0;
  for (const id of ids) {
    const image = peek(id);
    if (!image || image.__availability || !Array.isArray(image.collections)) unknown++;
    else if (image.collections.some(member => member.pathId === pathId)) direct++;
  }
  return { direct, unknown, selected: ids.size };
}

export function membershipActionLabel(action: "add" | "remove", { direct, unknown, selected }: ReturnType<typeof directMembershipCounts>) {
  const verb = action === "add" ? "Add" : "Remove";
  const count = action === "add" ? selected : direct;
  return `${verb} ${unknown && action === "remove" ? "selected photos" : count > 0 && count < selected ? `${count}/${selected} photos` : `${count} photo${count === 1 ? "" : "s"}`}`;
}

export function collectionEligibility(images: readonly Image[], grants: (image: Image) => Grants | undefined) {
  const removable = new Set<string>();
  const blocked = new Set<string>();
  const heldWithoutAdd = new Map<string, number>();
  let withoutAdd = 0;
  for (const image of images) {
    const grant = grants(image);
    const add = grant?.actions?.some(action => action.name === "add-collection" && action.method === "POST" && !!action.href);
    if (!add) withoutAdd++;
    for (const path of new Set(image.collections?.map(member => member.pathId))) {
      if (!path) continue;
      if (!add) heldWithoutAdd.set(path, (heldWithoutAdd.get(path) ?? 0) + 1);
      if (grant?.removableCollections?.has(path)) removable.add(path); else blocked.add(path);
    }
  }
  for (const path of blocked) removable.delete(path);
  const add = images.length > 0 && withoutAdd === 0;
  const canFill = (path: string) => add || images.length > withoutAdd && heldWithoutAdd.get(path) === withoutAdd;
  const affectedIds = (action: "add" | "remove", path: string) => images.filter(image =>
    Boolean(image.collections?.some(member => member.pathId === path)) === (action === "remove")).map(image => image.id);
  return { add, canFill, removable, affectedIds, editable: add || removable.size > 0 || [...heldWithoutAdd.keys()].some(canFill) };
}