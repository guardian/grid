import angular from 'angular';

import 'search/query';
import 'search/results';

export var search = angular.module('kahuna.search', [
    'kahuna.search.query',
    'kahuna.search.results'
]);
