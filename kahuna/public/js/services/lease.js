import angular from 'angular';

var leaseService = angular.module('kahuna.services.lease', []);

leaseService.factory('leaseService',
                     ['$rootScope', '$q', 'apiPoll', 'imageAccessor',
                      function ($rootScope, $q, apiPoll, imageAccessor) {


    function add (image, lease) {
      console.log("image", image)
      console.log("lease", lease)
      return image.data.userMetadata.leases
        .post({data: lease})
        // .then(newLease => apiPoll(() => untilNewLeaseVisible(image, newLease.data)))

    }


    function untilNewLeaseVisible(image, expectedLease) {
      return true
    }

    return {
        add
        // ,
        // remove,
        // batchAdd,
        // batchRemove
    };
}]);

export default leaseService;
