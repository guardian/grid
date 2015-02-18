import angular from 'angular';
import 'angular-ui-router-extras';

import './query';
import './results';
import '../preview/image';

import searchTemplate        from './view.html!text';
import searchResultsTemplate from './results.html!text';


export var search = angular.module('kahuna.search', [
    'ct.ui.router.extras.dsr',
    'kahuna.search.query',
    'kahuna.search.results',
    'kahuna.preview.image'
]);

search.config(['$stateProvider',
               function($stateProvider) {

    $stateProvider.state('search', {
        // Virtual state, we always want to be in a child state of this
        template: searchTemplate,
        deepStateRedirect: true
    });

    $stateProvider.state('search.results', {
        url: '/search?query&ids&since&nonFree&archived&valid&uploadedBy',
        template: searchResultsTemplate,
        controller: 'SearchResultsCtrl',
        data: {
            title: function(params) {
                return params.query ? params.query : 'search';
            }
        }
    });
}]);

search.run(['$rootScope', '$location', function($rootScope, $location) {
    $rootScope.$location = $location;
}]);
