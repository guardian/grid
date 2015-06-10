import apiServices from '../api';

apiServices.factory('editsApi', ['$q', 'mediaApi', function($q, mediaApi) {

    var root;

    function getRoot() {
        return root || (root = mediaApi.root.follow('edits'));
    }

    function getUsageRights() {
        return getRoot().follow('usageRightsList').getData();
    }

    return {
        getUsageRights
    };
}]);
