import angular from 'angular';

import 'search/controller';
import 'search/query';
import 'search/results';

export var search = angular.module('kahuna.search', [
    'kahuna.search.controller',
    'kahuna.search.query',
    'kahuna.search.results'
]);
