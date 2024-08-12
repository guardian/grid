import angular from 'angular';
import {mediaApi} from './media-api';

export var editsApi = angular.module('kahuna.services.api.edits', [
    mediaApi.name
]);

editsApi.factory('editsApi', ['$q', 'mediaApi', function($q, mediaApi) {

    var root;
    var categories;
    var filteredCategories;

    function getRoot() {
        return root || (root = mediaApi.root.follow('edits'));
    }

    function getUsageRightsCategories() {
        return categories || (categories = getRoot().follow('usage-rights-list').getData());
    }

    function getFilteredUsageRightsCategories() {
      return filteredCategories || (filteredCategories = getRoot().follow('filtered-usage-rights-list').getData());
    }

    return {
        getUsageRightsCategories,
        getFilteredUsageRightsCategories
    };
}]);
