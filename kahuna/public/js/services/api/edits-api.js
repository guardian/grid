import apiServices from '../api';

apiServices.factory('editsApi', ['$q', 'mediaApi', function($q, mediaApi) {

    var root;
    var categories;

    function getRoot() {
        return root || (root = mediaApi.root.follow('edits'));
    }

    function getUsageRightsCategories() {
        return categories || (categories = getRoot().follow('usageRightsList').getData());
    }

    return {
        getUsageRightsCategories
    };
}]);
