import angular from 'angular';

var presetLabelService = angular.module('kahuna.services.presetLabel', []);

presetLabelService.factory('presetLabelService',
                            ['$window', function ($window) {

    const presetLabelsKey = 'preset labels';

    function get() {
        return JSON.parse($window.localStorage.getItem(presetLabelsKey));
    }

    function set(presetLabelList) {
        return $window.localStorage.setItem(presetLabelsKey, JSON.stringify(presetLabelList));
    }

    return {
        get,
        set
    };

}]);

export default presetLabelService;
