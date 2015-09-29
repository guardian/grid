import angular from 'angular';

var presetLabelService = angular.module('kahuna.services.presetLabel', []);

presetLabelService.factory('presetLabelService',
                            ['$window', '$rootScope', function ($window, $rootScope) {

    const presetLabelsKey = 'preset labels';

    function getLabels() {
        return JSON.parse($window.localStorage.getItem(presetLabelsKey));
    }

    function setLabels(presetLabelList) {
        $window.localStorage.setItem(presetLabelsKey, JSON.stringify(presetLabelList));
        return $rootScope.$emit('events:preset-labels:updated');
    }

    return {
        getLabels,
        setLabels
    };

}]);

export default presetLabelService;
