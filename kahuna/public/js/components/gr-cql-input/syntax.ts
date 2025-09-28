import { CqlBinary, CqlExpr, CqlField, CqlQuery, CqlStr } from "@guardian/cql";
import {
  FilterType,
  StructuredQuery
} from "../../search/structured-query/syntax";

export const cqlParserSettings = {
  operators: false,
  groups: false,
  shortcuts: {
    "#": "label",
    "~": "collection"
  }
};

export const structureCqlQuery = (query: CqlQuery): StructuredQuery => {
  if (!query.content) {
    return [];
  }

  return combineConsecutiveTextFields(structuredQueryFromBinary(query.content));
};

const structuredQueryFromExpr = (expr: CqlExpr): StructuredQuery => {
  const filterType = expr.polarity === "NEGATIVE" ? "exclusion" : "inclusion";
  switch (expr.content.type) {
    case "CqlStr":
      return structuredQueryFromStr(expr.content, filterType);
    case "CqlBinary":
      return structuredQueryFromBinary(expr.content);
    case "CqlGroup":
      return []; // No groups in Grid queries ... yet
    case "CqlField":
      return structuredQueryFromField(expr.content, filterType);
  }
};

const structuredQueryFromBinary = (binary: CqlBinary): StructuredQuery => {
  const left = structuredQueryFromExpr(binary.left);
  const right = binary.right
    ? structuredQueryFromBinary(binary.right.binary)
    : [];

  return left.concat(right);
};

const structuredQueryFromStr = (
  str: CqlStr,
  filterType: FilterType,
): StructuredQuery => {
  return [
    {
      type: "text",
      // Take the lexeme, rather than the literal, as if the string
      // is quoted we must preserve the quotes: this what Grid expects
      value: str.token.lexeme,
      filterType
    }
  ];
};

const structuredQueryFromField = (
  { key: { literal }, value }: CqlField,
  filterType: FilterType,
): StructuredQuery => {
  if (!literal) {
    return [];
  }

  const type = literal === "collection" ? "static-filter" : "filter";

  return [
    {
      type,
      filterType,
      key: literal,
      value: value?.literal ?? ""
    }
  ];
};

const combineConsecutiveTextFields = (
  query: StructuredQuery,
): StructuredQuery =>
  query.reduce((previousFields, structuredField) => {
    const previousField = previousFields.at(-1);
    if (structuredField.type !== "text" || previousField?.type !== "text") {
      return previousFields.concat(structuredField);
    }

    return previousFields.slice(0, previousFields.length - 1).concat({
      ...structuredField,
      value: `${previousField.value} ${structuredField.value}`
    });
  }, [] as StructuredQuery);
