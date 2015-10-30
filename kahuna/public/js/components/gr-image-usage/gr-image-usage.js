import angular from 'angular';
import moment from 'moment';

import template from './gr-image-usage.html!text';
import usageTemplate from './gr-image-usage-list.html!text';
import './gr-image-usage.css!';

export let module = angular.module('gr.imageUsage', []);

module.controller('grImageUsageCtrl', ['mediaUsage', function (mediaUsage) {
    let ctrl = this;

    mediaUsage.getUsage(ctrl.image).then(data => {
        ctrl.usage = {
            "published": {
                "length": 2,
                "data": [
                    {
                        "mediaId": "eba0837091206f0e433e251d72d0bbab350c54e7",
                        "source": {
                            "uri": "http://www.theguardian.com/books/2015/oct/30/martin-amis-jeremy-corbyn-humour-jonathan-coe",
                            "name": "Is Martin Amis right? Or will Jeremy Corbyn have the last laugh?"
                        },
                        "usageType": "web",
                        "mediaType": "Image",
                        "status": "published",
                        "dateAdded": "2015-10-30T14:30:55Z",
                        "lastModified": "2015-10-30T14:31:48Z"
                    },
                    {
                        "mediaId": "eba0837091206f0e433e251d72d0bbab350c54e7",
                        "source": {
                            "uri": "http://www.theguardian.com/books/2015/oct/30/martin-amis-jeremy-corbyn-humour-jonathan-coe",
                            "name": "Is Martin Amis right? Or will Jeremy Corbyn have the last laugh?"
                        },
                        "usageType": "web",
                        "mediaType": "Image",
                        "status": "published",
                        "dateAdded": "2015-10-30T14:30:55Z",
                        "lastModified": "2015-10-30T14:31:48Z"
                    }
                ]
            }
        };
    });

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
        transclude: true,
        scope: {
            image: '=grImage'
        }
    };
}]);

module.controller('grImageUsageListCtrl', [function () {
    let ctrl = this;

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
