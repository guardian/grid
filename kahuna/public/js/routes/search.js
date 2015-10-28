import angular from 'angular';

import '../query/query';
import searchTemplate from '../search/view.html!text';

// TODO: do better things with these deps
import '../components/gr-top-bar/gr-top-bar';

export const searchRouter = angular.module('gr.routes.search', [
    'kahuna.search.query',
    'gr.topBar'
]);

searchRouter.config(['$stateProvider', function($stateProvider) {
    // Everything will be a sub-route of search as we need to keep
    // people in context of where they have asked to be i.e. within their search
    $stateProvider.state('search', {
        abstract: true,
        url: '/?query&ids&since&nonFree&uploadedBy&until&orderBy',
        template: searchTemplate
    });
}]);
