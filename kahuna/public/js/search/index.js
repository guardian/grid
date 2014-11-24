import angular from 'angular';

import 'search/controller';
import 'search/query';

export var search = angular.module('kahuna.search', [
    'kahuna.search.controller',
    'kahuna.search.query'
]);
