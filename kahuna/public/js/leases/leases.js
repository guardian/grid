import angular from 'angular';
import template from './leases.html!text';
import '../util/rx';

import '../services/api/leases';
import './leases.css!';
import '../components/gr-confirm-delete/gr-confirm-delete.js';


export const leases = angular.module('kahuna.edits.leases', [
    'kahuna.services.lease',
    'kahuna.forms.datalist',
    'gr.confirmDelete',
    'util.rx'
]);


leases.controller(
    'LeasesCtrl',
    ['$window', '$q', '$scope', 'inject$', 'leaseService', '$rootScope',
    function($window, $q, $scope, inject$, leaseService, $rootScope) {
        let ctrl = this;
        ctrl.grSmall = true;
        ctrl.editing = false;
        ctrl.adding = false;

        ctrl.cancel = () => ctrl.editing = false;

        ctrl.save = () => {
            if (!ctrl.accessDefined()) {
                $window.alert('Please select an access type (Allow or Deny)');
            } else {
                ctrl.adding = true;
                ctrl.newLease.mediaId = ctrl.image.data.id;
                ctrl.newLease.createdAt = new Date();
                ctrl.newLease.access = ctrl.access;

                leaseService.add(ctrl.image, ctrl.newLease)
                    .then(() => {
                        ctrl.updateLeases(ctrl.image);
                    })
                    .catch(() =>
                        alertFailed('Something went wrong when saving, please try again!')
                    )
                    .finally(() => {
                        ctrl.editing = false;
                        ctrl.adding = false;
                        ctrl.resetLeaseForm();
                });
            }
        };


        ctrl.accessDefined = () => {
            return Boolean(ctrl.access ||  !!ctrl.newLease.access);
        };

        ctrl.updateLeases = (image) => {
            const leases$ = leaseService.getLeases(image)
                .map((leasesResponse) => leasesResponse.data);

            inject$($scope, leases$, ctrl, 'leases');
        };


        ctrl.delete = (lease) => {
            leaseService.deleteLease(lease)
                .then(() => ctrl.updateLeases(ctrl.image))
                .catch(
                    () => alertFailed('Something when wrong when deleting, please try again!')
                );

        };


        ctrl.updatePermissions = () => {
            leaseService.canUserEdit(ctrl.image).then(editable => {
                ctrl.userCanEdit = editable;
            });
        };


        ctrl.toolTip = (lease) => {
            const  leasedBy = Boolean(lease.leasedBy) ? `leased by: ${lease.leasedBy}` : ``;
            return leasedBy;
        };


        ctrl.resetLeaseForm = () => {
            const oneDayInMilliSeconds = (24 * 60 * 60 * 1000);
            ctrl.newLease = {
                mediaId: null,
                createdAt:  new Date(),
                startDate: new Date(Date.now() - oneDayInMilliSeconds),
                endDate: new Date(Date.now() + oneDayInMilliSeconds),
                access: null
            };
            ctrl.access = null;
        };


        ctrl.leaseStatus = (lease) => {
            const active = lease.active ? 'active ' : ' ';

            let current = '';
            if (ctrl.leases.current) {
                current = ctrl.leases.current.data.id == lease.id ? 'current ' : '';
            }
            const access = (lease.access.match(/allow/i)) ? 'allowed' : 'denied';

            return {
                active: active,
                current: current,
                access: access
            };
        };


        function alertFailed(message) {
            $window.alert(message);
            ctrl.adding = false;
        }

        $scope.$watch(() => ctrl.leases, () => {
            $rootScope.$emit('leases-updated', ctrl.leases);
        });

        ctrl.resetLeaseForm();
        ctrl.updatePermissions();
        ctrl.updateLeases(ctrl.image);
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
