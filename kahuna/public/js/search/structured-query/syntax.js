import {fieldFilter} from '../query-filter';

const parserRe = /(-?)(?:(?:([a-zA-Z]+):|(#)|(~))(?:([^ "']+)|"([^"]+)"|'([^']+)')|([a-zA-Z0-9]+)|"([^"]*)"|'([^']*)')/g;

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
            struct.push({
                type: 'text',
                value: text
            });
        }
    }
    return struct;
}

// Serialise a structured query into a plain string query
export function renderQuery(structuredQuery) {
    return structuredQuery.filter(item => item.value).map(item => {
        switch (item.type) {
        // Match both filters
        case 'static-filter':
        case 'filter':
            const filterExpr = fieldFilter(item.key, item.value);
            const prefix = (item.filterType === 'exclusion') ? '-' : '';
            return prefix + filterExpr;

        case 'text':
            return item.value;

        default:
            return '';
        }
    }).filter(token => token).join(' ').trim();
}
