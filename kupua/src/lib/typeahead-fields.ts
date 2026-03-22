/**
 * Typeahead field resolvers for the CQL chip input.
 *
 * Dynamic resolvers use `ImageDataSource.getAggregation()` — a terms
 * aggregation on the keyword field, ranked by prevalence.  Results appear
 * immediately when the user types `:` and filter as they type further.
 *
 * Static resolvers (is, fileType, subject) use hardcoded lists — same as kahuna.
 *
 * Text-analysed fields (byline, city, description, etc.) currently have no
 * value suggestions — same as kahuna.  A better approach (e.g. keyword
 * sub-fields or completion suggesters) will be added later.
 */

import type { ImageDataSource } from "@/dal/types";
import { gridConfig } from "./grid-config";

// ---------------------------------------------------------------------------
// Types matching @guardian/cql's TypeaheadField expectations
// ---------------------------------------------------------------------------

export interface TypeaheadFieldDef {
  fieldName: string;
  resolver?: ((value: string) => Promise<string[]>) | string[];
}

// ---------------------------------------------------------------------------
// Static data — same lists kahuna uses
// ---------------------------------------------------------------------------

const SUBJECTS = [
  "arts", "crime", "disaster", "finance", "education", "environment",
  "health", "human", "labour", "lifestyle", "nature", "news", "politics",
  "religion", "science", "social", "sport", "war", "weather",
];

const FILE_TYPES = ["jpeg", "tiff", "png"];

const USAGE_PLATFORMS = ["print", "digital", "download"];

function buildIsOptions(): string[] {
  const org = gridConfig.staffPhotographerOrganisation;
  const options = [
    `${org}-owned-photo`,
    `${org}-owned-illustration`,
    `${org}-owned`,
    "under-quota",
    "deleted",
  ];
  if (gridConfig.useReaper) options.push("reapable");
  if (gridConfig.hasAgencyPicks) options.push("agency-pick");
  return options;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function prefixFilter(prefix: string, values: string[]): string[] {
  const lower = prefix.toLowerCase();
  return values.filter((v) => v.toLowerCase().startsWith(lower));
}

// ---------------------------------------------------------------------------
// Build the typeahead field list
//
// This mirrors kahuna's query-suggestions.ts but uses the DAL interface
// so it works against any ES — mock or real.
// ---------------------------------------------------------------------------

export function buildTypeaheadFields(
  dataSource: ImageDataSource
): TypeaheadFieldDef[] {
  const isOptions = buildIsOptions();

  // Field aliases from config that have search hints
  const aliasFields: TypeaheadFieldDef[] = gridConfig.fieldAliases
    .filter((fa) => fa.displaySearchHint && fa.searchHintOptions?.length)
    .map((fa) => ({
      fieldName: fa.alias,
      resolver: async (value: string) =>
        prefixFilter(value, fa.searchHintOptions!),
    }));

  const fields: TypeaheadFieldDef[] = [
    // --- Dynamic resolvers (hit ES) ---
    {
      fieldName: "category",
      resolver: async (value: string) => {
        const agg = await dataSource.getAggregation(
          "usageRights.category",
          undefined,
          50
        );
        return prefixFilter(
          value,
          agg.buckets.map((b) => b.key).filter((k) => k !== "")
        );
      },
    },
    {
      fieldName: "credit",
      resolver: async (value: string) => {
        const agg = await dataSource.getAggregation(
          "metadata.credit",
          undefined,
          50
        );
        return prefixFilter(value, agg.buckets.map((b) => b.key));
      },
    },
    {
      fieldName: "label",
      resolver: async (value: string) => {
        const agg = await dataSource.getAggregation(
          "userMetadata.labels",
          undefined,
          50
        );
        return prefixFilter(value, agg.buckets.map((b) => b.key));
      },
    },
    {
      fieldName: "photoshoot",
      resolver: async (value: string) => {
        const agg = await dataSource.getAggregation(
          "userMetadata.photoshoot.title",
          undefined,
          50
        );
        return prefixFilter(value, agg.buckets.map((b) => b.key));
      },
    },
    {
      fieldName: "source",
      resolver: async (value: string) => {
        const agg = await dataSource.getAggregation(
          "metadata.source",
          undefined,
          50
        );
        return prefixFilter(value, agg.buckets.map((b) => b.key));
      },
    },
    {
      fieldName: "supplier",
      resolver: async (value: string) => {
        const agg = await dataSource.getAggregation(
          "usageRights.supplier",
          undefined,
          50
        );
        return prefixFilter(value, agg.buckets.map((b) => b.key));
      },
    },

    // --- Static resolvers (no ES query) ---
    {
      fieldName: "fileType",
      resolver: async (value: string) => prefixFilter(value, FILE_TYPES),
    },
    {
      fieldName: "is",
      resolver: isOptions,
    },
    {
      fieldName: "subject",
      resolver: async (value: string) => prefixFilter(value, SUBJECTS),
    },
    {
      fieldName: "usages@status",
      resolver: ["published", "pending", "removed"],
    },
    {
      fieldName: "usages@platform",
      resolver: USAGE_PLATFORMS,
    },

    {
      fieldName: "uploader",
      resolver: async (value: string) => {
        const agg = await dataSource.getAggregation(
          "uploadedBy",
          undefined,
          50
        );
        return prefixFilter(value, agg.buckets.map((b) => b.key));
      },
    },

    // --- Keyword-field resolvers (terms aggregation) ---
    // These are keyword fields that can use standard terms aggs.
    {
      fieldName: "croppedBy",
      resolver: async (value: string) => {
        const agg = await dataSource.getAggregation("exports.author", undefined, 50);
        return prefixFilter(value, agg.buckets.map((b) => b.key));
      },
    },
    {
      fieldName: "filename",
      // No resolver — filenames are nearly always unique so aggregation is pointless
    },
    {
      fieldName: "keyword",
      resolver: async (value: string) => {
        const agg = await dataSource.getAggregation("metadata.keywords", undefined, 50);
        return prefixFilter(value, agg.buckets.map((b) => b.key));
      },
    },
    {
      fieldName: "leasedBy",
      // No resolver for now — leasedBy is inside a nested object and the
      // field is a keyword, so a standard top-level terms agg won't work.
    },

    // --- Text-analysed fields (no value suggestions) ---
    // These are standardAnalysed or sStemmerAnalysed in the ES mapping.
    // No resolver for now — same as kahuna.  A better approach will be
    // added later.
    { fieldName: "by" },
    { fieldName: "city" },
    { fieldName: "copyright" },
    { fieldName: "country" },
    { fieldName: "description" },
    { fieldName: "illustrator" },
    { fieldName: "location" },
    { fieldName: "person" },
    { fieldName: "specialInstructions" },
    { fieldName: "state" },
    { fieldName: "suppliersReference" },
    { fieldName: "title" },

    // --- Fields without resolvers ---
    // Date fields and structural filters — no value suggestions needed.
    { fieldName: "date" },
    { fieldName: "dateTaken" },
    { fieldName: "has" },
    { fieldName: "in" },
    { fieldName: "usages@<added" },
    { fieldName: "usages@>added" },
    { fieldName: "usages@reference" },

    // --- Config-driven field aliases with search hints ---
    ...aliasFields,
  ];

  // Sort alphabetically, same as kahuna
  return fields.sort((a, b) => a.fieldName.localeCompare(b.fieldName));
}

