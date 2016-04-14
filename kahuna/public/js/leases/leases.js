import angular from 'angular';
import template from './leases.html!text';

import '../services/lease';
import './leases.css!';
import '../components/gr-confirm-delete/gr-confirm-delete.js';


export var leases = angular.module('kahuna.edits.leases', [
    'kahuna.services.lease',
    'kahuna.forms.datalist',
    'gr.confirmDelete'
]);


leases.controller(
    'LeasesCtrl',
    ['$q', '$scope', 'inject$', 'leaseService',
    function($q, $scope, inject$, leaseService) {
        let ctrl = this;
        ctrl.grSmall = true;
        ctrl.editing = false;
        ctrl.adding = false;
        ctrl.cancel = () => ctrl.editing = false;

        ctrl.save = () => {
            ctrl.adding = true;

            leaseService.add(ctrl.image, ctrl.newLease)
                // .then(image => {
                //     ctrl.image = image;
                //     reset();
                // })
                // .catch(saveFailed)
                // .finally(() => ctrl.adding = false);
        }

        ctrl.newLease = {};

        ctrl.leases = [
            {
                "type": "usable", // or not
                "dateType": "before", // or "after",
                "date" : new Date()
            }, {
                "type": "unusable", // or not
                "dateType": "after", // or "after",
                "date" : new Date()
            }
        ]

        ctrl.delete = (lease) => {
            ctrl.leases = ctrl.leases.filter((l) => {
                l.date == lease.date &&
                l.type == lease.type &&
                l.dateType == lease.dateType
            })
        }

        function saveFailed() {
            $window.alert('Something went wrong when saving, please try again!');
        }

}]);



leases.directive('grLeases', [function() {
    return {
        restrict: 'E',
        controller: 'LeasesCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template,
        scope: {
            image: '=grImage',
            grSmall: '=?',
            onCancel: '&?grOnCancel',
            onSave: '&?grOnSave'
        }
    };
}]);
