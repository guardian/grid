const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Matches exactly one of `values`, for a `defineParameterType` regexp. A value outside the
 * list leaves the step undefined, so bddgen reports the typo.
 */
export const oneOf = (values: readonly string[]): RegExp =>
  new RegExp(values.map(escapeRegExp).join('|'));

/** As `oneOf`, but the value is written in double quotes, e.g. `"published"`. */
export const quotedOneOf = (values: readonly string[]): RegExp =>
  new RegExp(`"(${values.map(escapeRegExp).join('|')})"`);
