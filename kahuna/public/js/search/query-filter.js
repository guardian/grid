import angular from 'angular';

import {getCollection} from '../search-query/query-syntax';

export var queryFilters = angular.module('kahuna.search.filters.query', []);

var containsSpace = s => / /.test(s);
var stripDoubleQuotes = s => s.replace(/"/g, '');

queryFilters.filter('queryFilter', function() {
    return (value, field) => {
        const cleanValue = stripDoubleQuotes(value);
        if (containsSpace(cleanValue)) {
            return `${field}:"${cleanValue}"`;
        } else {
            return `${field}:${cleanValue}`;
        }
    };
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

queryFilters.filter('queryCollectionFilter', function() {
    return path => getCollection(path);
});
