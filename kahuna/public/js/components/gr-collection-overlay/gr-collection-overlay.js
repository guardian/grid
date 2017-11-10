import angular from 'angular';

import template from './gr-collection-overlay.html';
import './gr-collection-overlay.css';

import {collectionsApi} from '../../services/api/collections-api';

export const collectionOverlay = angular.module('gr.collectionOverlay', [
    collectionsApi.name
]);


collectionOverlay.controller('GrCollectionOverlay', ['$scope', '$timeout', 'collections',

    function($scope, $timeout, collections) {

        let ctrl = this;

        ctrl.openCollectionTree = openCollectionTree;
        ctrl.addToCollection = addToCollection;


        function openCollectionTree() {
            ctrl.addCollection = true;

            collections.getCollections().then(collections => {
                ctrl.collections = collections.data.children;
                // this will trigger the remember-scroll-top directive to return
                // users to their previous position on the collections panel
                // once the tree has been rendered
                $timeout(() => {
                    $scope.$broadcast('gr:remember-scroll-top:apply');
                });
            }, () => {
                // TODO: More informative error handling
                // TODO: Stop error propagating to global error handler
                ctrl.error = true;
            }).catch(() => ctrl.collectionError = true);

        }

        function addToCollection(collection) {
            collections.addCollectionToImage(ctrl.image, collection);
            //this isn't needed when called from batch apply
            ctrl.addCollection = false;
        }
    }
]);

collectionOverlay.directive('grCollectionOverlay', [function(){
    return {
        restrict: 'E',
        controller: 'GrCollectionOverlay',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template,
        scope: {
            image: '='
        }
    };

}]);
