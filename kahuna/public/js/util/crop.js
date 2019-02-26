import angular from 'angular';

const STORAGE_KEY = 'cropType';

export const cropUtil = angular.module('util.crop', ['util.storage']);

// freeze available crop types based on `cropType` query string
cropUtil.factory('cropType', ['storage', function(storage) {
    function set(cropType) {
        if (!cropType) {
            return;
        }

        // TODO validate input, if invalid crop name, clear storage?
        cropType === 'all'
            ? storage.clearJs(STORAGE_KEY)
            : storage.setJs(STORAGE_KEY, cropType, true);
    }

    function get() {
        return storage.getJs(STORAGE_KEY, true);
    }

    return {
        set,
        get
    };
}]);
