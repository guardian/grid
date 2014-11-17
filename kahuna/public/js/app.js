// TODO: Grunt: hash dependencies? or ETag?
// TODO: Load templates using AMD so they can be compiled in

import angular from 'angular';
import 'angular-ui-router';
import 'services/theseus';
import 'services/api/media-api';
import 'services/api/media-cropper';
import 'services/api/loader';
import 'directives/ui-crop-box';
import 'pandular/heal';

var apiLink = document.querySelector('link[rel="media-api-uri"]');
var config = {
    mediaApiUri: apiLink.getAttribute('href'),

    // Static config
    templatesDirectory: '/assets/templates',
    'pandular.reAuthUri': '/login'
};

var kahuna = angular.module('kahuna', [
    'ui.router',
    'theseus',
    'pandular.heal',
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
    $locationProvider.html5Mode(true).hashPrefix('!');
}]);

kahuna.config(['$stateProvider', '$urlRouterProvider', 'templatesDirectory',
               function($stateProvider, $urlRouterProvider, templatesDirectory) {

    $stateProvider.state('search', {
        // Virtual state, we always want to be in a child state of this
        abstract: true,
        url: '/',
        templateUrl: templatesDirectory + '/search.html'
    });
    $stateProvider.state('search.results', {
        url: 'search?query&ids&since&nonFree&archived&valid&uploadedBy',
        templateUrl: templatesDirectory + '/search/results.html',
        controller: 'SearchResultsCtrl',
        data: {
            title: function(params) {
                return params.query ? params.query : 'search';
            }
        }
    });

    $stateProvider.state('image', {
        url: '/images/:imageId?crop',
        templateUrl: templatesDirectory + '/image.html',
        controller: 'ImageCtrl'
    });

    $stateProvider.state('crop', {
        url: '/images/:imageId/crop',
        templateUrl: templatesDirectory + '/crop.html',
        controller: 'ImageCropCtrl as imageCropCtrl'
    });

    $urlRouterProvider.otherwise("/search");
}]);


kahuna.controller('SearchQueryCtrl',
                  ['$scope', '$state', '$stateParams', 'mediaApi',
                   function($scope, $state, $stateParams, mediaApi) {

    $scope.uploadedByMe = false;
    Object.keys($stateParams)
        .forEach(setAndWatchParam);

    function setAndWatchParam(key) {
        $scope[key] = $stateParams[key];
        $scope.$watch(key, (newVal, oldVal) => {
            if (newVal !== oldVal) {
                // we replace empty strings etc with undefined to clear the querystring
                $state.go('search.results', { [key]: newVal || undefined });
            }
        });
    }

    // FIXME: There are two other bugs here once that is done:
    // * ui-router seems to decode `%40` -> `@` in the querystring
    // * this in turn makes system JS to go wobbly

    // we can't user dynamic values in the ng:true-value see:
    // https://docs.angularjs.org/error/ngModel/constexpr
    // perhaps this functionality will change if we move to gmail type search e.g.
    // "uploadedBy:anthony.trollope@***REMOVED***"
    mediaApi.getSession().then(session => $scope.user = session.user);
    $scope.uploadedByMe = !!$stateParams.uploadedBy;
    $scope.$watch('uploadedByMe', (newVal, oldVal) => {
        if (newVal !== oldVal) {
            $scope.uploadedBy = newVal && $scope.user.email;
        }
    });
}]);


kahuna.controller('SearchResultsCtrl',
                  ['$scope', '$state', '$stateParams', '$timeout', 'mediaApi',
                   function($scope, $state, $stateParams, $timeout, mediaApi) {

    $scope.images = [];

    // FIXME: This is being refreshed by the router. Make it watch a $stateParams collection instead
    // See:   https://github.com/guardian/media-service/pull/64#discussion-diff-17351746L116
    $scope.loading = true;
    $scope.searched = search().then(function(images) {
        $scope.totalResults = images.total;
        $scope.images = images.data;
        // yield so images render before we check if there's more space
        $timeout(function() {
            if ($scope.hasSpace) {
                addImages();
            }
        });

        checkForNewImages();
    }).finally(() => {
        $scope.loading = false;
    });

    // Safer than clearing the timeout in case of race conditions
    // FIXME: nicer (reactive?) way to do this?
    var scopeGone = false;
    $scope.$on('$destroy', () => {
        scopeGone = true;
    });


    var pollingPeriod = 5 * 1000; // ms
    $scope.newImagesCount = 0;

    // FIXME: this will only add up to 50 images (search capped)
    function checkForNewImages() {
        $timeout(() => {
            var latestTime = $scope.images[0] && $scope.images[0].data.uploadTime;
            search({since: latestTime}).then(resp => {
                // FIXME: minor assumption that only the latest
                // displayed image is matching the uploadTime
                $scope.newImagesCount = resp.total - 1;

                if (! scopeGone) {
                    checkForNewImages();
                }
            });
        }, pollingPeriod);
    }

    $scope.revealNewImages = function() {
        // FIXME: should ideally be able to just call $state.reload(),
        // but there seems to be a bug (alluded to in the docs) when
        // notify is false, so forcing to true explicitly instead:
        $state.transitionTo($state.current, $stateParams, {
            reload: true, inherit: false, notify: true
        });
    };


    var seenSince;
    var lastSeenKey = 'search.seenFrom';
    $scope.getLastSeenVal = function(image) {
        var key = getQueryKey();
        var val = {};
        val[key] = image.data.uploadTime;

        return val;
    };

    $scope.imageHasBeenSeen = function(image) {
        return image.data.uploadTime <= seenSince;
    };

    $scope.$watch(() => localStorage.getItem(lastSeenKey), function() {
        seenSince = getSeenSince();
    });

    // TODO: Move this into localstore service
    function getSeenSince() {
       return JSON.parse(localStorage.getItem(lastSeenKey) || '{}')[getQueryKey()];
    }

    $scope.$watch('nearBottom', function(nearBottom) {
        if (nearBottom) {
            addImages();
        }
    });

    function getQueryKey() {
        return $stateParams.query || '*';
    }

    function addImages() {
        // TODO: stop once reached the end
        var lastImage = $scope.images.slice(-1)[0];
        if (lastImage) {
            var until = lastImage.data.uploadTime;
            return search({until: until}).then(function(moreImages) {
                // Filter out duplicates (esp. on exact same 'until' date)
                var newImages = excludingCurrentImages(moreImages.data);
                $scope.images = $scope.images.concat(newImages);
            });
        }
    }

    function search({until, since} = {}) {
        // FIXME: Think of a way to not have to add a param in a million places to add it
        return mediaApi.search($stateParams.query, angular.extend({
            ids:        $stateParams.ids,
            since:      $stateParams.since,
            archived:   $stateParams.archived,
            // The nonFree state param is the inverse of the free API param
            free:       $stateParams.nonFree === 'true' ? undefined: true,
            // Search for valid only by default
            valid:      $stateParams.valid === undefined ? true : $stateParams.valid,
            uploadedBy: $stateParams.uploadedBy
        }, {
            until: until,
            since: since
        }));
    }

    function excludingCurrentImages(otherImages) {
        return otherImages.filter(function(image) {
            return $scope.images.filter(function(existing) {
                // TODO: revert back to using uri
                return existing.data.id === image.data.id;
            }).length === 0;
        });
    }

    $scope.whenNearBottom = addImages;
}]);

kahuna.controller('ImageCtrl',
                  ['$scope', '$stateParams', '$filter', 'mediaApi', 'mediaCropper',
                   function($scope, $stateParams, $filter, mediaApi, mediaCropper) {

    var imageId = $stateParams.imageId;
    $scope.cropKey = $stateParams.crop;

    mediaApi.find(imageId).then(function(image) {
        var getCropKey = $filter('getCropKey');

        $scope.image = image;

        // FIXME: we need not to use imageSync but find a way to use the promised URI
        image.uri.then(uri => $scope.imageSync = {uri: uri, data: image.data});

        mediaCropper.getCropsFor(image).then(function(crops) {
           $scope.crops = crops;
           $scope.crop = crops.find(crop => getCropKey(crop) === $scope.cropKey);
        });
    });

    var ignoredMetadata = ['description', 'source', 'copyright', 'keywords'];
    $scope.isUsefulMetadata = function(metadataKey) {
        return ignoredMetadata.indexOf(metadataKey) === -1;
    };

    $scope.priorityMetadata = ['byline', 'credit'];
}]);


kahuna.controller('ImageLabelsCtrl',
                  ['$scope', '$window',
                   function($scope, $window) {

    function saveFailed() {
        $window.alert('Something went wrong when saving, please try again!');
    }

    this.addLabel = () => {
        // Prompt for a label and add if not empty
        var label = ($window.prompt("Enter a label:") || '').trim();
        if (label) {
            this.adding = true;
            $scope.labels.post({data: label}).
                then(newLabel => {
                    // FIXME: don't mutate original, replace the whole resource with the new state
                    $scope.labels.data.push(newLabel);
                }).
                catch(saveFailed).
                finally(() => {
                    this.adding = false;
                });
        }
    };

    this.labelsBeingRemoved = new Set;
    this.removeLabel = (label) => {
        this.labelsBeingRemoved.add(label);

        label.delete().
            then(() => {
                // FIXME: don't mutate original, replace the whole resource with the new state
                var labelIndex = $scope.labels.data.findIndex(l => l.data === label.data);
                $scope.labels.data.splice(labelIndex, 1);
            }).
            catch(saveFailed).
            finally(() => {
                this.labelsBeingRemoved.remove(label);
            });
    };

}]);

kahuna.directive('uiImageLabels',
                 ['templatesDirectory',
                  function(templatesDirectory) {

    return {
        restrict: 'E',
        scope: {
            // Annoying that we can't make a uni-directional binding
            // as we don't really want to modify the original
            labels: '='
        },
        controller: 'ImageLabelsCtrl as labelsCtrl',
        templateUrl: templatesDirectory + '/image/labels.html'
    };
}]);


kahuna.controller('ImageCropCtrl',
                  ['$scope', '$stateParams', '$state', '$filter', 'mediaApi', 'mediaCropper',
                   function($scope, $stateParams, $state, $filter, mediaApi, mediaCropper) {

    var imageId = $stateParams.imageId;

    mediaApi.find(imageId).then(function(image) {
        $scope.image = image;
    });

    $scope.cropping = false;

    // Standard ratios
    $scope.landscapeRatio = 5 / 3;
    $scope.portraitRatio = 2 / 3;
    $scope.freeRatio = null;

    // TODO: migrate the other properties to be on the ctrl (this) instead of $scope
    this.aspect = $scope.landscapeRatio;
    $scope.coords = {
        x1: 0,
        y1: 0,
        // max out to fill the image with the selection
        x2: 10000,
        y2: 10000
    };

    $scope.crop = function() {
        // TODO: show crop
        var coords = {
            x: $scope.coords.x1,
            y: $scope.coords.y1,
            width:  $scope.coords.x2 - $scope.coords.x1,
            height: $scope.coords.y2 - $scope.coords.y1
        };

        var ratio;
        if (Number(this.aspect) === $scope.landscapeRatio) {
            ratio = '5:3';
        } else if (Number(this.aspect) === $scope.portraitRatio) {
            ratio = '3:2';
        }

        $scope.cropping = true;

        mediaCropper.createCrop($scope.image, coords, ratio).then(function(crop) {
            $state.go('image', {
                imageId: imageId,
                crop: $filter('getCropKey')(crop.data)
            });
        // FIXME: traceur promises don't have finally?
        }).finally(function() {
            $scope.cropping = false;
        });
    }.bind(this);

}]);

// Create the key form the bounds as that's what we have in S3
kahuna.filter('getCropKey', function() {
    return function(crop) {
        var bounds = crop.specification.bounds;
        return ['x', 'y', 'width', 'height'].map(k => bounds[k]).join('_');
    };
});


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
    // FIXME: Try to find one place to store these words to ratios
    return function(aspectRatio) {
        switch(aspectRatio) {
            case '5:3':
                return 'landscape';

            case '3:2':
                return 'portrait';

            default:
                return 'freeform';
        }
    }
});

kahuna.filter('assetFile', function() {
    return function(asset) {
        // Prefer SSL asset, but default to HTTP URI if missing
        // (e.g. non-PROD env)
        return asset.secureUrl || asset.file;
    };
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
    }
}]);

kahuna.directive('uiNearBottom', ['$window', function($window) {
    return {
        restrict: 'A',
        scope: {
            nearBottom: '&uiNearBottom'
        },
        link: function(scope, element, attrs) {
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
            function checkScrollNearBottom(e) {
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

kahuna.directive('uiTitle', function($rootScope) {
    return {
        restrict: 'A',
        link: function(scope, element, attrs) {
            $rootScope.$on('$stateChangeStart',
              function(event, toState, toParams, fromState, fromParams) {
                  var title = (toState.data && toState.data.title ? toState.data.title(toParams) : toState.name)
                       + ' | ' + attrs.uiTitleSuffix;

                  element.text(title);
            });
        }
    };
});

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
kahuna.directive('uiLocalstore', function() {
    return {
        restrict: 'A',
        scope: {
            key: '@uiLocalstore',
            value: '&uiLocalstoreVal'
        },
        link: function(scope, element, attrs) {
            element.bind('click', function() {
                var k = scope.key;
                var currentMap = JSON.parse(localStorage.getItem(k) || '{}');
                var mapUpdate = scope.value();

                // Update map by removing keys set to the same value, or merging if not
                Object.keys(mapUpdate).forEach(key => {
                    if (currentMap[key] === mapUpdate[key]) {
                        delete currentMap[key];
                    } else {
                        currentMap[key] = mapUpdate[key];
                    }
                });

                localStorage.setItem(k, JSON.stringify(currentMap));
                scope.$apply();
            });
        }
    };
});

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
        link: function(scope, element, attrs) {
            element.on('change', function() {
                scope.onchange()(Array.from(element[0].files));
            });
        }
    };
});

/**
 * File uploader
 */
kahuna.controller('FileUploaderCtrl',
                  ['$q', '$window', '$state', '$timeout', 'loaderApi', 'mediaApi',
                   function($q, $window, $state, $timeout, loaderApi, mediaApi) {

    var ctrl = this; // TODO: No!

    ctrl.files = [];
    ctrl.loading = false;
    ctrl.uploadFiles = uploadFiles;

    // TODO: User feedback should say what has failed and what has not (Generators?)
    function uploadFiles(files) {
        ctrl.loading = true;

        var uploads = files.map(function(file) {
            return readFile(file).then(uploadFile);
        });

        $q.all(uploads).then(uploadSuccess, uploadFailure)
            .finally(() => ctrl.loading = false);
    }

    function readFile(file) {
        var reader = new FileReader();
        var def = $q.defer();

        reader.addEventListener('load',  event => def.resolve(event.target.result));
        reader.addEventListener('error', def.reject);
        reader.readAsArrayBuffer(file);

        return def.promise;
    }

    function uploadFile(file) {
        return loaderApi.load(new Uint8Array(file));
    }

    function uploadsIndexed(ids) {
        var def = $q.defer();
        var searchEveryPeriod = 500;
        var timeout;

        (function searchForUploads() {
            $timeout.cancel(timeout);
            mediaApi.search('', { ids: ids }).then(resp => resp.data).then(images => {
                if(images.length === ids.length) {
                    def.resolve(images);
                } else {
                    $timeout(searchForUploads, searchEveryPeriod);
                }
            }, def.reject);
        })();

        return def.promise;
    }

    function uploadSuccess(resps) {
        var ids = resps.map(resp => resp.data.id);

        return $q.all([uploadsIndexed(ids), mediaApi.getSession()]).then(([uploads, session]) => {
            // FIXME: This is just while we're allowing images through without metadata
            // We'll fix this once we add the interface to add metadata
            var invalid = uploads.filter(upload => !upload.data.valid).length > 0;
            if (invalid) {
                uploadFailure({body: {
                    errorMessage: "Upload failed: credit or description was missing"
                }});
            } else {
                $state.go('search.results', {uploadedBy: session.user.email});
            }
        });
    }

    // TODO: Universal messaging system?
    function uploadFailure(resp) {
        var error = resp.body && resp.body.errorMessage;
        $window.alert(error || 'There were errors uploading some / all of your files');
    }
}]);

kahuna.directive('fileUploader', ['templatesDirectory', function(templatesDirectory) {
    return {
        restrict: 'E',
        controller: 'FileUploaderCtrl as fileUploader',
        templateUrl: templatesDirectory + '/directives/file-uploader.html'
    }
}]);

angular.bootstrap(document, ['kahuna']);
