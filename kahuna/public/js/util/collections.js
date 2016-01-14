import angular from 'angular';

export const collectionsUtil = angular.module('util.collections', []);

collectionsUtil.factory('collectionsEnabled', ['$window', function($window){
    // TODO: Remove this once we're happy with the collections panel
    return $window.localStorage.getItem('showCollectionsPanel') === 'true';
}])
