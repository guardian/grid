import angular from 'angular';
import template from './leases.html!text';
import '../util/rx';

import '../services/api/leases';
import './leases.css!';
import '../components/gr-confirm-delete/gr-confirm-delete.js';


export var leases = angular.module('kahuna.edits.leases', [
    'kahuna.services.lease',
    'kahuna.forms.datalist',
    'gr.confirmDelete',
    'util.rx'
]);


leases.controller(
    'LeasesCtrl',
    ['$window', '$q', '$scope', 'inject$', 'leaseService',
    function($window, $q, $scope, inject$, leaseService) {
        let ctrl = this;
        ctrl.grSmall = true;
        ctrl.editing = false;
        ctrl.adding = false;

        ctrl.cancel = () => ctrl.editing = false;

        ctrl.save = () => {
            if (ctrl.access == null) {
                $window.alert("Please select an access type (Allow or Deny)");
            } else {
                ctrl.adding = true;
                ctrl.newLease.mediaId = ctrl.image.data.id;
                ctrl.newLease.createdAt = new Date();
                ctrl.newLease.access = ctrl.access;

                leaseService.add(ctrl.image, ctrl.newLease)
                    .then((lease) => {
                        ctrl.getLeases(ctrl.image);
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
        }



        ctrl.getLeases = (image) => {
            const leases$ = leaseService.get(image)
                .map((leasesResponse) => leasesResponse.data)

            inject$($scope, leases$, ctrl, 'leases');
        }

        ctrl.delete = (lease) => {
            leaseService.deleteLease(lease)
                .then((lease) => ctrl.getLeases(ctrl.image))
                .catch(
                    () => alertFailed('Something when wrong when deleting, please try again!')
                )

        }


        ctrl.updatePermissions = () => {
            leaseService.canUserEdit(ctrl.image).then(editable => {
                ctrl.userCanEdit = editable;
            });
        }

        ctrl.displayLease = (lease) => {
            if (lease) {
                const access = !!lease.access.match(/deny/i) ? "Denied" : "Allowed";
                let displayString = `${access}`

                if(lease.startDate){
                    displayString += ` after ${lease.startDate.split("T")[0]}`
                }

                if(lease.startDate && lease.endDate){
                    displayString += ` and`
                }

                if(lease.endDate){
                    displayString += ` before ${lease.endDate.split("T")[0]}`
                }

                return displayString
            }
        }

        ctrl.toolTip = (lease) => {
            const notes = Boolean(lease.notes) ? `notes: ${lease.notes}` : ``
            const leasedBy = Boolean(lease.leasedBy) ? `leased by: ${lease.leasedBy}` : ``
            return notes + leasedBy
        }

        ctrl.resetLeaseForm = () => {
            const oneDayInSeconds = (24 * 60 * 60);
            ctrl.newLease = {
                mediaId: null,
                createdAt:  new Date(),
                startDate: new Date(Date.now() - oneDayInSeconds),
                endDate: new Date(),
                access: null
            }
        }

        ctrl.leaseStatus = (lease) => {
            const active = lease.active ? "active " : " "
            const current = ctrl.leases.current.data.id == lease.id ? "current " : " "

            if (lease.access.match(/allow/i)) return current + active + "allowed";
            if (lease.access.match(/deny/i)) return current + active + "denied";
        }

        function alertFailed(message) {
            $window.alert(message);
            ctrl.adding = false;
        }

        ctrl.resetLeaseForm();
        ctrl.updatePermissions();
        ctrl.getLeases(ctrl.image);
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
