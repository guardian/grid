// == start of cache polyfill ==

// Cannot feature-detect, as we have these implemented but they reject

if (!Cache.prototype.add) {
  Cache.prototype.add = function add(request) {
    return this.addAll([request]);
  };
}

if (!Cache.prototype.addAll) {
  Cache.prototype.addAll = function addAll(requests) {
    var cache = this;

    // Since DOMExceptions are not constructable:
    function NetworkError(message) {
      this.name = 'NetworkError';
      this.code = 19;
      this.message = message;
    }
    NetworkError.prototype = Object.create(Error.prototype);

    return Promise.resolve().then(function() {
      if (arguments.length < 1) throw new TypeError();

      // Simulate sequence<(Request or USVString)> binding:
      var sequence = [];

      requests = requests.map(function(request) {
        if (request instanceof Request) {
          return request;
        }
        else {
          return String(request); // may throw TypeError
        }
      });

      return Promise.all(
        requests.map(function(request) {
          if (typeof request === 'string') {
            request = new Request(request);
          }

          var scheme = new URL(request.url).protocol;

          if (scheme !== 'http:' && scheme !== 'https:') {
            throw new NetworkError("Invalid scheme");
          }

          return fetch(request.clone());
        })
      );
    }).then(function(responses) {
      // TODO: check that requests don't overwrite one another
      // (don't think this is possible to polyfill due to opaque responses)
      return Promise.all(
        responses.map(function(response, i) {
          return cache.put(requests[i], response);
        })
      );
    }).then(function() {
      return undefined;
    });
  };
}

if (!CacheStorage.prototype.match) {
  // This is probably vulnerable to race conditions (removing caches etc)
  CacheStorage.prototype.match = function match(request, opts) {
    var caches = this;

    return this.keys().then(function(cacheNames) {
      var match;

      return cacheNames.reduce(function(chain, cacheName) {
        return chain.then(function() {
          return match || caches.open(cacheName).then(function(cache) {
            return cache.match(request, opts);
          }).then(function(response) {
            match = response;
            return match;
          });
        });
      }, Promise.resolve());
    });
  };
}

// == end of cache polyfill ==


var version = 1;

self.oninstall = function(event) {
  event.waitUntil(
    self.caches.open('grid-v' + version).then(function(cache) {
      return cache.addAll([
        // TODO: or better, properly bundle these assets first (so
        // there are fewer), hash them, cache them forever, and then
        // apply SW caching on what's left
        '/',
        '/search',
        '/assets/stylesheets/main.css',
        '/assets/config.js',
        '/assets/jspm_packages/system.js',
        '/assets/jspm_packages/github/jmcriffey/bower-traceur-runtime@0.0.90.js',
        '/assets/jspm_packages/github/jmcriffey/bower-traceur-runtime@0.0.90/traceur-runtime.js',
        '/assets/js/dist/build.js',
        '/assets/stylesheets/fonts/GuardianAgateSans1Web-Regular.woff2',
        '/assets/images/grid-logo-32.png',
        '/assets/stylesheets/fonts/MaterialIcons-Regular.woff2'
      ].map(function(asset) {
          return new Request(asset, {credentials: 'same-origin'});
      }));
    })
  );
};

// TODO: response.ok

self.onfetch = function(event) {
  // Try and serve from cache if present
  event.respondWith(
    self.caches.match(event.request).then(function(response) {
        return response || fetch(event.request);
    })
  );
};
