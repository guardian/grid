import angular from 'angular';
import Rx from 'rx';

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
  function ($rootScope, $q, imageAccessor, imageList, mediaApi, editsService) {
    var leasesRoot;
    function getLeasesRoot() {
        if (! leasesRoot) {
            leasesRoot = mediaApi.root.follow('leases');
        }
        return leasesRoot;
    }

    function getLeases2(images) {
      console.log("images", images)
      console.log("get leases", imageList.getLeases(images))
      return imageList.getLeases(images).reduce((a, b) => a.concat(b));
    }

    function add(image, lease) {
      var newLease = angular.copy(lease);
      newLease.mediaId = image.data.id
      return image.perform('add-lease', {body: newLease});
    }

    function batchAdd(images, lease) {
      return $q.all(images.map(image => add(image, lease)));
    }

    function getLeases(images){
      return $q.all(images.map(image => getByMediaId(image)));
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
          imageLeases = imageLeases.data;
          if (imageLeases.current) {
            return Boolean(!imageLeases.current.data.access.match(/deny/i));
          } else {
            return true;
          }
        },
        () => true
      );
    }

    return {
        add,
        batchAdd,
        getLeases,
        canUserEdit,
        deleteLease,
        getByMediaId,
        allowedByLease,
        getLeases2
    };
}]);

export default leaseService;
