import angular from 'angular';
import {searchQueryService} from '../search-query/service';

// Use the name once that PR in merged in
import '../services/api/media-api';

export const indexRoute = angular.module('gr.routes.index', []);

indexRoute.config(['$stateProvider', '$urlMatcherFactoryProvider',
    function($stateProvider, $urlMatcherFactoryProvider) {

        const zeroWidthSpace = /[\u200B]/g;
        function removeUtf8SpecialChars(val) {
            return angular.isDefined(val) && val.replace(zeroWidthSpace, '');
        }
        $urlMatcherFactoryProvider.type('Query', {
            encode: val => removeUtf8SpecialChars(val),
            decode: val => removeUtf8SpecialChars(val),
            //call decode value that includes zero-width-space character
            is: val => angular.isDefined(val) && !zeroWidthSpace.test(val)
        });

        $stateProvider.state('gr', {
            url: '?{query:Query}&ids&since&nonFree&uploadedBy&until&orderBy',
            abstract: true,
            template: `<ui-view />`,
            resolve: {
                searchResults$: ['searchQueryService', 'mediaApi', function(searchQueryService, mediaApi) {
                    const searchResults$ = searchQueryService.state$.flatMap(params =>
                        Rx.Observable.fromPromise(mediaApi.search(params.get('query'), params.delete('query').toJS()))
                    );

                    return searchResults$;
                }]
            }
        })
}]);



indexRoute.run(['$rootScope', '$state', function($rootScope, $state) {
    $rootScope.$on('$stateChangeError', function (event, toState, toParams, fromState, fromParams, error) {
        console.log(error)
    });
}]);
