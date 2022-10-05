import {fieldFilter, maybeQuoted} from '../query-filter';
import {getLabel, getCollection} from '../../search-query/query-syntax';

// Line too long for eslint, but can't break it down..
/*eslint-disable max-len */
const parserRe = /(-?)(?:(?:([a-zA-Z@><]+):|(#)|(~))(?:([^ "']+)|"([^"]+)"|'([^']+)')|([a-zA-Z0-9]+)|"([^"]*)"|'([^']*)')/g;
/*eslint-enable max-len */
// TODO: expose the server-side query parser via an API instead of
// replicating it poorly here
export function structureQuery(query) {
    const struct = [];
    let m;
    while ((m = parserRe.exec(query)) !== null) {
        const sign  = m[1];
        const field = m[2];
        const symbol  = m[3] || m[4];
        const value = m[5] || m[6] || m[7];
        const text  = m[8] || m[9] || m[10];

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
                value: prepend + text
            });
        }
    }

    return orderChips(struct);
}

function orderChips(structuredQuery){
    const filterChips = structuredQuery.filter(e => e.type !== 'text');
    const textChipsValues = mergeTextValues(structuredQuery);
    const textChip = {
        type: 'text',
        value: textChipsValues
    };

    const cleanStruct = [textChip].concat(filterChips);

    function mergeTextValues(chips){
        return chips.filter(e => e.type === 'text')
            .map(e => e.value)
            .join(' ');
    }

    return cleanStruct;
}

function renderFilter(field, value) {
    switch (field) {
    case 'label':      return getLabel(value);
    case 'collection': return getCollection(value);
    case 'any':        return maybeQuoted(value);
    default:           return fieldFilter(field, value);
    }
}

// Serialise a structured query into a plain string query
export function renderQuery(structuredQuery) {
    return structuredQuery.filter(item => item.value).map(item => {
        switch (item.type) {
        // Match both filters
        case 'static-filter':
        case 'filter':
            const prefix = (item.filterType === 'exclusion') ? '-' : '';
            const filterExpr = renderFilter(item.key, item.value);
            return prefix + filterExpr;

        case 'text':
            return item.value;

        default:
            return '';
        }
    }).filter(token => token).join(' ').trim();
}
