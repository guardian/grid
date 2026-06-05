import {fieldFilter, maybeQuoted} from '../query-filter';
import {getLabel, getCollection} from '../../search-query/query-syntax';

// Line too long for eslint, but can't break it down..
/*eslint-disable max-len */
const parserRe = /(-?)(?:(?:([\p{L}@><]+):|"([^"]+)":|'([^']+)':|(#)|(~))(?:([^ "']+)|"([^"]+)"|'([^']+)')|([\p{L}0-9]+)|"([^"]*)"|'([^']*)')/gu;
/*eslint-enable max-len */
const falsyValuesToEmptyString = (value: string | null | undefined) => {
    if (!value){
        return '';
    } else {
        return value.toString();
    }
};

export type FilterType = 'inclusion' | 'exclusion';

type StructuredQueryFilter = {
  type: 'filter' | 'static-filter' | 'collection'
  filterType?: FilterType,
  key: string,
  value: string
}

type StructuredQueryText = {
  type: 'text'
  filterType?: FilterType,
  value: string
}

export type StructuredQuery = (StructuredQueryFilter | StructuredQueryText)[];

// This is intentionally lower-level than structureQuery(). The UI-oriented
// structureQuery() merges all text tokens into a single text chip and preserves
// negation by prefixing the text value with '-', which loses the distinction
// between positive free text and negated-only text. AI search needs that
// distinction so the frontend matches the backend rule: only positive unfielded
// text counts as a valid semantic query.
// i.e. `fileType:jpeg -hello` = not valid AI query
// but `cats fileType:jpeg -hello` is!
export function hasPositiveAiTextQuery(query: string) {
    let m;
    if (query === undefined) {
        return false;
    }

    parserRe.lastIndex = 0;
    while ((m = parserRe.exec(query)) !== null) {
        const sign  = m[1];
        const field = m[2] || m[3] || m[4];
        const symbol  = m[5] || m[6];
        const text  = m[10] || m[11] || m[12];
        const key = {
            '#': 'label',
            '~': 'collection'
        if (!key && sign !== '-' && falsyValuesToEmptyString(text).trim()) {
            parserRe.lastIndex = 0;
            return true;
        }

    return false;
}

export function hasSimilarAndPositiveAiTextQuery(query: string) {
    return hasValidSimilarQuery(query) && hasPositiveAiTextQuery(query);
}

export function hasValidSimilarQuery(query: string) {
    let m;
    if (query === undefined) {
        return false;
    }

    parserRe.lastIndex = 0;
    while ((m = parserRe.exec(query)) !== null) {
        const field = m[2] || m[3] || m[4];
        const symbol  = m[5] || m[6];
        const value = m[7] || m[8] || m[9];
        const key = {
            '#': 'label',
            '~': 'collection'
        if (key === 'similar' && falsyValuesToEmptyString(value).trim()) {
            parserRe.lastIndex = 0;
            return true;
        }

    return false;
}

// TODO: expose the server-side query parser via an API instead of
// replicating it poorly here
export function structureQuery(query: string) {

    const struct: StructuredQuery = [];
    let m;
    if (query === undefined) {
        return struct;
    }
    while ((m = parserRe.exec(query)) !== null) {
        const sign  = m[1];
        const field = m[2] || m[3] || m[4];
        const symbol  = m[5] || m[6];
        const value = m[7] || m[8] || m[9];
        const text  = m[10] || m[11] || m[12];
        const key = {
            '#': 'label',
            '~': 'collection'
        }[symbol] || field;
        if (key) {
            // We don't want editable collection filters
            const type = key === 'collection' ? 'static-filter' : 'filter';
            const filterType = sign === '-' ? 'exclusion' : 'inclusion';
            struct.push({
                type: type,
                filterType: filterType,
                key: key,
                value: value
            });
        } else {
            // Maintain negatable "any" search as text
            const prepend = (sign === '-' ? '-' : '');
            struct.push({
                type: 'text',
                value: prepend + falsyValuesToEmptyString(text)
            });
        }
    }

    return orderChips(struct);
}

function orderChips(structuredQuery: StructuredQuery){
    const filterChips = structuredQuery.filter(e => e.type !== 'text');
    const textChipsValues = mergeTextValues(structuredQuery);
    const textChip = {
        type: 'text',
        value: textChipsValues
    };

    const cleanStruct = [textChip].concat(filterChips);

    function mergeTextValues(chips: StructuredQuery){
        return chips.filter(e => e.type === 'text')
            .map(e => e.value)
            .join(' ');
    }

    return cleanStruct;
}

function renderFilter(field: string, value: string) {
    switch (field) {
    case 'label':      return getLabel(value);
    case 'collection': return getCollection(value);
    case 'any':        return maybeQuoted(value);
    default:           return fieldFilter(field, value);
    }
}

// Serialise a structured query into a plain string query
export function renderQuery(structuredQuery: StructuredQuery) {
    return structuredQuery.filter(item => item.value).map(item => {
      const prefix = (item.filterType === 'exclusion') ? '-' : '';
        switch (item.type) {
        // Match both filters
        case 'static-filter':
        case 'filter':
            const filterExpr = renderFilter(item.key, item.value);
            return prefix + filterExpr;
        case 'text':
            return prefix + item.value;
        default:
            return '';
        }
    }).filter(token => token).join(' ').trim();
}
