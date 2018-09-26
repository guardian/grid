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
    var leasesRoot;
    function getLeasesRoot() {
        if (! leasesRoot) {
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

    function add(image, lease) {
      const newLease = angular.copy(lease);
      newLease.mediaId = image.data.id;

      if (angular.isDefined(newLease.notes) && newLease.notes.trim().length === 0) {
        newLease.notes = null;
      }

      return image.perform('add-lease', {body: newLease});
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
      const originalLeaseCount = originalLeases.leases.length;
      return $q.all(images.map(image => add(image, lease)))
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

    function allowedByLease(image) {
      return getByMediaId(image).then(
        (imageLeases) => {
          imageLeases = imageLeases.data;
          if (imageLeases.current) {
            return imageLeases.current.data.access;
          }
        }
      );
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
        current: leaseByMedias.map(l => l.current).filter(c => c !== null),
        leases: leaseByMedias.map(l => l.leases).reduce((a, b) => a.concat(b)),
        lastModified: leaseByMedias.map(l => l.lastModified).sort()[0]
      };
    }

    return {
        add,
        batchAdd,
        getLeases,
        canUserEdit,
        deleteLease,
        getByMediaId,
        replace,
        clear,
        allowedByLease,
        flattenLeases
    };
}]);

export default leaseService;
