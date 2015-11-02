// TODO: Grunt: hash dependencies? or ETag?

import angular from 'angular';
import 'angular-ui-router';
import 'pandular';
import uriTemplates from 'uri-templates';
import './services/api/media-api';
import './services/api/media-cropper';
import './services/api/loader';
import './services/api/edits-api';
import './services/api/media-usage';
import './directives/ui-crop-box';
import './directives/gr-image-fade-on-load';
import './crop/index';
import './image/index';
import './upload/index';
import './search/index';
import './edits/index';
import './util/async';
import './util/digest';
import './analytics/track';
import './sentry/sentry';
import './common/index';
import './errors/http';
import './errors/global';
import './components/gr-icon/gr-icon';

// TODO: move to an async config to remove deps on play
var apiLink = document.querySelector('link[rel="media-api-uri"]');
var sentryDsnLink = document.querySelector('link[rel="sentry-dsn"]');
var assetsRootLink = document.querySelector('link[rel="assets"]');

var config = {
    mediaApiUri: apiLink.getAttribute('href'),
    sentryDsn: sentryDsnLink && sentryDsnLink.getAttribute('href'),
    assetsRoot: assetsRootLink && assetsRootLink.getAttribute('href'),

    // Static config
    'pandular.reAuthUri': '/login'
};

var kahuna = angular.module('kahuna', [
    'ui.router',
    'pandular.heal',
    'util.async',
    'util.digest',
    'analytics.track',
    'sentry',
    'kahuna.crop',
    'kahuna.image',
    'kahuna.upload',
    'kahuna.search',
    'kahuna.edits',
    'kahuna.services.api',
    'kahuna.directives',
    'kahuna.common',
    'kahuna.errors.http',
    'kahuna.errors.global',

    // directives used throughout
    'gr.imageFadeOnLoad',
    'grIcon'
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


/* Perform an initial API request to detect 401 (not logged in) and
 * redirect browser for authentication if necessary.
 */

// TODO: move to panda-session and/or pandular library?
function authAndRedirect(loginUriTemplate) {
    const loginTemplate = uriTemplates(loginUriTemplate);
    const currentLocation = window.location.href;

    // Come back to the current URI after login flow
    const loginUri = loginTemplate.fillFromObject({redirectUri: currentLocation});

    // Full page redirect to the login URI
    window.location.href = loginUri;
}

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
            if (error && error.status === 401) {
                $log.info('No session, send for auth');

                // TODO: error should include a Resource with link so we
                // don't have to mess around with uriTemplates here

                var links = (error.body && error.body.links) || [];
                var loginLink = links.find(link => link.rel === 'login');
                var loginUriTemplate = loginLink && loginLink.href;
                if (loginUriTemplate) {
                    authAndRedirect(loginUriTemplate);
                } else {
                    // Couldn't extract a login URI, die noisily
                    throw new Error('Failed to redirect to auth, no login URI found');
                }
            }
        });
}]);

kahuna.run(['$rootScope', 'mediaApi', function($rootScope, mediaApi) {
    // Ping API at init time to ensure we're logged in
    mediaApi.root.get()
        .then(index => {
            $rootScope.$emit('events:config-loaded', index.data.configuration);
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

// global errors UI
kahuna.run(['$rootScope', 'globalErrors',
            function($rootScope, globalErrors) {

    $rootScope.$on('events:error:unauthorised', () => globalErrors.trigger('unauthorised'));
    $rootScope.$on('pandular:re-establishment:fail', () => globalErrors.trigger('authFailed'));
    $rootScope.$on('events:error:server', () => globalErrors.trigger('server'));
    $rootScope.$on('events:error:unknown', () => globalErrors.trigger('unknown'));
}]);

// tracking errors
kahuna.run(['$rootScope', 'httpErrors', 'track',
            function($rootScope, httpErrors, track) {

    $rootScope.$on('events:error:unauthorised', () =>
        track.action('Authentication error', { 'Error code': httpErrors.unauthorised.errorCode }));

    $rootScope.$on('pandular:re-establishment:fail', () =>
        track.action('Authentication error', { 'Error code': httpErrors.authFailed.errorCode }));
}]);


kahuna.run(['track', function(track) {
    track.action('Page viewed');
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

    // Note: we target all domains because we don't know who
    // may be embedding us.
    var postMessage = message => $window.parent.postMessage(message, '*');
    var cropMessage = function(image, crop) {return { image, crop };};

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

// Take an image and return a drag data map of mime-type -> value
kahuna.filter('asImageDragData', function() {
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
                'application/vnd.mediaservice.image+json': JSON.stringify(imageObj),
                'application/vnd.mediaservice.kahuna.uri': kahunaUri,
                'text/plain':    uri,
                'text/uri-list': uri
            };
        }
    };
});

// Take an image and return a drag data map of mime-type -> value
kahuna.filter('asCropsDragData', function() {
    return function(crops) {
        return {
            'application/vnd.mediaservice.crops+json': JSON.stringify(crops)
        };
    };
});

// Take an image and return a drag data map of mime-type -> value
kahuna.filter('asImageAndCropsDragData', ['$filter',
                                          function($filter) {
    var extend = angular.extend;
    return function(image, crops) {

        return extend(
            $filter('asImageDragData')(image),
            $filter('asCropsDragData')(crops));
    };
}]);

kahuna.filter('asAspectRatioWord', function() {
    // FIXME: Try to find one place to store these mappings
    var aspectToName = {
        '5:3': 'landscape',
        '2:3': 'portrait',
        '16:9': 'video'
    };
    var defaultName = 'freeform';

    return aspectRatio => aspectToName[aspectRatio] || defaultName;
});

kahuna.filter('asFileSize', function() {
    return byteSize => {
        // TODO: round to precision(1)
        if (byteSize > 1000 * 1000) {
            return Math.round(byteSize / (1000 * 1000)) + 'MB';
        } else if (byteSize > 1000) {
            return Math.round(byteSize / 1000) + 'KB';
        } else {
            return byteSize + 'B';
        }
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
            element.bind('dragstart', function(jqueryEvent) {
                // Unwrap jQuery event wrapper to access dataTransfer
                var e = jqueryEvent.originalEvent;

                // No obvious way to receive an object through an
                // attribute without making this directive an
                // isolate scope...
                var dataMap = JSON.parse(attrs.uiDragData);
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
            element.bind('dragstart', function(jqueryEvent) {
                // Unwrap jQuery event wrapper to access dataTransfer
                var e = jqueryEvent.originalEvent;
                var img = document.createElement('img');
                img.src = attrs.uiDragImage;
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
            element.bind('click', function() {
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


kahuna.directive('uiWindowResized', ['$window', function ($window) {
    return {
        restrict: 'A',
        link: function (scope, element, attrs) {
            angular.element($window).bind('resize', function() {
                scope.$eval(attrs.uiWindowResized);
            });
        }
    };
}]);

angular.bootstrap(document, ['kahuna']);
