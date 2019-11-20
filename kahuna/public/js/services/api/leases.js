import angular from 'angular';
import moment from 'moment';
import './media-api';
import '../../services/image-list';

import {service} from '../../edits/service';
import { trackAll } from '../../util/batch-tracking';

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
      console.log('getLeases images', images);
      // search page has fancy image list
      if (angular.isDefined(images.toArray)) {
        images = images.toArray();
      }

      return imageList.getLeases(images).then((leases) => {
        console.log('leases', leases)
        return leases;
      });
      // return $q.all(images.map(i => i.get()))
      //     .then((images) => imageList.getLeases(images)).then((leases) => {
      //         console.log('leases', leases)
      //         return leases;
      //     });
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
      return trackAll($rootScope, "leases", images, image => add(image, lease)).then(() => {
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
      console.log('pollLeases', images);
      apiPoll(() => {
        return untilLeasesChange(images);
      });
    }

    function untilLeasesChange(images) {
          console.log('untilLeasesChange', images);
          const imagesArray = images.toArray ? images.toArray() : images;
          return $q.all(imagesArray.map(image => {
            return image.get().then(apiImage => {
              console.log('untilLeasesChange image.get then apiImage', apiImage);
          const apiLeases = imageAccessor.readLeases(apiImage);
          console.log('apiLeases', apiLeases);
          const leases = imageAccessor.readLeases(image);
          console.log('leases', leases);
          // new created
          if (leases && apiLeases && leases.lastModified === null && apiLeases.lastModified === null) {
            if (leases.leases.length > 0 && apiLeases.leases.length > 0){
              return { image: apiImage, leases: apiLeases };
            } else {
              return $q.reject();
            }
          } else {
            const currentLastModified = moment(apiLeases.lastModified);
            console.log('currentLastModified', currentLastModified.format());
            const previousLastModified = moment(leases.lastModified);
            console.log('previousLastModified', previousLastModified.format());
            if (currentLastModified.isAfter(previousLastModified)) {
              return { image: apiImage, leases: apiLeases };
            } else {
              return $q.reject();
            }
          }
        });
      })).then(results => {
        console.log('untilLeasesChange results', results);
        return results.map(result => {
          $rootScope.$emit('image-updated', result.image);
          $rootScope.$emit('leases-updated');
          console.log('emmiting leases-updated')
          return result.leases;
        });
      });
    }

    function flattenLeases(leaseByMedias) {
      console.log('flattenLeases leaseByMedias', leaseByMedias)
      const res = {
        leases: leaseByMedias.map(l => l.leases).reduce((a, b) => a.concat(b)),
        lastModified: leaseByMedias.map(l => l.lastModified).sort()[0]
      };
      console.log('flattenLeases res', res);
      return res;
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
