import angular from 'angular';
import template from './leases.html';
import moment from 'moment';

import '../util/rx';

import '../services/api/leases';
import './leases.css';
import '../components/gr-confirm-delete/gr-confirm-delete.js';


export const leases = angular.module('kahuna.edits.leases', [
    'kahuna.services.lease',
    'kahuna.forms.datalist',
    'gr.confirmDelete',
    'util.rx'
]);


leases.controller('LeasesCtrl', [
    '$window',
    '$q',
    '$scope',
    '$timeout',
    'inject$',
    'leaseService',
    'imageAccessor',
    'imageList',
    '$rootScope',
    'onValChange',
    function(
        $window,
        $q,
        $scope,
        $timeout,
        inject$,
        leaseService,
        imageAccessor,
        imageList,
        $rootScope,
        onValChange) {

        let ctrl = this;

        ctrl.$onInit = () => {
          ctrl.grSmall = true;
          ctrl.editing = false;
          ctrl.adding = false;
          ctrl.showCalendar = false;
          ctrl.receivingBatch = false;

          ctrl.midnightTomorrow = moment().add(1, 'days').startOf('day').toDate();

          ctrl.cancel = () => {
              ctrl.editing = false;
              ctrl.updateLeases();
          };

          ctrl.save = () => {
              if (!ctrl.accessDefined()) {
                  $window.alert('Please select an access type (Allow or Deny)');
              } else {
                  ctrl.adding = true;
                  ctrl.editing = false;

                  ctrl.newLease.createdAt = new Date();
                  ctrl.newLease.access = ctrl.access;

                  if (ctrl.access === 'deny-syndication') {
                      ctrl.newLease.startDate = null;
                  }

                  if (ctrl.access === 'allow-syndication') {
                      ctrl.newLease.endDate = null;

                      const noteWithClause = [
                          ctrl.noteCallAgencyClause ? 'CALL AGENCY' : undefined,
                          ctrl.notePremiumClause ? 'PREMIUM' : undefined,
                          ctrl.newLease.notes
                      ].filter(Boolean);

                      ctrl.newLease.notes = noteWithClause.join(', ');
                  }

                  const incomingLeaseIsSyndication = leaseService.isLeaseSyndication(ctrl);
                  const syndLeases = ctrl.leases.leases.filter((l) =>
                      l.access.endsWith('-syndication')
                  );

                  if (incomingLeaseIsSyndication && syndLeases.length > 0) {
                    const confirmText = ctrl.images.size > 1
                      ? "One or more of the selected images have syndication leases. " +
                        "These will be overwritten. Do you wish to proceed?"
                      : "This image already has a syndication lease. It will be overwritten. " +
                        "Do you wish to proceed?";
                    const shouldApplyLeases = $window.confirm(confirmText);
                    if (!shouldApplyLeases) {
                      return; // User has cancelled save.
                    }
                  }



                leaseService.batchAdd(ctrl.newLease, ctrl.images)
                  .catch((e) => {
                    console.error(e);
                    alertFailed('Something went wrong when saving, please try again.');
                  })
                    .finally(() => {
                      ctrl.resetLeaseForm();
                  });
              }
          };

          // These events allow this control to work as a hybrid on the upload page
          // Update from future: not very well.
          // Elaboration:
          // Firing this event causes every instance of this to respond,
          // After that response, each one sends the leases-updated message
          // Putting us in a quadratic quandry that's solved by making the handlers
          // debounce their sends, (see api/leases.js)
          // which also isn't ideal, but isn't quadratic either.
          const batchAddLeasesEvent = 'events:batch-apply:add-leases';
          const batchRemoveLeasesEvent = 'events:batch-apply:remove-leases';
          const rightsCatAddLeasesEvent = 'events:rights-category:add-leases';
          const rightsCatDeleteLeasesEvent = 'events:rights-category:delete-leases';

          //-handle rights cat assigned lease-
          $scope.$on(rightsCatAddLeasesEvent,
            (e, payload) => {
              let matchImages = ctrl.images.filter(img => img.data.id === payload.catLeases[0].mediaId);
              if (angular.isDefined(matchImages.toArray)) {
                matchImages = matchImages.toArray();
              };
              if (matchImages.length || payload.batch) {
                leaseService.replace(matchImages[0], payload.catLeases);
              }
            }
          );

          //-handle deletion of leases from previous rights category-
          $scope.$on(rightsCatDeleteLeasesEvent,
            (e, payload) => {
              if (payload.catLeases && 0 < payload.catLeases.length) {
                payload.catLeases.forEach(lease => {
                  leaseService.deleteLease(lease, ctrl.images);
                });
              }
            }
          );

          if (Boolean(ctrl.withBatch)) {
            $scope.$on(batchAddLeasesEvent,
                (e, leases) => {
                  ctrl.receivingBatch = true;
                  leaseService.replace(ctrl.images[0], leases);
                  // As the lease is about to be updated by the leases-updated event
                  // we don't want to reintegrate the result of this.
              });
              $scope.$on(batchRemoveLeasesEvent,
                () => {
                  ctrl.receivingBatch = true;
                  leaseService.clear(ctrl.images[0]);
                  // See above.
                });

              ctrl.batchApplyLeases = () => {
                if (ctrl.leases.leases.length > 0) {
                    $rootScope.$broadcast(batchAddLeasesEvent, ctrl.leases.leases);
                } else {
                    ctrl.confirmDelete = true;

                    $timeout(() => {
                        ctrl.confirmDelete = false;
                    }, 5000);
                }
              };

              ctrl.batchRemoveLeases = () => {
                  ctrl.confirmDelete = false;
                  $rootScope.$broadcast(batchRemoveLeasesEvent);
              };
          }

          ctrl.updateLeases = () => {
              if (!ctrl.editing) {
                  return leaseService.getLeases(ctrl.images)
                  .then((leaseByMedias) => {
                      ctrl.leases = leaseService.flattenLeases(leaseByMedias);
                      ctrl.editing = false;
                      ctrl.adding = false;
                      ctrl.receivingBatch = false;
                      });
              }
          };

          ctrl.accessDefined = () => {
              return Boolean(ctrl.access || !!ctrl.newLease.access);
          };


          ctrl.delete = (lease) => {
              ctrl.adding = true;
              leaseService.deleteLease(lease, ctrl.images)
                  .catch(
                      () => alertFailed('Something when wrong when deleting, please try again!')
                  );

          };

          ctrl.toolTip = (lease) => {
            return Boolean(lease.leasedBy) ? `leased by: ${lease.leasedBy}` : ``;
          };

          ctrl.inactiveLeases = (leases) => {
            leases ? leases.leases.filter((l) => !ctrl.isCurrent(l)).length : 0;
          };
          ctrl.activeLeases = (leases) => {
            leases ? leases.leases.filter((l) => ctrl.isCurrent(l)).length : 0;
          };

          ctrl.resetLeaseForm = () => {
              ctrl.newLease = {
                  mediaId: null,
                  createdAt:  new Date(),
                  startDate: null,
                  endDate: null,
                  access: null
              };
              ctrl.access = null;
              ctrl.showCalendar = false;
          };

          ctrl.formatStartTimestamp = (timestamp) => {
              if (timestamp) {
                  const fromNow = moment(timestamp).fromNow();

                  return moment(timestamp).diff(moment()) > 0
                      ? `Starts ${fromNow}`
                      : `Started ${fromNow}`;
              }
          };

          ctrl.formatEndTimestamp = (timestamp) => {
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

          ctrl.isCurrent = (lease) => lease.active && lease.access.match(/-use/i);

          ctrl.leaseClass = (lease) => {
            const names = [...lease.access.split('-'), lease.active ? 'active' : 'inactive'];
            return names.map(name => `lease__${name}`).join(' ');
          };

          ctrl.leaseStatus = (lease) => {
              const active = lease.active ? 'active ' : ' ';

              // Current only makes sense for use leases
              const current = ctrl.isCurrent(lease) ? 'current' : '';

              const access = (lease.access.match(/allow/i)) ? 'allowed' : 'denied';

              return {
                  active: active,
                  current: current,
                  access: access
              };
          };

          ctrl.leaseName = (lease) => {
              const leasesNameMappings = {
                  'allow-use':  'Allow use',
                  'deny-use': 'Deny use',
                  'allow-syndication': 'Allow syndication',
                  'deny-syndication': 'Deny syndication'
              };

              return leasesNameMappings[lease.access];
          };

          function alertFailed(message) {
              $window.alert(message);
              ctrl.adding = false;
          }

          // When this is called, every image component refeshes itself.
          // Consider matching first.
          $rootScope.$on('leases-updated', () => {
              ctrl.updateLeases();
          });

          $scope.$watchCollection(() => Array.from(ctrl.images), (images) => {
              ctrl.totalImages = images.length;
              ctrl.updateLeases();
          });

          function getDefaultExpiryDate(leaseType) {
              const inTwoDays = moment().add(2, 'days').endOf('day').toDate();

              return ['allow-use', 'deny-use'].includes(leaseType) ? inTwoDays : null;
          }

          $scope.$watch(() => ctrl.access, onValChange(selectedLeaseType => {
              ctrl.newLease.endDate = getDefaultExpiryDate(selectedLeaseType);
          }));

          ctrl.resetLeaseForm();
        };
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
            leasesUpdatedByTemplate: '=?grLeasesUpdatedByTemplate',
            adding: '=?grLeasesUpdatingByTemplate',
            updatedLeases: '=?grUpdatedLeases',
            userCanEdit: '=?grUserCanEdit',
            onCancel: '&?grOnCancel',
            onSave: '&?grOnSave',
            withBatch: '=?'
        }
    };
}]);
