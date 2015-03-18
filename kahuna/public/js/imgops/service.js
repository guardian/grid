import angular from 'angular';

export var imgops = angular.module('kahuna.imgops', []);

imgops.factory('imgops', ['$window', function($window) {

    var getUri = image => {
        var { width: w, height: h } = $window.screen;

        return image.follow('optimised', { w, h, q: 95 }).getUri().catch(() => {
            return image.source.secureUrl || image.source.file;
        });
    };

    return { getUri };

}]);
