// TODO: Grunt: hash dependencies? or ETag?
import '@babel/polyfill';
import angular from 'angular';
import 'angular-ui-router';
import {heal} from 'pandular';

import {cropperApi} from './services/api/media-cropper';
import {editsApi}   from './services/api/edits-api';
import {loaderApi}  from './services/api/loader';
import {mediaApi}   from './services/api/media-api';

import {imageFade} from './directives/gr-image-fade-on-load';

import {crop}   from './crop/index';
import {image}  from './image/index';
import {upload} from './upload/index';
import {search} from './search/index';
import {edits}  from './edits/index';

import {async}  from './util/async';
import {digest} from './util/digest';

import wfAnalyticsServiceMod  from './analytics/analytics';
import {sentry} from './sentry/sentry';

import {userActions}        from './common/user-actions';

import {httpErrors}   from './errors/http';
import {globalErrors} from './errors/global';

import {icon}    from './components/gr-icon/gr-icon';
import {tooltip} from './components/gr-tooltip/gr-tooltip';

// TODO: move to an async config to remove deps on play
var apiLink = document.querySelector('link[rel="media-api-uri"]');
var reauthLink = document.querySelector('link[rel="reauth-uri"]');
var sentryDsnLink = document.querySelector('link[rel="sentry-dsn"]');
var assetsRootLink = document.querySelector('link[rel="assets"]');

var config = {
    mediaApiUri: apiLink.getAttribute('href'),
    sentryDsn: sentryDsnLink && sentryDsnLink.getAttribute('href'),
    assetsRoot: assetsRootLink && assetsRootLink.getAttribute('href'),

    // Static config
    // TODO: use link in 4xx response to avoid having to hardcode in HTML page
    'pandular.reAuthUri': reauthLink && reauthLink.getAttribute('href'),

    // Number of millis before pandular stops trying to reauth
    // This number is relatively high to cater for AUS
    'pandular.reAuthTimeout': 7000,

    vndMimeTypes: new Map([
        ['gridImageData',  'application/vnd.mediaservice.image+json'],
        ['gridImagesData', 'application/vnd.mediaservice.images+json'],
        ['gridCropsData',  'application/vnd.mediaservice.crops+json'],
        ['kahunaUri',      'application/vnd.mediaservice.kahuna.uri'],
        // These two are internal hacks to help us identify when we're dragging internal assets
        // They should definitely not be relied on externally.
        ['isGridLink',     'application/vnd.mediaservice.kahuna.link'],
        ['isGridImage' ,   'application/vnd.mediaservice.kahuna.image']
    ])
};

var kahuna = angular.module('kahuna', [
    'ui.router',
    heal.name,
    cropperApi.name,
    editsApi.name,
    loaderApi.name,
    mediaApi.name,
    async.name,
    digest.name,
    wfAnalyticsServiceMod.name,
    sentry.name,
    crop.name,
    image.name,
    upload.name,
    search.name,
    edits.name,
    userActions.name,
    httpErrors.name,
    globalErrors.name,

    // directives used throughout
    imageFade.name,
    icon.name,
    tooltip.name
]);


// Inject configuration values into the app
angular.forEach(config, function(value, key) {
    kahuna.constant(key, value);
});


kahuna.config(['$locationProvider',
               function($locationProvider) {

    // Use real URLs (with History API) instead of hashbangs
    $locationProvider.html5Mode({enabled: true, requireBase: false});
}]);

kahuna.config(['$urlRouterProvider',
               function($urlRouterProvider) {

    $urlRouterProvider.otherwise('/search');
}]);

// https://code.angularjs.org/1.5.5/docs/guide/production
kahuna.config(['$compileProvider', function ($compileProvider) {
  $compileProvider.debugInfoEnabled(false);
  $compileProvider.preAssignBindingsEnabled(true);
}]);

kahuna.run(['$log', '$rootScope', 'mediaApi', function($log, $rootScope, mediaApi) {
    // TODO: don't mix these two concerns. This is done here to avoid
    // doing redundant API calls to the same endpoint. Could be
    // abstracted into a service that unifies parallel calls to the root.
    mediaApi.root.get()
        // Emit configuration
        .then(index => {
            if (index.data) {
                $rootScope.$emit('events:config-loaded', index.data.configuration);
            }
        })
        // Ping API at init time to ensure we're logged in
        .catch(error => {
            // If missing a session, send for auth
            if (error && error.status === 401 || error.status === 419) {
                $log.info('No session, send for auth');

                if (reauthLink) {
                    const authLink = new URL(reauthLink.getAttribute('href'));
                    const authParams = new URLSearchParams(authLink.search);

                    authParams.set("redirectUri", window.location.href);
                    authLink.search = authParams.toString();

                    // Full page redirect to the login URI
                    window.location.href = authLink.toString();
                } else {
                    // Couldn't extract a login URI, die noisily
                    throw new Error('Failed to redirect to auth, no login URI found');
                }
            }
        });
}]);

kahuna.run(['$rootScope', 'mediaApi',
            ($rootScope, mediaApi) => {

    mediaApi.getSession().then(session => {
        $rootScope.$emit('events:user-loaded', session.user);
    });
}]);


// Intercept 401s and emit an event
kahuna.config(['$httpProvider', function($httpProvider) {
    $httpProvider.interceptors.push('httpErrorInterceptor');
}]);

kahuna.factory('httpErrorInterceptor',
               ['$q', '$rootScope', 'httpErrors',
                function($q, $rootScope, httpErrors) {
    return {
        responseError: function(response) {
            switch (response.status) {
                case 0: {
                    /*
                    Status is 0 when the headers of the response does not
                    include the correct cors. This happens when the request
                    fails and we don't explicitly return an error code.
                     */
                    $rootScope.$emit('events:error:unknown');
                    break;
                }
                case httpErrors.unauthorised.errorCode: {
                    $rootScope.$emit('events:error:unauthorised');
                    break;
                }
                case httpErrors.internalServerError.errorCode: {
                    $rootScope.$emit('events:error:server');
                    break;
                }
                case httpErrors.internalServerError.serviceUnavailableError: {
                    $rootScope.$emit('events:error:server');
                    break;
                }
                default: {
                    break;
                }
            }
            return $q.reject(response);
        }
    };
}]);

// set up tracking
kahuna.run(['wfAnalyticsService', function(){}]);

// global errors UI
kahuna.run(['$rootScope', 'globalErrors',
            function($rootScope, globalErrors) {


    $rootScope.$on('events:error:unauthorised', () => globalErrors.trigger('unauthorised'));
    $rootScope.$on('pandular:re-establishment:fail', () => globalErrors.trigger('authFailed'));
    $rootScope.$on('events:error:server', () => globalErrors.trigger('server'));
    $rootScope.$on('events:error:unknown', () => globalErrors.trigger('unknown'));
}]);

// tracking errors
kahuna.run(['$rootScope', 'httpErrors',
            function($rootScope, httpErrors) {

    $rootScope.$on('events:error:unauthorised', () =>
        $rootScope.$emit(
          'track:event',
          'Authentication',
          null,
          'Error',
          null,
          { 'Error code': httpErrors.unauthorised.errorCode }
      ));

    $rootScope.$on('pandular:re-establishment:fail', () =>
      $rootScope.$emit(
        'track:event',
        'Authentication',
        null,
        'Error',
        null,
        { 'Error code': httpErrors.authFailed.errorCode }
      ));
}]);

/**
 * Takes a resources and returns a promise of the entity data (uri,
 * data) as a plain JavaScript object.
 */
kahuna.factory('getEntity', ['$q', function($q) {
    function getEntity(resource) {
        return $q.all([resource.uri, resource.getData()]).then(([uri, data]) => {
            return {uri, data};
        });
    }

    return getEntity;
}]);


/**
 * Intercept global events and broadcast them on the parent window.
 * Used by the parent page when the app is embedded as an iframe.
 */
kahuna.run(['$rootScope', '$window', '$q', 'getEntity',
            function($rootScope, $window, $q, getEntity) {

    // Note: we target all domains because we don't know who may be embedding us.
    // Wrap message in `angular.toJson` to remove internal fields with a `$$` prefix.
    // See https://docs.angularjs.org/api/ng/function/angular.toJson
    const postMessage = message => $window.parent.postMessage(JSON.parse(angular.toJson(message)), '*');
    const cropMessage = function(image, crop) {return { image, crop };};

    // These interfaces are used when the app is embedded as an iframe
    $rootScope.$on('events:crop-selected', (_, params) => {
        getEntity(params.image).then(imageEntity => {
            // FIXME: `crop.data` is set as the cropper API doesn't return
            // resources and this is the structure composer expects
            var message = cropMessage(imageEntity, { data: params.crop });

            postMessage(message);
        });
    });

    $rootScope.$on('events:crop-created', (_, params) => {
        var syncImage = getEntity(params.image);
        var syncCrop  = getEntity(params.crop);
        $q.all([syncImage, syncCrop]).then(([imageEntity, cropEntity]) => {
            var message = cropMessage(imageEntity, cropEntity);

            postMessage(message);
        });
    });

    // used for batched crops
    $rootScope.$on('events:crops-created', (_, params) => {
      const specsPromise = params.map(({ image, crop }) => $q.all([
        getEntity(image),
        getEntity(crop)
      ]).then(([image, crop]) => ({
        image,
        crop
      })));

      $q.all(specsPromise).then(images => postMessage({
        images
      }));
    });
}]);


kahuna.controller('SessionCtrl',
                  ['$scope', '$state', '$stateParams', 'mediaApi',
                   function($scope, $state, $stateParams, mediaApi) {

    mediaApi.getSession().then(session => {
        $scope.user = session.user;
    });
}]);


kahuna.filter('getExtremeAssets', function() {
    return function(image) {
        var orderedAssets = image.assets.sort((a, b) => {
            return (a.dimensions.width * a.dimensions.height) -
                   (b.dimensions.width * b.dimensions.height);
        });

        return {
            smallest: orderedAssets[0],
            largest: orderedAssets.slice(-1)[0]
        };
    };
});

// Take an image and return a drag data map of mime-type -> value.
// Note: the serialisation is expensive so make sure you only evaluate
// this filter when necessary.
kahuna.filter('asImageDragData', ['vndMimeTypes', function(vndMimeTypes) {
    // Annoyingly cannot use Resource#getLink because it returns a
    // Promise and Angular filters are synchronous :-(
    function syncGetLinkUri(resource, rel) {
        const links = resource && resource.links || [];
        const link = links.filter(link => link.rel === rel)[0];
        return link && link.href;
    }

    return function(image) {
        var uri = image && image.uri;
        if (uri) {
            const kahunaUri = syncGetLinkUri(image, 'ui:image');
            // Resources don't serialise well yet..
            const imageObj = { data: image.data, uri };
            return {
                [vndMimeTypes.get('gridImageData')]: JSON.stringify(imageObj),
                [vndMimeTypes.get('kahunaUri')]: kahunaUri,
                'text/plain':    uri,
                'text/uri-list': uri
            };
        }
    };
}]);

// Take an image and return a drag data map of mime-type -> value.
// Note: the serialisation is expensive so make sure you only evaluate
// this filter when necessary.
kahuna.filter('asCropsDragData', ['vndMimeTypes', function(vndMimeTypes) {
    return function(crops) {
        return {
            [vndMimeTypes.get('gridCropsData')]: JSON.stringify(crops)
        };
    };
}]);

// Take an image and return a drag data map of mime-type -> value.
// Note: the serialisation is expensive so make sure you only evaluate
// this filter when necessary.
kahuna.filter('asImageAndCropsDragData', ['$filter',
                                          function($filter) {
    var extend = angular.extend;
    return function(image, crops) {

        return extend(
            $filter('asImageDragData')(image),
            $filter('asCropsDragData')(crops));
    };
}]);

kahuna.filter('asFileSize', function() {
    return bytes => {
        if (!bytes) { return '0 Byte'; }

        const k = 1000;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };
});

kahuna.filter('toLocaleString', function() {
    return number => number.toLocaleString();
});

kahuna.filter('assetFile', function() {
    // Prefer SSL asset, but default to HTTP URI if missing
    // (e.g. non-PROD env)
    return asset => asset.secureUrl || asset.file;
});

kahuna.filter('stripEmailDomain', function() {
    return str => str.replace(/@.+/, '');
});

kahuna.filter('getInitials', function() {
    return str => str && str.replace(/@.+/, '')
        .split('.')
        .map(e => e.charAt(0).toUpperCase())
        .join('');
});

kahuna.filter('spaceWords', function() {
    return str => str.replace( /([A-Z]+)/g, $1 => ' ' + $1.toLowerCase() );
});


kahuna.directive('uiDragData', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.on('dragstart', function(e) {
                // Evaluate the attribute value to retrieve a JS object
                // (done lazily to avoid unnecessary serialisation work)
                var dataMap = scope.$eval(attrs.uiDragData);
                Object.keys(dataMap).forEach(function(mimeType) {
                    e.dataTransfer.setData(mimeType, dataMap[mimeType]);
                });
            });
        }
    };
});

kahuna.directive('uiDragImage', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            element.on('dragstart', function(e) {
                // Evaluate the attribute value to retrieve a JS object
                // (done lazily to avoid unnecessary serialisation work)
                const src = scope.$eval(attrs.uiDragImage);

                var img = document.createElement('img');
                img.src = src;
                e.dataTransfer.setDragImage(img, -10, -10);
            });
        }
    };
});

kahuna.directive('uiTitle', ['$rootScope', function($rootScope) {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            $rootScope.$on('$stateChangeStart',
              function(event, toState, toParams) {
                  var titleFunc = toState.data && toState.data.title;
                  var title = (titleFunc ? titleFunc(toParams) : toState.name) +
                          ' | ' + attrs.uiTitleSuffix;

                  element.text(title);
            });
        }
    };
}]);

/**
 * using uiLocalStoreVal to set a key to the same value will remove that key from localStorage
 * this allows toggling values on/off
 * we force localstore attr to be and object
 * TODO: Support deep objects i.e
 * { "search":
 *   { "lastSeen":
 *     { "dogs": "1849-09-26T00:00:00Z" }}}`
 *
 * TODO: Think about what to do if a value
 *       exists for a key that isn't JSON
 *
 * TODO: Make a service for data retrieval?
 */
kahuna.directive('uiLocalstore', ['$window', function($window) {
    return {
        restrict: 'A',
        scope: {
            key: '@uiLocalstore',
            value: '&uiLocalstoreVal'
        },
        link: function(scope, element) {
            element.on('click', function() {
                var k = scope.key;
                var currentMap = JSON.parse($window.localStorage.getItem(k) || '{}');
                var mapUpdate = scope.value();

                // Update map by removing keys set to the same value, or merging if not
                Object.keys(mapUpdate).forEach(key => {
                    if (currentMap[key] === mapUpdate[key]) {
                        delete currentMap[key];
                    } else {
                        currentMap[key] = mapUpdate[key];
                    }
                });

                $window.localStorage.setItem(k, JSON.stringify(currentMap));
                scope.$apply();
            });
        }
    };
}]);

// These two are internal hacks to help us identify when we're dragging internal assets
// They should definitely not be relied on externally.
kahuna.directive('img', ['vndMimeTypes', function(vndMimeTypes) {
    return {
        restrict: 'E',
        link: function(scope, element) {
            element.on('dragstart', e => {
                e.dataTransfer.setData(vndMimeTypes.get('isGridLink'), 'true');
            });
        }
    };
}]);
kahuna.directive('a', ['vndMimeTypes', function(vndMimeTypes) {
    return {
        restrict: 'E',
        link: function(scope, element) {
            element.on('dragstart', e => {
                e.dataTransfer.setData(vndMimeTypes.get('isGridImage'), 'true');
            });
        }
    };
}]);

kahuna.directive('uiWindowResized', ['$window', function ($window) {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            angular.element($window).on('resize', function() {
                scope.$eval(attrs.uiWindowResized);
            });
        }
    };
}]);

angular.bootstrap(document, ['kahuna']);
