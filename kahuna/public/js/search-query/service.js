import angular from 'angular';
import {mapFactory} from '../lib/data-structure/map-factory';

export const searchQueryService = angular.module('searchQuery.service', [
    mapFactory.name
]);

searchQueryService.factory('searchQueryService', ['$state', '$stateParams', 'mapFactory',
    function searchParams($state, $stateParams, mapFactory) {
        // TODO: Think about restricting these to:
        // ["ids", "archived", "nonFree", "uploadedBy", "until", "since", "offset",
        //  "length", "orderBy", "query"]
        // TODO: Make this start with the $stateParams
        const params = mapFactory();

        // As we want to have the side effect or a URL change happen irrespective of whether
        // we have subscription, we setup a `do` and create a hot observable to do so.
        const stateChange$ = params.state$.do(params => {
            $state.go('gr.search.results', params.toJS(), { notify: false });
        }).publish();
        stateChange$.connect();

        return params;
    }
]);
