import angular from 'angular';
import moment from 'moment';

import '../../util/rx';

import template from './gr-image-usage.html!text';
import usageTemplate from './gr-image-usage-list.html!text';

import '../../services/image/usages';

export const module = angular.module('gr.imageUsage', [
    'gr.image-usages.service',
    'util.rx'
]);

module.controller('grImageUsageCtrl', [
    '$scope',
    'inject$',
    'imageUsagesService',

    function ($scope, inject$, imageUsagesService) {

        const ctrl = this;

        const usages = imageUsagesService.getUsages(ctrl.image);

        const usages$ = usages.groupedByState$.map((u) => u.toJS());
        const usagesCount$ = usages.count$;

        ctrl.usageTypeToName = (usageType) => {
            switch (usageType) {
                case 'removed':
                    return 'Taken down';
                case 'pending':
                    return 'Pending publication';
                case 'published':
                    return 'Published';
                default:
                    return usageType;
            }
        };

        inject$($scope, usages$, ctrl, 'usages');
        inject$($scope, usagesCount$, ctrl, 'usagesCount');
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
