// TODO: Grunt: hash dependencies? or ETag?

import angular from 'angular';
import 'angular-ui-router';
import 'pandular';
import './services/api/media-api';
import './services/api/media-cropper';
import './services/api/loader';
import './services/api/edits-api';
import './directives/ui-crop-box';
import './crop/index';
import './image/index';
import './upload/index';
import './search/index';
import './edits/index';
import './util/async';
import './util/digest';
import './analytics/track';
import './sentry/sentry';

// TODO: move to an async config to remove deps on play
var apiLink = document.querySelector('link[rel="media-api-uri"]');
var mixpanelTokenMeta = document.querySelector('meta[name="mixpanel-token"]');
var sentryDsnLink = document.querySelector('link[rel="sentry-dsn"]');

var config = {
    mediaApiUri: apiLink.getAttribute('href'),
    mixpanelToken: mixpanelTokenMeta && mixpanelTokenMeta.getAttribute('content'),
    sentryDsn: sentryDsnLink && sentryDsnLink.getAttribute('href'),

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
    'kahuna.directives'
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

    function sendCropToParent(image, crop) {
        var syncImage = getEntity(image);
        var syncCrop  = getEntity(crop);
        $q.all([syncImage, syncCrop]).then(([imageEntity, cropEntity]) => {
            // This interface is used when the app is embedded as an iframe
            var message = {
                image: imageEntity,
                crop:  cropEntity
            };

            // Note: we target all domains because we don't know who
            // may be embedding us.
            $window.parent.postMessage(message, '*');
        });
    }

    $rootScope.$on('events:crop-selected', (_, params) => {
        sendCropToParent(params.image, params.crop);
    });

    $rootScope.$on('events:crop-created', (_, params) => {
        sendCropToParent(params.image, params.crop);
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
    return function(image) {
        var url = image && image.uri;
        if (url) {
            return {
                'application/vnd.mediaservice.image+json': JSON.stringify(image),
                'text/plain':    url,
                'text/uri-list': url
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
        '3:2': 'portrait'
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

kahuna.directive('uiHasSpace', ['$window', function($window) {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            var el = element[0];
            scope.$watch(function() {
                scope[attrs.uiHasSpace] = el.clientHeight + el.offsetTop <= $window.innerHeight;
            });
        }
    };
}]);

kahuna.directive('uiNearBottom', ['$window', function($window) {
    return {
        restrict: 'A',
        scope: {
            nearBottom: '&uiNearBottom'
        },
        link: function(scope, element) {
            var scrolling = false;
            var $$window = angular.element($window);

            // Observe scroll on window, remove listener when directive dies
            // TODO: debounce
            $$window.bind('scroll', checkScrollNearBottom);
            scope.$on('$destroy', function() {
                $$window.unbind('scroll', checkScrollNearBottom);
            });

            // Pixel distance from bottom at which we are 'near' it
            var offset = 200;
            function checkScrollNearBottom() {
                var el = element[0];

                var nowAt = $window.innerHeight + $window.scrollY;
                var end = el.scrollHeight + el.offsetTop - offset;

                if (!scrolling && nowAt >= end) {
                    scrolling = true;
                    var afterNearBottom = scope.nearBottom();
                    // FIXME: This hack seems to be needed because the
                    // directive gets destroyed (and this handler
                    // unregistered) too late.  We should be able to
                    // remove this once we throttle and delay the
                    // scroll handler a little?
                    if (afterNearBottom) {
                        afterNearBottom.finally(function() {
                            scrolling = false;
                        });
                    } else {
                        scrolling = false;
                    }
                }
            }
        }
    };
}]);

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

/**
 * this is for when you have dynamic content that makes the window scroll
 * Chrome remembers your last scroll location, so when scrolling starts
 * you get a massive jump on first scroll, good for static content,
 * not for dynamic. This is a craphack.
 *
 * http://stackoverflow.com/questions/18617367/disable-browers-auto-scroll-after-a-page-refresh
 */
kahuna.directive('uiForgetWindowScroll',
                 ['$window', '$timeout',
                  function($window, $timeout) {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            scope[attrs.uiForgetWindowScroll].finally(function() {
                // FIXME: even if this is a hack, using timeout as the DOM
                // hasn't loaded is balony.
                $timeout(function() {
                    $window.scrollTo(0, 1);
                    $window.scrollTo(0, 0);
                }, 200);
            });
        }
    };
}]);

kahuna.directive('uiEventShare', function() {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            // TODO: remove selectors as a means here
            var thief = element.find(attrs.uiEventShareThief)[0];
            var victim = element.find(attrs.uiEventShareVictim)[0];

            thief.addEventListener(attrs.uiEventShare, function(event) {
                event.preventDefault();
                victim[attrs.uiEventShare]();
            });
        }
    };
});

kahuna.directive('uiFile', function() {
    return {
        restrict: 'A',
        scope: {
            onchange: '&uiFileChange'
        },
        link: function(scope, element) {
            element.on('change', function() {
                // TODO: no function reference
                scope.onchange()(Array.from(element[0].files));
            });
        }
    };
});

angular.bootstrap(document, ['kahuna']);
