import angular from 'angular';
import Rx from 'rx';
import Immutable from 'immutable';
import template from './leases.html!text';
import moment from 'moment';

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
                ctrl.newLease.createdAt = new Date();
                ctrl.newLease.access = ctrl.access;

                leaseService.batchAdd(ctrl.newLease, ctrl.leases, ctrl.images)
                    .catch(() =>
                        alertFailed('Something went wrong when saving, please try again.')
                    )
                    .finally(() => {
                        ctrl.resetLeaseForm();
                });
            }
        };

        ctrl.updateLeases = () => {
            leaseService.getLeases(ctrl.images)
                .then((leaseByMedias) => {
                    ctrl.editing = false;
                    ctrl.adding = false;
                    ctrl.leases = leaseService.flattenLeases(leaseByMedias);
                });
        };

        ctrl.accessDefined = () => {
            return Boolean(ctrl.access || !!ctrl.newLease.access);
        };


        ctrl.delete = (lease) => {
            ctrl.adding = true;
            leaseService.deleteLease(lease, ctrl.leases, ctrl.images)
                .catch(
                    () => alertFailed('Something when wrong when deleting, please try again!')
                );

        };

        ctrl.toolTip = (lease) => {
            const  leasedBy = Boolean(lease.leasedBy) ? `leased by: ${lease.leasedBy}` : ``;
            return leasedBy;
        };

        ctrl.inactiveLeases = (leases) => leases.leases.length - leases.current.length;

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

        ctrl.formatTimestamp = (timestamp) => {
            if (timestamp){
                const fromNow = moment(timestamp).fromNow();
                if (moment(timestamp).diff(moment()) > 0) {
                    return 'Expires ' + fromNow;
                } else {
                    return 'Expired ' + fromNow;
                }
            } else {
                return 'Never expires';
            }
        };

        ctrl.leaseStatus = (lease) => {
            const active = lease.active ? 'active ' : ' ';

            const current = ctrl.leases.current
                .filter((lease) => lease !== null)
                .find(l => l.id == lease.id) ? 'current ' : '';

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

        $rootScope.$on('leases-updated', () => {
            ctrl.updateLeases();
        });

        $scope.$watch(() => ctrl.images.length, () => {
            ctrl.updateLeases();
        });

        ctrl.resetLeaseForm();
        ctrl.updateLeases();
}]);

leases.directive('grLeases', [function() {
    return {
        restrict: 'E',
        controller: 'LeasesCtrl',
        controllerAs: 'ctrl',
        bindToController: true,
        template: template,
        scope: {
            images: '=grImages',
            userCanEdit: '=?grUserCanEdit',
            onCancel: '&?grOnCancel',
            onSave: '&?grOnSave'
        }
    };
}]);
