import angular from 'angular';

export const collectionsService = angular.module('gr.collections.service', []);

collectionsService.factory('collectionsService', ['$q', function($q) {

    function add(collection) {
    }

    function remove(collection) {
    }

    function apply(collection, image) {
    }

    function getTree() {
    }

    return {
        add,
        remove,
        apply,
        getTree
    }
}]);
