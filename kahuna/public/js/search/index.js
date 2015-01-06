import angular from 'angular';

import './query';
import './results';

import searchTemplate        from './view.html!text';
import searchResultsTemplate from './results.html!text';


export var search = angular.module('kahuna.search', [
    'kahuna.search.query',
    'kahuna.search.results'
]);


search.config(['$stateProvider',
               function($stateProvider) {

    $stateProvider.state('search', {
        // Virtual state, we always want to be in a child state of this
        abstract: true,
        url: '/',
        template: searchTemplate
    });
    $stateProvider.state('search.results', {
        url: 'search?query&ids&since&nonFree&archived&valid&uploadedBy',
        template: searchResultsTemplate,
        controller: 'SearchResultsCtrl',
        data: {
            title: function(params) {
                return params.query ? params.query : 'search';
            }
        }
    });
}]);
