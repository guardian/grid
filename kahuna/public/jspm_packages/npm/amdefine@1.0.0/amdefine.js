/* */ 
(function(process) {
  'use strict';
  function amdefine(module, requireFn) {
    'use strict';
    var defineCache = {},
        loaderCache = {},
        alreadyCalled = false,
        path = require('path'),
        makeRequire,
        stringRequire;
    function trimDots(ary) {
      var i,
          part;
      for (i = 0; ary[i]; i += 1) {
        part = ary[i];
        if (part === '.') {
          ary.splice(i, 1);
          i -= 1;
        } else if (part === '..') {
          if (i === 1 && (ary[2] === '..' || ary[0] === '..')) {
            break;
          } else if (i > 0) {
            ary.splice(i - 1, 2);
            i -= 2;
          }
        }
      }
    }
    function normalize(name, baseName) {
      var baseParts;
      if (name && name.charAt(0) === '.') {
        if (baseName) {
          baseParts = baseName.split('/');
          baseParts = baseParts.slice(0, baseParts.length - 1);
          baseParts = baseParts.concat(name.split('/'));
          trimDots(baseParts);
          name = baseParts.join('/');
        }
      }
      return name;
    }
    function makeNormalize(relName) {
      return function(name) {
        return normalize(name, relName);
      };
    }
    function makeLoad(id) {
      function load(value) {
        loaderCache[id] = value;
      }
      load.fromText = function(id, text) {
        throw new Error('amdefine does not implement load.fromText');
      };
      return load;
    }
    makeRequire = function(systemRequire, exports, module, relId) {
      function amdRequire(deps, callback) {
        if (typeof deps === 'string') {
          return stringRequire(systemRequire, exports, module, deps, relId);
        } else {
          deps = deps.map(function(depName) {
            return stringRequire(systemRequire, exports, module, depName, relId);
          });
          if (callback) {
            process.nextTick(function() {
              callback.apply(null, deps);
            });
          }
        }
      }
      amdRequire.toUrl = function(filePath) {
        if (filePath.indexOf('.') === 0) {
          return normalize(filePath, path.dirname(module.filename));
        } else {
          return filePath;
        }
      };
      return amdRequire;
    };
    requireFn = requireFn || function req() {
      return module.require.apply(module, arguments);
    };
    function runFactory(id, deps, factory) {
      var r,
          e,
          m,
          result;
      if (id) {
        e = loaderCache[id] = {};
        m = {
          id: id,
          uri: __filename,
          exports: e
        };
        r = makeRequire(requireFn, e, m, id);
      } else {
        if (alreadyCalled) {
          throw new Error('amdefine with no module ID cannot be called more than once per file.');
        }
        alreadyCalled = true;
        e = module.exports;
        m = module;
        r = makeRequire(requireFn, e, m, module.id);
      }
      if (deps) {
        deps = deps.map(function(depName) {
          return r(depName);
        });
      }
      if (typeof factory === 'function') {
        result = factory.apply(m.exports, deps);
      } else {
        result = factory;
      }
      if (result !== undefined) {
        m.exports = result;
        if (id) {
          loaderCache[id] = m.exports;
        }
      }
    }
    stringRequire = function(systemRequire, exports, module, id, relId) {
      var index = id.indexOf('!'),
          originalId = id,
          prefix,
          plugin;
      if (index === -1) {
        id = normalize(id, relId);
        if (id === 'require') {
          return makeRequire(systemRequire, exports, module, relId);
        } else if (id === 'exports') {
          return exports;
        } else if (id === 'module') {
          return module;
        } else if (loaderCache.hasOwnProperty(id)) {
          return loaderCache[id];
        } else if (defineCache[id]) {
          runFactory.apply(null, defineCache[id]);
          return loaderCache[id];
        } else {
          if (systemRequire) {
            return systemRequire(originalId);
          } else {
            throw new Error('No module with ID: ' + id);
          }
        }
      } else {
        prefix = id.substring(0, index);
        id = id.substring(index + 1, id.length);
        plugin = stringRequire(systemRequire, exports, module, prefix, relId);
        if (plugin.normalize) {
          id = plugin.normalize(id, makeNormalize(relId));
        } else {
          id = normalize(id, relId);
        }
        if (loaderCache[id]) {
          return loaderCache[id];
        } else {
          plugin.load(id, makeRequire(systemRequire, exports, module, relId), makeLoad(id), {});
          return loaderCache[id];
        }
      }
    };
    function define(id, deps, factory) {
      if (Array.isArray(id)) {
        factory = deps;
        deps = id;
        id = undefined;
      } else if (typeof id !== 'string') {
        factory = id;
        id = deps = undefined;
      }
      if (deps && !Array.isArray(deps)) {
        factory = deps;
        deps = undefined;
      }
      if (!deps) {
        deps = ['require', 'exports', 'module'];
      }
      if (id) {
        defineCache[id] = [id, deps, factory];
      } else {
        runFactory(id, deps, factory);
      }
    }
    define.require = function(id) {
      if (loaderCache[id]) {
        return loaderCache[id];
      }
      if (defineCache[id]) {
        runFactory.apply(null, defineCache[id]);
        return loaderCache[id];
      }
    };
    define.amd = {};
    return define;
  }
  module.exports = amdefine;
})(require('process'));
