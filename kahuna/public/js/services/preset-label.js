import angular from 'angular';

var presetLabelService = angular.module('kahuna.services.presetLabel', []);

presetLabelService.factory('presetLabelService',
                            ['$window', function ($window) {

    const presetLabelsKey = 'preset labels';

    function getLabels() {
        return JSON.parse($window.localStorage.getItem(presetLabelsKey));
    }

    function setLabels(presetLabelList) {
        $window.localStorage.setItem(presetLabelsKey, JSON.stringify(presetLabelList));
    }

    return {
        getLabels,
        setLabels
    };

}]);

export default presetLabelService;
