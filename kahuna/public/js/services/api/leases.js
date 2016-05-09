import angular from 'angular';
import Rx from 'rx';

import {mediaApi} from './media-api';
import {service} from '../../edits/service';

var leaseService = angular.module('kahuna.services.lease', [
  service.name
  ]);

leaseService.factory('leaseService', [
  '$rootScope',
  '$q',
  'apiPoll',
  'imageAccessor',
  'mediaApi',
  'editsService',
  function ($rootScope, $q, apiPoll, imageAccessor, mediaApi, editsService) {
    var leasesRoot;
    function getLeasesRoot() {
        if (! leasesRoot) {
            leasesRoot = mediaApi.root.follow('leases');
        }
        return leasesRoot;
    }

    function add(image, lease) {
      return image.perform('add-lease', {body: lease})
    }

    function getLeases(image){
      return Rx.Observable.fromPromise(getByMediaId(image));
    }

    function canUserEdit(image){
      return editsService.canUserEdit(image);
    }

    function deleteLease(lease) {
      return getLeasesRoot().follow('leases', {id: lease.id}).delete();
    }

    function getByMediaId(image) {
      return getLeasesRoot().follow('by-media-id', {id: image.data.id}).get();
    }

    function allowedByLease(image) {
      return getByMediaId(image).then(
        (imageLeases) => {
          imageLeases = imageLeases.data
          if(imageLeases.current) {
            return Boolean(!imageLeases.current.data.access.match(/deny/i))
          } else {
            return true
          }
        },
        () => true
      );
    }

    return {
        add,
        getLeases,
        canUserEdit,
        deleteLease,
        getByMediaId,
        allowedByLease
    };
}]);

export default leaseService;
