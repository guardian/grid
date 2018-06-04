// ==ClosureCompiler==
// @compilation_level SIMPLE_OPTIMIZATIONS
// @output_file_name mixpanel-jslib-2.2-snippet.min.js
// ==/ClosureCompiler==

/** @define {string} */
var MIXPANEL_LIB_URL = '//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js';

(function(document, mixpanel){
    // Only stub out if this is the first time running the snippet.
    if (!mixpanel['__SV']) {
        var script, first_script, gen_fn, functions, i, lib_name = "mixpanel";
        window[lib_name] = mixpanel;

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
            functions = "disable track track_pageview track_links track_forms register register_once alias unregister identify name_tag set_config people.set people.set_once people.increment people.append people.union people.track_charge people.clear_charges people.delete_user".split(' ');
            for (i = 0; i < functions.length; i++) {
                _set_and_defer(target, functions[i]);
            }

            // register mixpanel instance
            mixpanel['_i'].push([token, config, name]);
        };

        // Snippet version, used to fail on new features w/ old snippet
        mixpanel['__SV'] = 1.2;

        script = document.createElement("script");
        script.type = "text/javascript";
        script.async = true;

        script.src = typeof MIXPANEL_CUSTOM_LIB_URL !== 'undefined' ? MIXPANEL_CUSTOM_LIB_URL : MIXPANEL_LIB_URL;

        first_script = document.getElementsByTagName("script")[0];
        first_script.parentNode.insertBefore(script, first_script);
    }
// Pass in current Mixpanel object if it exists (for ppl like Optimizely)
})(document, window['mixpanel'] || []);
