import angular from 'angular';
import moment from 'moment';

import template from './gr-image-usage.html!text';
import usageTemplate from './gr-image-usage-list.html!text';
import './gr-image-usage.css!';

import '../../services/image/usages';

export const module = angular.module('gr.imageUsage', [
    'gr.image-usages.service'
]);

module.controller('grImageUsageCtrl', [
    'imageUsagesService',

    function (imageUsagesService) {

        const ctrl = this;

        ctrl.usage = imageUsagesService(ctrl.image).groupedByState;

        ctrl.usageTypeToName = (usageType) => {
            switch (usageType) {
                case 'pending':
                    return 'Pending publication';
                case 'published':
                    return 'Published';
                default:
                    return usageType;
            }
        };
}]);

module.directive('grImageUsage', [function() {
    return {
        restrict: 'E',
        template: template,
        controller: 'grImageUsageCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            image: '=grImage'
        }
    };
}]);

module.controller('grImageUsageListCtrl', [function () {
    const ctrl = this;

    ctrl.formatTimestamp = (timestamp) => {
        return moment(timestamp).fromNow();
    };
}]);


module.directive('grImageUsageList', [function () {
    return {
        restrict: 'E',
        template: usageTemplate,
        controller: 'grImageUsageListCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        scope: {
            type: '=',
            usages: '='
        }
    };
}]);
