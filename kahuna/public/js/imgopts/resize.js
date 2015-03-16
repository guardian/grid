import angular from 'angular';

export var resize = angular.module('imgopts.resize', []);

resize.filter('imgResize', ['imgoptsUri', 'imgGet', (imgoptsUri, imgGet) => {
    return filepath => {
        var u = new URL(filepath);
        var resizeValues = imgGet.getResizeValues();
        var resizeParams = Object.keys(resizeValues).map(key => [key, resizeValues[key]].join('='));

        var qs = u.search.split('&').concat(resizeParams).join('&');

        return imgoptsUri + u.pathname + qs;
    }
}]);

resize.factory('imgGet', [() => {
    return {
        getResizeValues: () => {
            return {
                w: 500,
                h: 500,
                q: 500
            }
        }
    }
}]);
