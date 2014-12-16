/**
 * Done so that we don't create a script tag the way mixpanel wants us to
 * i.e: https://github.com/mixpanel/mixpanel-js/blob/master/mixpanel-jslib-snippet.js
 *
 * This has to be a CommonJS module so we can load syncronously, which ES6 imports
 * don't because of hoisting.
 */


var mixpanel = [];
var script, first_script, gen_fn, functions, i, lib_name = 'mixpanel';

window[lib_name] = mixpanel;
mixpanel['__SV'] = 1.2;
mixpanel['_i'] = [];

mixpanel['init'] = function (token, config, name) {
    // support multiple mixpanel instances
    var target = mixpanel;
    if (typeof(name) !== 'undefined') {
        target = mixpanel[name] = [];
    } else {
        name = lib_name;
    }

    // Pass in current people object if it exists
    target['people'] = target['people'] || [];
    target['toString'] = function(no_stub) {
        var str = lib_name;
        if (name !== lib_name) {
            str += "." + name;
        }
        if (!no_stub) {
            str += " (stub)";
        }
        return str;
    };
    target['people']['toString'] = function() {
        // 1 instead of true for minifying
        return target.toString(1) + ".people (stub)";
    };

    function _set_and_defer(target, fn) {
        var split = fn.split(".");
        if (split.length == 2) {
            target = target[split[0]];
            fn = split[1];
        }
        target[fn] = function(){
            target.push([fn].concat(Array.prototype.slice.call(arguments, 0)));
        };
    }

    // create shallow clone of the public mixpanel interface
    // Note: only supports 1 additional level atm, e.g. mixpanel.people.set, not mixpanel.people.set.do_something_else.
    functions = "disable track track_pageview track_links track_forms register register_once alias unregister identify name_tag set_config people.set people.set_once people.increment people.append people.track_charge people.clear_charges people.delete_user".split(' ');
    for (i = 0; i < functions.length; i++) {
        _set_and_defer(target, functions[i]);
    }

    // register mixpanel instance
    mixpanel['_i'].push([token, config, name]);
};

require('mixpanel-js/mixpanel');

// We can't export mixpanel here as that takes a snap shot of the var at the time.
// i.e. `export window.mixpanel` won't work as it is then modified, but we've already exported it
// TODO: perhaps `module.exports = function() { return window.mixpanel }`?
