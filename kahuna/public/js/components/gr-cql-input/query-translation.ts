import { CqlBinary, CqlExpr, CqlQuery } from "@guardian/cql";

const addPlusesToGridChips = /([^\s-]*\:)(?<!-[^\s]*\:)/g;
export const gridQueryToCqlQuery = (gridQuery: string) => {
  const fromGrid = gridQuery.replace(addPlusesToGridChips, "\+$1");
  return fromGrid;
};

export const cqlQueryToGridQuery = ({ content }: CqlQuery): string => {
  try {
    return content ? strFromBinary(content) : "";
  } catch (e) {
    return undefined;
  }
};

const strFromBinary = (binary: CqlBinary): string => {
  return (
    strFromExpr(binary.left) +
    (binary.right
      ? // Ignore the operator, which can only be OR
        ` ${strFromBinary(binary.right.binary)}`
      : "")
  );
};

const strFromExpr = (expr: CqlExpr) => {
  switch (expr.content.type) {
    case "CqlBinary":
      return strFromBinary(expr.content);
    case "CqlStr":
      return expr.content.searchExpr;
    case "CqlGroup":
      return `(${strFromBinary(expr.content.content)})`;
    case "CqlField":
      const polarity =
        expr.content.key.tokenType === "CHIP_KEY_NEGATIVE" ? "-" : "";
      const literalValue = expr.content.value?.literal ?? "";
      const maybeQuotedLiteralValue = literalValue.includes(" ")
        ? `"${literalValue}"`
        : literalValue;

      if (!maybeQuotedLiteralValue) {
        throw new SyntaxError("A field without a value is not valid in the Grid syntax");
      }

      return `${polarity}${expr.content.key.literal ?? ""}:${maybeQuotedLiteralValue}`;
  }
};
