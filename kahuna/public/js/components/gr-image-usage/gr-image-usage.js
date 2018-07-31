import angular from 'angular';
import moment from 'moment';

import '../../util/rx';

import template from './gr-image-usage.html';
import usageTemplate from './gr-image-usage-list.html';
import './gr-image-usage.css';

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
                case 'front_usage':
                    return 'Front usage';
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

module.controller('grImageUsageListCtrl', [
    'imageUsagesService',
    function (imageUsagesService) {
    const ctrl = this;

    ctrl.formatTimestamp = (timestamp) => {
        return moment(timestamp).fromNow();
    };

    ctrl.isRecent = (timestamp) => {
        const nowtime = new Date();
        return moment(timestamp)
            .isAfter(moment(nowtime).subtract(imageUsagesService.recentTime, 'days'));
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
