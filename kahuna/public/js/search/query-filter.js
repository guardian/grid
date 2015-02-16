import angular from 'angular';

export var queryFilters = angular.module('kahuna.search.filters.query', []);

var containsSpace = s => / /.test(s);
var stripQuotes = s => s.replace(/["']/g, '');

queryFilters.filter('queryFilter', function() {
    return (value, field) => {
        let cleanValue = stripQuotes(value);
        if (containsSpace(cleanValue)) {
            return `${field}:"${cleanValue}"`;
        } else {
            return `${field}:${cleanValue}`;
        }
    };
});

queryFilters.filter('queryLabelFilter', function() {
    return (value) => {
        let cleanValue = stripQuotes(value);
        if (containsSpace(cleanValue)) {
            return `label:"${cleanValue}"`;
        } else {
            return `#${cleanValue}`;
        }
    };
});
