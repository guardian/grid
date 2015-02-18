import angular from 'angular';

import './query';
import './results';
import '../preview/image';

import searchTemplate        from './view.html!text';
import searchResultsTemplate from './results.html!text';


export var search = angular.module('kahuna.search', [
    'kahuna.search.query',
    'kahuna.search.results',
    'kahuna.preview.image'
]);

// TODO: add a resolver here so that if we error (e.g. 401) we don't keep trying
// to render - similar to the image controller see:
// https://github.com/guardian/media-service/pull/478
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
