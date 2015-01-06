import angular from 'angular';

import './query';
import './results';

export var search = angular.module('kahuna.search', [
    'kahuna.search.query',
    'kahuna.search.results'
]);
