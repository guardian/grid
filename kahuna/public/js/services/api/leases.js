import angular from 'angular';
import './media-api';
import '../../services/image-list';

import {service} from '../../edits/service';
import { trackAll } from '../../util/batch-tracking';
import { getApiImageAndApiLeasesIfUpdated, readLeases } from './leases-helper';

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

      // Compare a lease from the server with one created here
      function sameLease(a, b) {
          return a.startDate == b.startDate &&
              a.endDate == b.endDate &&
              a.access == b.access;
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
              pollLeasesAndUpdateUI(images, imageList.getLeases(images));
          });
        });
    }

    function replace(image, leases) {
        const images = [image];
        const currentLeasesPromise = getLeases(images);

        return currentLeasesPromise.then((currentLeases) => {

            const updatedLeases = leases.map((lease) => {
                var newLease = angular.copy(lease);
                newLease.mediaId = image.data.id;
                return newLease;
            });
            if (JSON.stringify(currentLeases.leases) === JSON.stringify(updatedLeases)) {
                console.log("THE SAME");
                return image;
            }

            return image
              .perform('replace-leases', {body: updatedLeases})
              .then(() => {
                  pollLeasesAndUpdateUI(images);
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
          console.log(lease);
        return trackAll($q, $rootScope, "leases", images, [image => { return add(image, lease); }, image =>
            apiPoll(() => untilLeasesMatch(image, (apiLeases) => {
                console.log(apiLeases.some(apiLease => sameLease(apiLease, lease)), "AAAA");
                return apiLeases.some(apiLease => sameLease(apiLease, lease));
            })),
            (_,[{image}])=> image
        ], ['images-updated', 'leases-updated']);
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
        .then(() => pollLeasesAndUpdateUI(images));
    }

    function getByMediaId(image) {
      return getLeasesRoot().follow('by-media-id', {id: image.data.id}).get();
    }

    function pollLeasesAndUpdateUI(images) {
      apiPoll(() => {
        return untilLeasesChange(images);
      }).then(results => {
        $rootScope.$emit('images-updated', results.map(({image})=>image));
        $rootScope.$emit('leases-updated');

        return results.map(({leases}) => leases);
      });
    }

      //This is a race condition, but I think it's a rare one.
    function untilLeasesChange(images) {
      const imagesArray = images.toArray ? images.toArray() : images;
      return $q.all(imagesArray.map(image => {
        return image.get().then(apiImage => {
          const apiImageAndApiLeases = getApiImageAndApiLeasesIfUpdated(image, apiImage);
          if (apiImageAndApiLeases) {
            image = apiImage;
            return apiImageAndApiLeases;
          } else {
            // returning $q.reject() will make apiPoll function to poll again
            // until api call will return image with updated leases
            return $q.reject();
          }
        });
      }));
    }

      //This fails when two identical leases are addded.
      function untilLeasesMatch(image, predicate) {
        return image.get().then(apiImage => {

            const leases = apiImage.data.leases.data;
            console.log(leases, predicate(leases.leases));
            if (predicate(leases.leases)) {
                console.log("I WORKED");
                return ({ image: apiImage, leases });
            } else {


                // returning $q.reject() will make apiPoll function to poll again
                // until api call will return image with updated leases
                return $q.reject();
            }

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
