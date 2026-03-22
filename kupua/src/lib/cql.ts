/**
 * CQL (Content Query Language) parser and Elasticsearch query builder.
 *
 * Parses Grid's CQL syntax (e.g. `+credit:"Getty Images" -by:"Robbie Stephenson"`)
 * into Elasticsearch bool queries. Mirrors the Scala-side QuerySyntax + QueryBuilder.
 *
 * Uses @guardian/cql for parsing, then translates the AST to ES query DSL.
 */

import {
  createParser,
  type CqlBinary,
  type CqlExpr,
  type CqlField,
  type CqlStr,
} from "@guardian/cql";
import { gridConfig } from "./grid-config";

// ---------------------------------------------------------------------------
// CQL Parser instance — configure shortcuts like kahuna does
// ---------------------------------------------------------------------------

const parser = createParser({
  shortcuts: {
    "#": "label",
    "~": "collection",
  },
});

// ---------------------------------------------------------------------------
// Field resolution — mirrors Scala's ImageFields.getFieldPath + QuerySyntax.resolveNamedField
// ---------------------------------------------------------------------------

const METADATA_FIELDS = new Set([
  "dateTaken",
  "description",
  "byline",
  "bylineTitle",
  "title",
  "credit",
  "creditUri",
  "copyright",
  "suppliersReference",
  "subjects",
  "source",
  "specialInstructions",
  "keywords",
  "subLocation",
  "city",
  "state",
  "country",
  "peopleInImage",
  "imageType",
]);

const USAGE_RIGHTS_FIELDS = new Set([
  "category",
  "restrictions",
  "supplier",
  "suppliersCollection",
  "photographer",
  "publication",
]);

const EDITS_FIELDS = new Set(["archived", "labels"]);
const SOURCE_FIELDS = new Set(["mimeType"]);

const FIELD_ALIASES: Record<string, string> = {
  crops: "exports",
  croppedBy: "exports.author",
  filename: "uploadInfo.filename",
  photoshoot: "userMetadata.photoshoot.title",
  leases: "leases.leases",
  leasedBy: "leases.leases.leasedBy",
  people: "metadata.peopleInImage",
};

/** Resolve a short field name to the full ES path (mirrors Scala getFieldPath) */
function getFieldPath(field: string): string {
  if (METADATA_FIELDS.has(field)) return `metadata.${field}`;
  if (USAGE_RIGHTS_FIELDS.has(field)) return `usageRights.${field}`;
  if (EDITS_FIELDS.has(field)) return `userMetadata.${field}`;
  if (SOURCE_FIELDS.has(field)) return `source.${field}`;
  return FIELD_ALIASES[field] ?? field;
}

/**
 * Translate short file-type names to full MIME types.
 * Mirrors Scala's QuerySyntax.translateMimeType.
 */
function translateMimeType(expr: string): string | undefined {
  switch (expr.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "tif":
    case "tiff":
      return "image/tiff";
    default:
      return undefined;
  }
}

/**
 * Resolve a CQL field alias to ES field path(s).
 * Mirrors Scala's QuerySyntax.resolveNamedField.
 */
function resolveNamedField(name: string): string | string[] {
  // Aliases from QuerySyntax
  const aliasMap: Record<string, string> = {
    illustrator: "credit",
    uploader: "uploadedBy",
    label: "labels",
    subject: "subjects",
    location: "subLocation",
    by: "byline",
    photographer: "byline",
    keyword: "keywords",
    person: "peopleInImage",
  };

  const resolved = aliasMap[name] ?? name;

  // Multi-field expansions
  switch (resolved) {
    case "in":
      return ["subLocation", "city", "state", "country"].map(getFieldPath);
    default:
      return getFieldPath(resolved);
  }
}

// ---------------------------------------------------------------------------
// ES match fields — the fields used for free-text "any field" search
// ---------------------------------------------------------------------------

const MATCH_FIELDS = [
  "metadata.englishAnalysedCatchAll",
  "metadata.title",
  "metadata.description",
  "metadata.byline",
  "metadata.credit",
  "metadata.keywords",
];

// ---------------------------------------------------------------------------
// ES Query types (simplified DSL — just plain objects for fetch)
// ---------------------------------------------------------------------------

type EsQuery = Record<string, unknown>;

// ---------------------------------------------------------------------------
// CQL AST → ES Query translation
// ---------------------------------------------------------------------------

interface QueryClause {
  query: EsQuery;
  negated: boolean;
}

function isQuoted(lexeme: string): boolean {
  return (
    (lexeme.startsWith('"') && lexeme.endsWith('"')) ||
    (lexeme.startsWith("'") && lexeme.endsWith("'"))
  );
}

function strToClause(str: CqlStr, negated: boolean): QueryClause {
  const lexeme = str.token.lexeme;
  const value = str.token.literal ?? lexeme;

  // If quoted, use phrase matching; otherwise use cross_fields
  if (isQuoted(lexeme)) {
    return {
      query: {
        multi_match: {
          query: value,
          fields: MATCH_FIELDS,
          type: "phrase",
        },
      },
      negated,
    };
  }

  return {
    query: {
      multi_match: {
        query: value,
        fields: MATCH_FIELDS,
        type: "cross_fields",
        operator: "and",
      },
    },
    negated,
  };
}

function fieldToClause(field: CqlField, negated: boolean): QueryClause {
  const key = field.key.literal ?? field.key.lexeme;
  const value = field.value?.literal ?? field.value?.lexeme ?? "";

  if (!key || !value) {
    return { query: { match_none: {} }, negated: false };
  }

  // Special field handlers
  if (key === "has") {
    return {
      query: { exists: { field: getFieldPath(value) } },
      negated,
    };
  }

  if (key === "is") {
    return buildIsQuery(value, negated);
  }

  if (key === "collection") {
    return {
      query: {
        term: { [getFieldPath("pathHierarchy")]: value.toLowerCase() },
      },
      negated,
    };
  }

  // fileType — special handling matching Scala's FileTypeMatch.
  // Maps fileType:jpeg → term query on source.mimeType with MIME translation.
  if (key === "fileType") {
    const mimeType = translateMimeType(value);
    if (mimeType) {
      return {
        query: { match: { [getFieldPath("mimeType")]: { query: mimeType, operator: "and" } } },
        negated,
      };
    }
    // Unknown file type — fall through to normal field matching
    return {
      query: { match: { "fileType": { query: value, operator: "and" } } },
      negated,
    };
  }

  const resolved = resolveNamedField(key);

  // Multi-field
  if (Array.isArray(resolved)) {
    const isPhrase = field.value
      ? isQuoted(field.value.lexeme)
      : false;
    return {
      query: {
        multi_match: {
          query: value,
          fields: resolved,
          type: isPhrase ? "phrase" : "best_fields",
          operator: "and",
        },
      },
      negated,
    };
  }

  // Single field — quoted = phrase, unquoted = match with AND
  const isPhrase = field.value ? isQuoted(field.value.lexeme) : false;
  if (isPhrase) {
    return {
      query: { match_phrase: { [resolved]: value } },
      negated,
    };
  }

  return {
    query: { match: { [resolved]: { query: value, operator: "and" } } },
    negated,
  };
}

// Usage rights categories — mirrors Scala's UsageRights model
const PHOTOGRAPHER_CATEGORIES = [
  "staff-photographer",
  "contract-photographer",
  "commissioned-photographer",
];
const ILLUSTRATOR_CATEGORIES = [
  "staff-illustrator",
  "contract-illustrator",
  "commissioned-illustrator",
];
const WHOLLY_OWNED_CATEGORIES = [
  ...PHOTOGRAPHER_CATEGORIES,
  ...ILLUSTRATOR_CATEGORIES,
];

function buildIsQuery(value: string, negated: boolean): QueryClause {
  const v = value.toLowerCase();
  const org = gridConfig.staffPhotographerOrganisation.toLowerCase();

  // Mirrors Scala's IsQueryFilter
  if (v === "deleted") {
    return {
      query: { exists: { field: "softDeletedMetadata" } },
      negated,
    };
  }

  if (v === `${org}-owned`) {
    return {
      query: { terms: { "usageRights.category": WHOLLY_OWNED_CATEGORIES } },
      negated,
    };
  }

  if (v === `${org}-owned-photo`) {
    return {
      query: { terms: { "usageRights.category": PHOTOGRAPHER_CATEGORIES } },
      negated,
    };
  }

  if (v === `${org}-owned-illustration`) {
    return {
      query: { terms: { "usageRights.category": ILLUSTRATOR_CATEGORIES } },
      negated,
    };
  }

  // Unknown "is:" value — return match_none
  return { query: { match_none: {} }, negated: false };
}

function exprToClauses(expr: CqlExpr): QueryClause[] {
  const negated = expr.polarity === "NEGATIVE";

  switch (expr.content.type) {
    case "CqlStr":
      return [strToClause(expr.content, negated)];
    case "CqlField":
      return [fieldToClause(expr.content, negated)];
    case "CqlBinary":
      return binaryToClauses(expr.content);
    case "CqlGroup":
      return binaryToClauses(expr.content.content);
  }
}

function binaryToClauses(binary: CqlBinary): QueryClause[] {
  const left = exprToClauses(binary.left);
  const right = binary.right
    ? binaryToClauses(binary.right.binary)
    : [];
  return [...left, ...right];
}

/**
 * Merge consecutive non-negated text queries into a single multi_match.
 * This mirrors the Scala Parser.normalise behaviour.
 */
function mergeClauses(clauses: QueryClause[]): QueryClause[] {
  const merged: QueryClause[] = [];

  for (const clause of clauses) {
    const prev = merged[merged.length - 1];

    // Only merge consecutive non-negated multi_match cross_fields queries
    if (
      prev &&
      !prev.negated &&
      !clause.negated &&
      isMultiMatchCrossFields(prev.query) &&
      isMultiMatchCrossFields(clause.query)
    ) {
      // Merge the query text
      const prevQ = (prev.query as { multi_match: { query: string } })
        .multi_match.query;
      const currQ = (clause.query as { multi_match: { query: string } })
        .multi_match.query;
      (prev.query as { multi_match: { query: string } }).multi_match.query =
        `${prevQ} ${currQ}`;
    } else {
      merged.push(clause);
    }
  }

  return merged;
}

function isMultiMatchCrossFields(q: EsQuery): boolean {
  const mm = q.multi_match as
    | { type?: string; query?: string }
    | undefined;
  return mm?.type === "cross_fields";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CqlParseResult {
  /** The ES query object to use in the bool query */
  must: EsQuery[];
  /** Negated queries to put in must_not */
  mustNot: EsQuery[];
}

/**
 * Parse a CQL query string into ES query clauses.
 *
 * @param queryStr - CQL query string, e.g. `credit:"Getty" -by:"Foo" cats`
 * @returns Object with `must` and `mustNot` arrays of ES query objects
 */
export function parseCql(queryStr: string): CqlParseResult {
  if (!queryStr.trim()) {
    return { must: [], mustNot: [] };
  }

  const result = parser(queryStr);

  if (!result.queryAst?.content) {
    return { must: [], mustNot: [] };
  }

  const rawClauses = binaryToClauses(result.queryAst.content);
  const clauses = mergeClauses(rawClauses);

  const must: EsQuery[] = [];
  const mustNot: EsQuery[] = [];

  for (const clause of clauses) {
    if (clause.negated) {
      mustNot.push(clause.query);
    } else {
      must.push(clause.query);
    }
  }

  return { must, mustNot };
}

/**
 * Render a CQL query string from the parser (for round-trip display).
 * Uses the @guardian/cql parser's own queryStr output.
 */
export function normalizeCql(queryStr: string): string {
  const result = parser(queryStr);
  return result.queryStr ?? queryStr;
}

