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

    function get(image){
      return Rx.Observable.fromPromise(getByMediaId(image));
    }

    function canUserEdit(image){
      return editsService.canUserEdit(image);
    }

    function deleteAll(image) {
      return image.perform('delete-leases')
    }

    function getByMediaId(image) {
      return getLeasesRoot().follow('by-media-id', {id: image.data.id}).get();
    }

    return {
        add,
        get,
        canUserEdit,
        deleteAll
    };
}]);

export default leaseService;
