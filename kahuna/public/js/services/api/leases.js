import angular from 'angular';
import './media-api';
import '../../services/image-list';

import {service} from '../../edits/service';

var leaseService = angular.module('kahuna.services.lease', [
  service.name
  ]);

leaseService.factory('leaseService', [
  '$rootScope',
  '$q',
  'imageAccessor',
  'imageList',
  'mediaApi',
  'editsService',
  'apiPoll',
  function ($rootScope, $q, imageAccessor, imageList, mediaApi, editsService, apiPoll) {
    let leasesRoot;
    function getLeasesRoot() {
        if (!leasesRoot) {
            leasesRoot = mediaApi.root.follow('leases');
        }
        return leasesRoot;
    }

    function getLeases(images) {
      // search page has fancy image list
      if (angular.isDefined(images.toArray)) {
        images = images.toArray();
      }
      return $q.all(images.map(i => i.get()))
          .then( (images) => imageList.getLeases(images) );
      }

    function clear(image) {
        const images = [image];
        const currentLeases = getLeases(images);

        return currentLeases.then((originalLeases) => {

            const originalLeaseCount = originalLeases[0].leases.length;

            return image
                .perform('delete-leases')
                .then((op) => {
                    return {
                        op,
                        originalLeaseCount
                    };
                });
        }).then((op) => {
            pollLeases(images, op.originalLeaseCount);
        });
    }

    function replace(image, leases) {
        const images = [image];
        const currentLeases = getLeases(images);

        return currentLeases.then((originalLeases) => {

            const originalLeaseCount = originalLeases[0].leases.length;

            const updatedLeases = leases.map((lease) => {
                var newLease = angular.copy(lease);
                newLease.mediaId = image.data.id;
                return newLease;
            });

            return image
                .perform('replace-leases', {body: updatedLeases})
                .then((op) => {
                    return {
                        op,
                        originalLeaseCount
                    };
                });
        }).then((op) => {
            pollLeases(images, op.originalLeaseCount);
        });
    }

    function batchAdd(lease, originalLeases, images) {
      const originalLeaseCount = originalLeases.length;
      return $q.all(images.map(image => replace(image, originalLeases.concat(lease))))
        .then(pollLeases(images, originalLeaseCount));
    }

    function canUserEdit(image){
      return editsService.canUserEdit(image);
    }

    function deleteLease(lease, originalLeases, images) {
      const originalLeaseCount = originalLeases.leases.length;
      return getLeasesRoot().follow('leases', {id: lease.id}).delete()
        .then(pollLeases(images, originalLeaseCount));
    }

    function getByMediaId(image) {
      return getLeasesRoot().follow('by-media-id', {id: image.data.id}).get();
    }

    function pollLeases(images, originalLeaseCount){
      apiPoll(() => {
        return untilLeasesChange(images, originalLeaseCount);
      });
    }

    function untilLeasesChange(images, originalLeaseCount){
      return $q.all(images.map((image) => image.get().then( (apiImage) => {
        const apiLeases = imageAccessor.readLeases(apiImage);
        if (apiLeases.leases.length !== originalLeaseCount) {
          $rootScope.$emit('leases-updated');
          return apiLeases;
        } else {
          return $q.reject();
        }
      })));
    }

    function flattenLeases(leaseByMedias) {
      return {
        leases: leaseByMedias.map(l => l.leases).reduce((a, b) => a.concat(b)),
        lastModified: leaseByMedias.map(l => l.lastModified).sort()[0]
      };
    }

    return {
        batchAdd,
        getLeases,
        canUserEdit,
        deleteLease,
        getByMediaId,
        replace,
        clear,
        flattenLeases
    };
}]);

export default leaseService;
