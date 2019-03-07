import angular from 'angular';
import moment from 'moment';
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
          .then((images) => imageList.getLeases(images));
      }

    function clear(image) {
        const images = [image];
        const currentLeases = getLeases(images);
        return currentLeases.then(() => {
          return image
              .perform('delete-leases').then(() => {
              pollLeases(images, imageList.getLeases(images));
          });
        });
    }

    function replace(image, leases) {
        const images = [image];
        const currentLeases = getLeases(images);

        return currentLeases.then(() => {

            const updatedLeases = leases.map((lease) => {
                var newLease = angular.copy(lease);
                newLease.mediaId = image.data.id;
                return newLease;
            });

            return image
              .perform('replace-leases', {body: updatedLeases})
              .then(() => {
                  pollLeases(images);
              });
        });
    }

    function add(image, lease) {
      const newLease = angular.copy(lease);
      newLease.mediaId = image.data.id;

      if (angular.isDefined(newLease.notes) && newLease.notes.trim().length === 0) {
        newLease.notes = null;
      }

      return image.perform('add-lease', {body: newLease});
    }

    function batchAdd(lease, images) {
      return $q.all(images.map(image => add(image, lease))).then(() => {
        pollLeases(images);
      });
    }

    function canUserEdit(image){
      return editsService.canUserEdit(image);
    }

    /**
     * Delete a lease by uuid from a collection of images.
     * This method does not support batch deletion, because a
     * uuid will only ever match one lease.
     */
    function deleteLease(lease, images) {
      return getLeasesRoot().follow('leases', {id: lease.id}).delete()
        .then(() => pollLeases(images));
    }

    function getByMediaId(image) {
      return getLeasesRoot().follow('by-media-id', {id: image.data.id}).get();
    }

    function pollLeases(images) {
      apiPoll(() => {
        return untilLeasesChange(images);
      });
    }

    function untilLeasesChange(images) {
      const imagesArray = images.toArray ? images.toArray() : images;
      return $q.all(imagesArray.map(image => {
        return image.get().then(apiImage => {
          const apiLeases = imageAccessor.readLeases(apiImage);
          const leases = imageAccessor.readLeases(image);
          const currentLastModified = moment(apiLeases.lastModified);
          const previousLastModified = moment(leases.lastModified);
          if (currentLastModified.isAfter(previousLastModified)) {
            return { image: apiImage, leases: apiLeases };
          } else {
            return $q.reject();
          }
        });
      })).then(results => {
        return results.map(result => {
          $rootScope.$emit('image-updated', result.image);
          $rootScope.$emit('leases-updated');
          return result.leases;
        });
      });
    }

    function flattenLeases(leaseByMedias) {
      return {
        leases: leaseByMedias.map(l => l.leases).reduce((a, b) => a.concat(b)),
        lastModified: leaseByMedias.map(l => l.lastModified).sort()[0]
      };
    }

    function isLeaseSyndication(lease) {
      return lease.access.endsWith('-syndication');
    }

    return {
        batchAdd,
        getLeases,
        canUserEdit,
        deleteLease,
        getByMediaId,
        replace,
        clear,
        flattenLeases,
        isLeaseSyndication
    };
}]);

export default leaseService;
