import angular from 'angular';

import {getCollection} from '../search-query/query-syntax';

export var queryFilters = angular.module('kahuna.search.filters.query', []);

const containsSpace = s => / /.test(s);
const stripDoubleQuotes = s => s?.replace?.(/"/g, '');

export function maybeQuoted(value) {
    if (containsSpace(value)) {
        return `"${value}"`;
    } else {
        return value;
    }
}

export function fieldFilter(field, value) {
    const cleanValue = stripDoubleQuotes(value);
    const valueMaybeQuoted = maybeQuoted(cleanValue);
    return `${field}:${valueMaybeQuoted}`;
}

queryFilters.filter('queryFilter', function() {
    return (value, field) => fieldFilter(field, value);
});

queryFilters.filter('queryLabelFilter', function() {
    return (value) => {
        const cleanValue = stripDoubleQuotes(value);
        if (containsSpace(cleanValue)) {
            return `#"${cleanValue}"`;
        } else {
            return `#${cleanValue}`;
        }
    };
});

queryFilters.filter('queryKeywordFilter', function() {
    return (value) => {
        const cleanValue = stripDoubleQuotes(value);
        if (containsSpace(cleanValue)) {
            return `#"${cleanValue}"`;
        } else {
            return `#${cleanValue}`;
        }
    };
});

queryFilters.filter('queryCollectionFilter', function() {
    return path => getCollection(path);
});
