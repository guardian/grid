import { z } from "zod";
import type { Lease } from "@/types/image";

const date = z.string().refine(value => Number.isFinite(Date.parse(value)));
const terms = z.object({ access: z.enum(["allow-use", "deny-use", "allow-syndication", "deny-syndication"]),
  startDate: date.optional(), endDate: date.optional(), notes: z.string().optional() }).strict()
  .refine(value => !(value.access === "allow-syndication" && value.endDate || value.access === "deny-syndication" && value.startDate)
    && (!value.startDate || !value.endDate || Date.parse(value.startDate) < Date.parse(value.endDate)));
const add = z.object({ kind: z.literal("add"), lease: terms }).strict();
const remove = z.object({ kind: z.literal("remove"), id: z.uuid() }).strict();
const replace = z.object({ kind: z.literal("replace"), leases: z.array(terms).refine(items => items.filter(item => item.access.endsWith("-syndication")).length <= 1) }).strict();
export const leaseChangeSchema = z.discriminatedUnion("kind", [add.extend({ overwriteOn: z.array(z.string()) }), remove, replace]);
export const leaseCommandValueSchema = z.discriminatedUnion("kind", [add.extend({ overwrite: z.boolean() }), remove, replace]);
export type LeaseChange = z.infer<typeof leaseChangeSchema>;
const overwriteIndexes = new WeakMap<Extract<LeaseChange, { kind: "add" }>, Set<string>>();
export function leaseChangeForImage(change: LeaseChange, imageId: string): z.infer<typeof leaseCommandValueSchema> {
  if (change.kind !== "add") return change;
  let index = overwriteIndexes.get(change);
  if (!index) {
    index = new Set(change.overwriteOn);
    overwriteIndexes.set(change, index);
  }
  return { kind: "add", lease: change.lease, overwrite: index.has(imageId) };
}
function normalizedDate(value: string) {
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? new Date(instant).toISOString() : value;
}
export function leaseTerms(lease: Pick<Lease, "access" | "startDate" | "endDate" | "notes">) {
  return { access: lease.access, ...(lease.startDate && { startDate: normalizedDate(lease.startDate) }),
    ...(lease.endDate && { endDate: normalizedDate(lease.endDate) }), ...(lease.notes && { notes: lease.notes }) };
}
export function leaseSetKey(leases: readonly Parameters<typeof leaseTerms>[0][]) {
  return JSON.stringify(leases.map(lease => JSON.stringify(leaseTerms(lease))).sort());
}
export const storedLeases = z.object({ data: z.object({ leases: z.array(z.object({
  id: z.uuid(), mediaId: z.string(), access: z.enum(["allow-use", "deny-use", "allow-syndication", "deny-syndication"]),
  startDate: date.nullish(), endDate: date.nullish(), notes: z.string().nullish(),
}).transform(item => ({ ...item, startDate: item.startDate ?? undefined, endDate: item.endDate ?? undefined, notes: item.notes ?? undefined }))) }) });