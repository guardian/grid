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

queryFilters.factory('searchWithModifiers',
  ['$state', '$stateParams', 'storage',
  function($state, $stateParams, storage) {
    function updateQueryWithModifiers(field, fieldValue, alt, shift, prevQuery) {
      if (alt && prevQuery) {
        return `${prevQuery} -${fieldFilter(field, fieldValue)}`;
      }
      if (alt) {
        return `-${fieldFilter(field, fieldValue)}`;
      }
      if (shift && prevQuery) {
        return `${prevQuery} ${fieldFilter(field, fieldValue)}`;
      }
      return fieldFilter(field, fieldValue);
    }

    return  ($event, fieldName, fieldValue) => {
      const alt = $event.getModifierState('Alt');
      const shift = $event.getModifierState('Shift');
      if (alt || shift) {
        $event.preventDefault();
        const nonFree = storage.getJs("isNonFree", true) ? true : undefined;

        return $state.go('search.results', {
          query: updateQueryWithModifiers(fieldName, fieldValue, alt, shift, $stateParams.query),
          nonFree: nonFree
        });
      }
    };
  }]);

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
