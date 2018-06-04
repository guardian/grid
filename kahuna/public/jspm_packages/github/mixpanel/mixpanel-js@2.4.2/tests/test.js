(function() {

var old_onload = window.onload;
var old_handler_run = false;
window.onload = function() {
    if (old_onload) old_onload.call(window);
    old_handler_run = true;
    return true;
};

var _jsc = [];
var mpmodule = function(module_name, extra_setup, extra_teardown) {
    module(module_name, {
        setup: function() {
            this.token = rand_name();
            this.id = rand_name();

            mixpanel.init(this.token, { track_pageview: false, debug: true }, "test");
            _.each(_jsc, function(key) {
                mixpanel.test._jsc[key] = function() {};
            });

            if (extra_setup) { extra_setup.call(this); }
        },
        teardown: function() {
            // When we tear this down each time we lose the callbacks.
            // We don't always block on .track() calls, so in browsers where
            // we can't use xhr, the jsonp query is invalid. To fix this,
            // we save the keys but make the callbacks noops.
            if (mixpanel.test) {
                _jsc = _.uniq(_jsc.concat(_.keys(mixpanel.test._jsc)));
                clearLibInstance(mixpanel.test);
            }

            if (extra_teardown) { extra_teardown.call(this); }
        }
    });
};

var USE_XHR = (window.XMLHttpRequest && 'withCredentials' in new XMLHttpRequest());
var xhrmodule = function(module_name) {
    mpmodule(module_name, function() {
        this.xhr = sinon.useFakeXMLHttpRequest();
        this.requests = [];
        this.xhr.onCreate = _.bind(function(req) { this.requests.push(req); }, this);
    }, function() {
        this.xhr.restore();
    });
}

function notOk(state, message) {
    equal(state, false, message);
};

function isUndefined(prop, message) {
    ok(typeof(prop) === "undefined", message);
}

function callsError(callback, message) {
    var old_error = console.error;

    console.error = function(msg) {
        ok(msg == 'Mixpanel error:', message);
    }

    callback(function() {
        console.error = old_error;
    });
}

function clearLibInstance(instance) {
    var name = instance.config.name;
    if (name === "mixpanel") {
        throw "Cannot clear main lib instance";
    }
    instance.cookie.clear();
    delete mixpanel[name];
}

var append_fixture = function(a) {
    $('#qunit-fixture').append(a);
}

var ele_with_class = function() {
    var name = rand_name();
    var class_name = "."+name;
    var a = $("<a></a>").attr("class", name).attr("href","#");
    append_fixture(a);
    return { e: a.get(0), class_name: class_name, name: name };
}

var form_with_class = function() {
    var name = rand_name();
    var class_name = "."+name;
    var f = $("<form>").attr("class", name);
    append_fixture(f);
    return { e: f.get(0), class_name: class_name, name: name };
}

var ele_with_id = function() {
    var name = rand_name();
    var id = "#" + name;
    var a = $("<a></a>").attr("id", name).attr("href","#");
    append_fixture(a);
    return { e: $(id).get(0), id: id, name: name };
}

var rand_name = function() {
    return "test_" + Math.floor(Math.random() * 10000000);
};

var clear_super_properties = function(inst) {
    (inst || mixpanel).cookie.clear();
};

// does obj a contain all of obj b?
var contains_obj = function(a, b) {
    return !_.any(b, function(val, key) {
        return !(a[key] === b[key]);
    });
};

var cookie = {
    exists: function(name) {
        return document.cookie.indexOf(name + "=") !== -1;
    },

    get: function(name) {
        var nameEQ = name + "=";
        var ca = document.cookie.split(';');
        for(var i=0;i < ca.length;i++) {
            var c = ca[i];
            while (c.charAt(0)==' ') c = c.substring(1,c.length);
            if (c.indexOf(nameEQ) == 0) return decodeURIComponent(c.substring(nameEQ.length,c.length));
        }
        return null;
    },

    set: function(name, value, days, cross_subdomain) {
        var cdomain = "", expires = "";

        if (cross_subdomain) {
            var matches = document.location.hostname.match(/[a-z0-9][a-z0-9\-]+\.[a-z\.]{2,6}$/i)
            , domain = matches ? matches[0] : '';

            cdomain   = ((domain) ? "; domain=." + domain : "");
        }

        if (days) {
            var date = new Date();
            date.setTime(date.getTime()+(days*24*60*60*1000));
            expires = "; expires=" + date.toGMTString();
        }

        document.cookie = name+"="+encodeURIComponent(value)+expires+"; path=/"+cdomain;
    },

    remove: function(name, cross_subdomain) {
        cookie.set(name, '', -1, cross_subdomain);
    }
};

var wait = function(condition, callback, error_timeout) {
    var start = new Date().getTime();
    var f = function() {
        if (typeof(error_timeout) !== "undefined" && new Date().getTime() - start >= error_timeout) { return callback(true); }

        if (!condition()) { setTimeout(f, 100); }
        else { callback(false); }
    }
    f();
};

function simulateEvent(element, type) {
    if (document.createEvent) {
        // Trigger for the good browsers
        var trigger = document.createEvent('HTMLEvents');
        trigger.initEvent(type, true, true);
        element.dispatchEvent(trigger);
    } else if (document.createEventObject) {
        // Trigger for Internet Explorer
        var trigger = document.createEventObject();
        element.fireEvent('on' + type, trigger);
    }
}

function simulateMouseClick(element) {
    if (element.click) { element.click(); }
    else {
        var evt = element.ownerDocument.createEvent('MouseEvents');
        evt.initMouseEvent('click', true, true, element.ownerDocument.defaultView, 1, 0, 0, 0, 0, false, false, false, false, 0, null);
        element.dispatchEvent(evt);
    }
}

function date_to_ISO(d) {
    // YYYY-MM-DDTHH:MM:SS in UTC
    function pad(n) {return n < 10 ? '0' + n : n}
    return d.getUTCFullYear() + '-'
        + pad(d.getUTCMonth() + 1) + '-'
        + pad(d.getUTCDate()) + 'T'
        + pad(d.getUTCHours()) + ':'
        + pad(d.getUTCMinutes()) + ':'
        + pad(d.getUTCSeconds());
}

window.test_async = function() {
    /* Tests for async/snippet behavior (prior to load).
     * Make sure we re-order args, etc.
     */

    var test1 = {
        id: "asjief32f",
        name: "bilbo",
        properties: null
    };

    mixpanel.push(function() {
        this.cookie.clear();
    });

    mixpanel.track('test', {}, function(response, data) {
        test1.properties = data.properties;
    });
    var lib_loaded = mixpanel.__loaded;
    mixpanel.identify(test1.id);
    mixpanel.name_tag(test1.name);

    // only run pre-load snippet tests if lib didn't finish loading before identify/name_tag calls
    if (!lib_loaded) {
        module("async tracking");

            test("priority functions", 2, function() {
                stop();

                wait(function() { return test1.properties !== null; }, function() {
                    var p = test1.properties;
                    same(p.mp_name_tag, test1.name, "name_tag should fire before track");
                    same(p.distinct_id, test1.id, "identify should fire before track");
                    start();
                });
            });
    } else {
        var warning = 'mixpanel-js library loaded before test setup; skipping async tracking tests';
        $('#qunit-userAgent').after($('<div class="qunit-warning" style="color:red;padding:10px;">Warning: ' + warning + '</div>'));
    }
};

window.test_mixpanel = function(mixpanel) {

/* Tests to run once the lib is loaded on the page.
 */
setTimeout( function() {

module("onload handler preserved");
    test("User Onload handlers are preserved", 1, function() {
        ok(old_handler_run, "Old onload handler was run");
    });

mpmodule("mixpanel.track");

    asyncTest("check callback", 1, function() {
        mixpanel.test.track('test', {}, function(response) {
            same(response, 1, "server returned 1");
            start();
        });
    });

    asyncTest("check no property name aliasing occurs during minify", 1, function() {
        var ob = {};
        var letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        _.each(letters, function(l1) {
            ob[l1] = l1;
            _.each(letters, function(l2) {
                var pair = l1 + l2;
                ob[pair] = pair;
            });
        });

        var expect_ob = _.extend({}, ob);
        expect_ob.token = this.token;
        mixpanel.test.track('test', ob, function(response) {
            deepEqual(ob, expect_ob, 'Nothing strange happened to properties');
            start();
        });
    });

    test("token property does not override configured token", 1, function() {
        var props = {token: "HOPE NOT"};
        var data = mixpanel.test.track('test', props);
        same(data.properties.token, mixpanel.test.get_config('token'), 'Property did not override token');
    });

    asyncTest("callback doesn't override", 1, function() {
        var result = [];
        mixpanel.test.track('test', {}, function(response) {
            result.push(1);
        });
        mixpanel.test.track('test', {}, function(response) {
            result.push(2);
        });

        setTimeout(function() {
            function i(n) { return _.include(result, n); }
            ok(i(1) && i(2), 'both callbacks executed.');
            start();
        }, 3000);
    });

    test("ip is honored", 2, function() {
        mixpanel.test.set_config({ img: true });
        mixpanel.test.track("ip enabled");

        var with_ip = $('img').get(-1);
        mixpanel.test.set_config({ ip: 0 });
        mixpanel.test.track("ip disabled");
        var without_ip = $('img').get(-1);

        ok(with_ip.src.indexOf('ip=1') > 0, '_send_request should send ip=1 by default');
        ok(without_ip.src.indexOf('ip=0') > 0, '_send_request should send ip=0 when the config ip=false');
    });

    test("disable() disables all tracking from firing", 2, function() {
        stop(); stop();

        mixpanel.test.disable();

        mixpanel.test.track("event_a", {}, function(response) {
            same(response, 0, "track should return an error");
            start();
        });

        mixpanel.test.track("event_b", {}, function(response) {
            same(response, 0, "track should return an error");
            start();
        });
    });

    test("disable([event_arr]) disables individual events", 3, function() {
        stop(); stop(); stop();

        // doing it in two passes to test the disable's concat functionality
        mixpanel.test.disable(['event_a']);
        mixpanel.test.disable(['event_c']);

        mixpanel.test.track("event_a", {}, function(response) {
            same(response, 0, "track should return an error");
            start();
        });

        mixpanel.test.track("event_b", {}, function(response) {
            same(response, 1, "track should be successful");
            start();
        });

        mixpanel.test.track("event_c", {}, function(response) {
            same(response, 0, "track should return an error");
            start();
        });
    });

    // callsError may fail if there is no console, so we can't expect 2 tests
    test("img based tracking", function() {
        var initial_image_count = $('img').length
            , e1 = ele_with_class();

        stop();

        mixpanel.test.set_config({ img: true });
        mixpanel.test.track("image tracking");

        if (window.console) {
            stop();
            callsError(function(restore_console) {
                mixpanel.test.track_links(e1.class_name, "link_clicked");
                restore_console();
                start();
            }, "dom tracking should be disabled");
        }

        wait(function() { return initial_image_count + 1 == $('img').length; }, function(timeout_fired) {
            notOk(timeout_fired, "image tracking added an image to the page");
            start();
        }, 10000);
    });

    test("should truncate properties to 255 characters", 7, function() {
        var props = {
            short_prop: "testing 1 2 3"
            , long_prop: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. In felis ipsum, tincidunt ut cursus ut, venenatis at odio. Vivamus sagittis, velit at porta mattis, metus augue posuere augue, et commodo risus dui non purus. Phasellus varius accumsan urna ut luctus. Duis at lorem diam, in aliquam massa nunc."
            , number: 2342
            , obj: {
                long_prop: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. In felis ipsum, tincidunt ut cursus ut, venenatis at odio. Vivamus sagittis, velit at porta mattis, metus augue posuere augue, et commodo risus dui non purus. Phasellus varius accumsan urna ut luctus. Duis at lorem diam, in aliquam massa nunc."
            }
            , num_array: [1,2,3]
            , longstr_array: ["Lorem ipsum dolor sit amet, consectetur adipiscing elit. In felis ipsum, tincidunt ut cursus ut, venenatis at odio. Vivamus sagittis, velit at porta mattis, metus augue posuere augue, et commodo risus dui non purus. Phasellus varius accumsan urna ut luctus. Duis at lorem diam, in aliquam massa nunc."]
        };

        var data = mixpanel.test.track("Lorem ipsum dolor sit amet, consectetur adipiscing elit. In felis ipsum, tincidunt ut cursus ut, venenatis at odio. Vivamus sagittis, velit at porta mattis, metus augue posuere augue, et commodo risus dui non purus. Phasellus varius accumsan urna ut luctus. Duis at lorem diam, in aliquam massa nunc.", props);

        same(data.event.length, 255, "event name should be truncated");
        same(data.properties.short_prop, props.short_prop, "short string properties should not be truncated");
        same(data.properties.long_prop.length, 255, "long string properties should be truncated");
        same(data.properties.number, props.number, "numbers should be ignored");
        same(data.properties.obj.long_prop.length, 255, "sub objects should have truncated values");
        same(data.properties.num_array, props.num_array, "sub arrays of numbers should be ignored");
        same(data.properties.longstr_array[0].length, 255, "sub arrays of strings should have truncated values");
    });// truncate properties test

    test("should send screen properties", 2, function() {
        var data = mixpanel.test.track('test', {});

        same(data.properties.$screen_height, screen.height);
        same(data.properties.$screen_width, screen.width);
    });

mpmodule("json");

    test("basic", 2, function() {
        var o = 'str';
        var encoded = mixpanel._.JSONEncode(o);
        var expected = '"str"';
        ok(encoded, expected, "encoded string is correct");

        o = {'str': 'str', 2: 2, 'array': [1], 'null': null};
        encoded = mixpanel._.JSONEncode(o);
        var decoded = mixpanel._.JSONDecode(encoded);
        ok(_.isEqual(decoded, o), "roundtrip should be equal");
    });

    test("special chars", 2, function() {
        var o = '\b';
        var encoded = mixpanel._.JSONEncode(o);
        var valid = ['"\\b"', '"\\u0008"'];
        ok(_.indexOf(valid, encoded) >= 0, "encoded string is correct");

        var decoded = mixpanel._.JSONDecode(encoded);
        ok(_.isEqual(decoded, o), "roundtrip should be equal");
    });

if (!window.COOKIE_FAILURE_TEST) {
    mpmodule("cookies");

        test("cookie manipulation", 4, function() {
            var c = mixpanel._.cookie
                , name = "mp_test_cookie_2348958345"
                , content = "testing 1 2 3;2jf3f39*#%&*%@)(@%_@{}[]";

            if (cookie.exists(name)) {
                c.remove(name);
            }

            notOk(cookie.exists(name), "test cookie should not exist");

            c.set(name, content);

            ok(cookie.exists(name), "test cookie should exist");

            equal(c.get(name), content, "cookie.get should return the cookie's content");

            c.remove(name);

            notOk(cookie.exists(name), "test cookie should not exist");
        });

        test("cookie name", 6, function() {
            var token = "FJDIF"
                , name1 = "mp_"+token+"_mixpanel"
                , name2 = "mp_cn2";

            notOk(cookie.exists(name1), "test cookie should not exist");

            mixpanel.init(token, {}, "cn1");
            ok(cookie.exists(name1), "test cookie should exist");

            notOk(cookie.exists(name2), "test cookie 2 should not exist");

            mixpanel.init(token, { cookie_name: "cn2" }, "cn2");
            ok(cookie.exists(name2), "test cookie 2 should exist");

            mixpanel.cn1.cookie.clear();
            mixpanel.cn2.cookie.clear();

            notOk(cookie.exists(name1), "test cookie should not exist");
            notOk(cookie.exists(name2), "test cookie 2 should not exist");

            clearLibInstance(mixpanel.cn1);
            clearLibInstance(mixpanel.cn2);
        });

        test("cross subdomain", 4, function() {
            var name = mixpanel.test.config.cookie_name;

            ok(mixpanel.test.cookie.get_cross_subdomain(), "Cross subdomain should be set correctly");
            // Remove non-cross-subdomain cookie if it exists.
            cookie.remove(name, false);
            ok(cookie.exists(name), "Cookie should still exist");

            mixpanel.test.set_config({ cross_subdomain_cookie: false });
            notOk(mixpanel.test.cookie.get_cross_subdomain(), "Should switch to false");
            // Remove cross-subdomain cookie if it exists.
            cookie.remove(name, true);
            ok(cookie.exists(name), "Cookie should still exist for current subdomain");
        });

        test("Old values loaded", 1, function() {
            var c1 = {
                distinct_id: '12345',
                asdf: 'asdf',
                $original_referrer: 'http://whodat.com'
            };
            var token = "oldvalues9087tyguhbjkn",
                name = "mp_" + token + "_mixpanel";

            // Set some existing cookie values & make sure they are loaded in correctly.
            cookie.remove(name);
            cookie.remove(name, true);
            cookie.set(name, mixpanel._.JSONEncode(c1));

            var ov1 = mixpanel.init(token, {}, "ov1");
            ok(contains_obj(ov1.cookie.props, c1), "original cookie values should be loaded");
            clearLibInstance(mixpanel.ov1);
        });

        test("cookie upgrade", 12, function() {
            var c1 = {
                'all': { 'test': '7abc' },
                'events': { 'test2': 'ab8c' },
                'funnels': { 'test3': 'ab6c' }
            };

            // Set up a cookie with the name used by the old lib
            cookie.remove('mp_super_properties');
            cookie.remove('mp_super_properties', true);
            cookie.set('mp_super_properties', mixpanel._.JSONEncode(c1));

            var cu0 = mixpanel.init("ajsfjow", { upgrade: true }, "cu0");

            notOk(cookie.exists('mp_super_properties'), "upgrade should remove the cookie");

            ok(contains_obj(cu0.cookie.props, c1['all']), "old cookie[all] was imported");
            ok(contains_obj(cu0.cookie.props, c1['events']), "old cookie[events] was imported");
            notOk(contains_obj(cu0.cookie.props, c1['funnels']), "old cookie[funnels] was not imported");

            var c2 = {
                'all': { 'test4': 'a3bc' },
                'events': { 'test5': 'a2bc' },
                'funnels': { 'test6': 'a5bc' }
            };

            // Set up an old-style cookie with a custom name
            cookie.remove('mp_super_properties_other');
            cookie.remove('mp_super_properties_other', true);
            cookie.set('mp_super_properties_other', mixpanel._.JSONEncode(c2));

            var cu1 = mixpanel.init("ajsfdjow", { upgrade: 'mp_super_properties_other' }, "cu1");

            notOk(cookie.exists('mp_super_properties_other'), "upgrade should remove the cookie");

            ok(contains_obj(cu1.cookie.props, c2['all']), "old cookie[all] was imported");
            ok(contains_obj(cu1.cookie.props, c2['events']), "old cookie[events] was imported");
            notOk(contains_obj(cu1.cookie.props, c2['funnels']), "old cookie[funnels] was not imported");

            var c3 = { 'a': 'b' }
                , token = "cookieupgrade3_23fj902"
                , name = "mp_" + token + "_mixpanel"
                , old_name = "mp_" + token + "_cu2";

            cookie.remove(name);
            cookie.remove(name, true);
            cookie.remove(old_name);
            cookie.remove(old_name, true);

            // Set up a cookie with the tracker name appended, like this one used to.
            cookie.set(old_name, mixpanel._.JSONEncode(c3));

            var cu2 = mixpanel.init(token, {}, 'cu2');

            // Old cookie should be removed when lib is initialized
            notOk(cookie.exists(old_name), "initializing a lib with a custom name should kill off the old name");
            ok(contains_obj(cu2.cookie.props, c3), "old cookie was imported");

            var c4 = { 'c': 'd' }
                , token = "cookieupgrade4_29fj"
                , name = "mp_" + token + "_mixpanel"
                , old_name = "mp_" + token + "_cu3";

            // Set the cookie the lib will set by default
            cookie.remove(name);
            cookie.remove(name, true);
            cookie.set(name, mixpanel._.JSONEncode(c4));

            // Reset the cookie with the tracker name appended
            cookie.remove(old_name);
            cookie.remove(old_name, true);
            // Set c value in old cookie - we want to test to make sure it doesn't override
            // the current one.
            cookie.set(old_name, mixpanel._.JSONEncode({ 'c': 'error' }));

            var cu3 = mixpanel.init(token, { upgrade: true }, 'cu3');

            notOk(cookie.exists(old_name), "initializing the lib should kill off the old one, even if the correct name exists");
            ok(contains_obj(cu3.cookie.props, c4), "old cookie should be imported");

            clearLibInstance(cu0);
            clearLibInstance(cu1);
            clearLibInstance(cu2);
            clearLibInstance(cu3);
        });

        test("disable cookies", 7, function() {
            var c_name = "mpl_should_not_exist";

            cookie.remove(c_name);
            cookie.remove(c_name, true);

            mixpanel.init("Asdfja", { cookie_name: c_name, disable_cookie: true }, "dc0");

            notOk(cookie.exists(c_name), "cookie should not exist");

            var dc1 = mixpanel.init("Asdf", { cookie_name: c_name }, "dc1");
            dc1.set_config({ disable_cookie: true });

            notOk(cookie.exists(c_name), "cookie 2 should not exist");

            var props = { 'a': 'b' };
            dc1.register(props);

            stop();
            var data = dc1.track('test', {'c': 'd'}, function(response) {
                same(response, 1, "tracking still works");
                start();
            });

            var dp = data.properties;

            ok('token' in dp, "token included in properties");

            ok(contains_obj(dp, {'a': 'b', 'c': 'd'}), 'super properties included correctly');
            ok(contains_obj(dc1.cookie.props, props), "Super properties saved");

            notOk(cookie.exists(c_name), "cookie 2 should not exist even after tracking/registering");
        });

        function cookie_included(name, callback) {
            $.getJSON("/tests/cookie_included/" + name, function(resp) {
                callback(resp);
            });
        }

        asyncTest("secure cookie false by default", 1, function() {
            cookie_included(mixpanel.test.cookie.name, function(resp) {
                same(resp, 1, "cookie is included in request to server");
                start();
            });
        });

        asyncTest("secure cookie only sent to https", 1, function() {
            mixpanel.test.set_config({ secure_cookie: true });
            var expected = document.location.protocol === "https:" ? 1 : 0;

            cookie_included(mixpanel.test.cookie.name, function(resp) {
                same(resp, expected, "cookie is only included in request to server if https");
                start();
            });
        });
}

mpmodule("mixpanel");

    test("constructor", window.COOKIE_FAILURE_TEST ? 2 : 3, function() {
        var token = 'ASDF',
            sp = { 'test': 'all' };

        mixpanel.init(token, { cookie_name: 'mpl_t2', track_pageview: false }, 'mpl');

        mixpanel.mpl.register(sp);
        ok(contains_obj(mixpanel.mpl.cookie.props, sp), "Super properties set correctly");

        // Recreate object - should pull super props from cookie
        mixpanel.init(token, { cookie_name: 'mpl_t2', track_pageview: false }, 'mpl2');
        if (!window.COOKIE_FAILURE_TEST) {
            ok(contains_obj(mixpanel.mpl2.cookie.props, sp), "Super properties saved to cookie");
        }

        mixpanel.init(token, { cookie_name: 'mpl_t', track_pageview: false }, 'mpl3');
        var props = mixpanel.mpl3.cookie.properties();
        delete props['distinct_id'];
        same(props, {}, "Super properties shouldn't be loaded from mixpanel cookie")

        clearLibInstance(mixpanel.mpl);
        clearLibInstance(mixpanel.mpl2);
        clearLibInstance(mixpanel.mpl3);
    });

    test("info properties included", 5, function() {
        var info_props = "$os $browser $referrer $referring_domain mp_lib".split(' ');

        var data = mixpanel.test.track("check info props");
        _.each(info_props, function(prop) {
            ok(prop in data.properties, "properties should include " + prop);
        });
    });

    test("initial referrers set correctly", 8, function() {
        var i_ref = "$initial_referrer",
            i_ref_d = "$initial_referring_domain",
            none_val = "$direct";

        // force properties to be created
        mixpanel.test.track_pageview();

        ok(i_ref in mixpanel.test.cookie.props, "initial referrer saved");
        ok(i_ref_d in mixpanel.test.cookie.props, "initial referring domain saved");

        // Clear cookie so we can emulate missing referrer.
        mixpanel.test.cookie.clear();
        mixpanel.test.cookie.update_referrer_info("");

        // If referrer is missing, we want to mark it as None (type-in)
        ok(mixpanel.test.cookie.props[i_ref] === none_val, "emixpanel.testty referrer should mark $initial_referrer as None");
        ok(mixpanel.test.cookie.props[i_ref_d] === none_val, "emixpanel.testty referrer should mark $initial_referring_domain as None");

        var ref = "http://examixpanel.testle.com/a/b/?c=d";
        // Now we update, but the vals should remain None.
        mixpanel.test.cookie.update_referrer_info(ref);
        equal(mixpanel.test.cookie.props[i_ref], none_val, "$inital_referrer should remain None, even after getting a referrer");
        equal(mixpanel.test.cookie.props[i_ref_d], none_val, "$initial_referring_domain should remain None even after getting a referrer");

        // Clear cookie so we can try a real domain
        mixpanel.test.cookie.clear();
        mixpanel.test.cookie.update_referrer_info(ref);
        equal(mixpanel.test.cookie.props[i_ref], ref, "Full referrer should be saved");
        equal(mixpanel.test.cookie.props[i_ref_d], "examixpanel.testle.com", "Just domain should be saved");
    });

    test("set_config", 2, function() {
        ok(!mixpanel.config.test, "test isn't set already");
        mixpanel.set_config({ test: 1 });
        ok(mixpanel.config.test == 1, "config is saved");
    });

    test("get_property", 2, function() {
        var prop = "test_get_property", value = "23fj22j09jdlsa";

        if (mixpanel.cookie.props[prop]) { delete mixpanel.cookie.props[prop]; }
        ok(typeof(mixpanel.get_property(prop)) === 'undefined', "get_property returns undefined for unset properties");

        mixpanel.register({ "test_get_property": value });
        ok(mixpanel.get_property(prop) === value, "get_property successfully returns the correct super property's value");
    });

    test("save_search_keyword", 8, function() {
        var test_data = [
            ["google", "http://www.google.com/#sclient=psy&hl=en&site=&source=hp&q=test&aq=f&aqi=g5&aql=f&oq=&pbx=1&bav=on.2,or.r_gc.r_pw.&fp=78e75b26b3ba4591"]
            , ["google", "http://www.google.ca/#sclient=psy&hl=en&biw=1200&bih=1825&source=hp&q=test&aq=f&aqi=g5&aql=&oq=&pbx=1&bav=on.2,or.r_gc.r_pw.&fp=ee961497a1bb4875"]
            , ["google", "http://www.google.be/#hl=nl&source=hp&biw=1200&bih=1794&q=test&oq=test&aq=f&aqi=g10&aql=&gs_sm=e&gs_upl=1808l2038l0l4l2l0l0l0l0l139l210l1.1&bav=on.2,or.r_gc.r_pw.&fp=e8b05776699ca8de"]
            , ["bing", "http://www.bing.com/search?q=test&go=&form=QBLH&qs=n&sk=&sc=8-4"]
            , ["bing", "http://be.bing.com/search?q=test&go=&form=QBLH&filt=all"]
            , ["yahoo", "http://search.yahoo.com/search;_ylt=A0oGdSBmkd1NN0AAivtXNyoA?p=test&fr2=sb-top&fr=yfp-t-701&type_param="]
            , ["yahoo", "http://ca.search.yahoo.com/search;_ylt=A0oGkmd_kd1NFzcAJGnrFAx.;_ylc=X1MDMjExNDcyMTAwMwRfcgMyBGFvAzEEZnIDeWZwLXQtNzE1BGhvc3RwdmlkAzRlMnVfVW9Ha3lraE5xTmRUYjlsX1FQcFJpU1NNazNka1g4QUF3YUIEbl9ncHMDMTAEbl92cHMDMARvcmlnaW4Dc3JwBHF1ZXJ5A3Rlc3QEc2FvAzEEdnRlc3RpZANNU1lDQUMx?p=test&fr2=sb-top&fr=yfp-t-715&rd=r1"]
            , ["duckduckgo", "http://duckduckgo.com/?q=test"]
        ];

        var props = {'mp_keyword': 'test', '$search_engine': ''};

        for (var i = 0; i < test_data.length; i++) {
            clear_super_properties();
            mixpanel.cookie.update_search_keyword(test_data[i][1]);
            props["$search_engine"] = test_data[i][0];
            same(mixpanel.cookie.props, props, "Save search keyword parses query " + i);
        }
    });

mpmodule("super properties");

    var get_props_without_distinct_id = function(instance) {
        return _.omit(instance.cookie.properties(), 'distinct_id');
    };

    test("register", 2, function() {
        var props = {'hi': 'there'},
            cookie_props = get_props_without_distinct_id(mixpanel.test);

        same(cookie_props, {}, "empty before setting");

        mixpanel.test.register(props);

        same(get_props_without_distinct_id(mixpanel.test), props, "properties set properly");
    });

    test("register_once", 3, function() {
        var props = {'hi': 'there'},
            props1 = {'hi': 'ho'}

        same(get_props_without_distinct_id(mixpanel.test), {}, "empty before setting");

        mixpanel.test.register_once(props);

        same(get_props_without_distinct_id(mixpanel.test), props, "properties set properly");

        mixpanel.test.register_once(props1);

        same(get_props_without_distinct_id(mixpanel.test), props, "register_once doesn't override already set super property");
    });

    test("identify", 1, function() {
        mixpanel.test.identify(this.id);
        same(mixpanel.test.get_distinct_id(), this.id);
    });

    test("name_tag", 2, function() {
        var name_tag = "fake name";
        same(get_props_without_distinct_id(mixpanel.test), {}, "empty before setting");

        mixpanel.test.name_tag(name_tag);
        same(get_props_without_distinct_id(mixpanel.test), { 'mp_name_tag': name_tag }, "name tag set");
    });

    test("super properties included", 2, function() {
        var props = { 'a': 'b', 'c': 'd' };
        mixpanel.test.register(props);

        var data = mixpanel.test.track('test');
        var dp = data.properties;

        ok('token' in dp, "token included in properties");

        ok(contains_obj(dp, props), 'super properties included correctly');
    });

    test("super properties overridden by manual props", 2, function() {
        var props = { 'a': 'b', 'c': 'd' };
        mixpanel.test.register(props);

        var data = mixpanel.test.track('test', {'a': 'c'});
        var dp = data.properties;

        ok('token' in dp, "token included in properties");

        ok(contains_obj(dp, {'a': 'c', 'c': 'd'}), 'super properties included correctly');
    });

module("mixpanel.track_links");

    asyncTest("callback test", 1, function() {
        var e1 = ele_with_class();

        mixpanel.track_links(e1.class_name, "link_clicked", {"property": "dodeo"}, function() {
            start();
            ok(1===1, "track_links callback was fired");
            return false; // this stops the browser from going to the link location
        });

        simulateMouseClick(e1.e);
    });

    asyncTest("callbacks are preserved", 1, function() {
        var e1 = ele_with_class();

        var old_was_fired = false;

        e1.e.onclick = function() {
            old_was_fired = true;
            return false;
        };

        mixpanel.track_links(e1.class_name, "link_clicked", {"property": "it works"}, function() {
            start();
            ok(old_was_fired, "Old event was fired, and new event was fired");
            return false;
        });

        simulateMouseClick(e1.e);
    });

    asyncTest("supports changing the timeout", 3, function() {
        var e1 = ele_with_class();

        same(mixpanel.config.track_links_timeout, 300, "track_links_timeout defaults to a sane value");
        mixpanel.set_config({"track_links_timeout": 1000});
        same(mixpanel.config.track_links_timeout, 1000, "track_links_timeout can be changed");

        // setting it to 1 so the callback fires right away
        mixpanel.set_config({"track_links_timeout": 1});
        mixpanel.track_links(e1.class_name, "do de do", {}, function(timeout_occured) {
            ok(timeout_occured, "track_links_timeout successfully modified the timeout");
            mixpanel.set_config({"track_links_timeout": 300});
            start();
            return false;
        });

        simulateMouseClick(e1.e);
    });

    asyncTest("adds a url property to events", 1, function() {
        var e1 = ele_with_class();

        e1.e.href = "#test";
        mixpanel.track_links(e1.class_name, "testing url property", {}, function(timeout_occured, properties) {
            ok(properties.url !== undefined && properties.url !== null, "Url property was successfully added");
            start();
            return false;
        });

        simulateMouseClick(e1.e);
    });

    // callsError may fail if there is no console, so we can't expect 1 tests
    test("gracefully fails on invalid query", function() {
        var e1 = ele_with_id(),
            e2 = ele_with_id();

        mixpanel.track_links("a" + e1.id, "this should work");

        if (window.console) {
            stop();
            callsError(function(restore_console) {
                mixpanel.track_links("a#badbadbadid", "this shouldn't work");
                restore_console();
                start();
            }, "terrible query should not throw exception");
        }
    });

    test("dom selection library handles svg object className's", 1, function() {
        var name = rand_name(),
            svg = $('<svg width="300" height="100" class="' + name + '"><text class=".label" x="200" y="30">Test</text></svg>');
        append_fixture(svg);

        try {
            mixpanel.track_links('.test', "this should not fire an error");
            ok(true);
        } catch (err) {
            if (/TypeError/.exec(err)) {
                ok(false, "shouldn't throw a type error");
            } else {
                throw err;
            }
        }

        svg.remove();
    });

module("mixpanel.track_forms");

    asyncTest("callback test", 1, function() {
        var e1 = form_with_class();

        mixpanel.track_forms(e1.class_name, "form_submitted", {"property": "dodeo"}, function() {
            start();
            ok(1===1, "track_forms callback was fired");
            return false; // this stops the browser from going to the link location
        });

        simulateEvent(e1.e, 'submit');
    });

    asyncTest("supports changing the timeout", 3, function() {
        var e1 = form_with_class();

        same(mixpanel.config.track_links_timeout, 300, "track_links_timeout defaults to a sane value");
        mixpanel.set_config({"track_links_timeout": 1000});
        same(mixpanel.config.track_links_timeout, 1000, "track_links_timeout can be changed");

        // setting it to 1 so the callback fires right away
        mixpanel.set_config({"track_links_timeout": 1});
        mixpanel.track_forms(e1.class_name, "do de do", {}, function(timeout_occured) {
            start();
            ok(timeout_occured, "track_links_timeout successfully modified the timeout (track_forms)");
            mixpanel.set_config({"track_links_timeout": 300});
            return false;
        });

        simulateEvent(e1.e, 'submit');
    });

mpmodule("mixpanel.alias");
    var __alias = "__alias";

    test("alias sends an event", 2, function() {
        var old_id = mixpanel.test.get_distinct_id(),
            new_id = this.id;

        var ev = mixpanel.test.alias(new_id);

        notOk(old_id === new_id);
        same(ev["event"], "$create_alias");
    });

    test("$create_alias contains required properties", 1, function() {
        var old_id = mixpanel.test.get_distinct_id(),
            new_id = this.id;

        var ev = mixpanel.test.alias(new_id);

        same({ "distinct_id": old_id, "alias": new_id }, _.pick(ev.properties, "distinct_id", "alias"));
    });

    test("continues to use old ID after alias call", 3, function() {
        var old_id = mixpanel.test.get_distinct_id(),
            new_id = this.id;
        notOk(old_id === new_id);

        mixpanel.test.alias(new_id);
        same(mixpanel.test.get_distinct_id(), old_id);
        same(mixpanel.test.get_property(__alias), new_id);
    });

    test("aliasing same ID returns error code", 1, function() {
        var old_id = mixpanel.test.get_distinct_id(),
            ev = mixpanel.test.alias(old_id);

        same(ev, -1);
    });

    test("alias prevents identify from changing the ID", 3, function() {
        var old_id = mixpanel.test.get_distinct_id(),
            new_id = this.id;
        notOk(old_id === new_id);
        mixpanel.test.alias(new_id);
        mixpanel.test.identify(new_id);
        same(mixpanel.test.get_distinct_id(), old_id, "identify should not do anything");
        same(mixpanel.test.get_property(__alias), new_id, "identify should not delete the __alias key");
    });

    test("identify with completely new ID blows away alias", 3, function() {
        var old_id = mixpanel.test.get_distinct_id(),
            alias = this.id,
            new_id = rand_name();
        notOk((old_id === alias) || (alias === new_id) || (new_id === old_id));
        mixpanel.test.alias(alias);
        mixpanel.test.identify(new_id);
        same(mixpanel.test.get_distinct_id(), new_id, "identify should replace the distinct id");
        same(mixpanel.test.get_property(__alias), undefined, "__alias should get blown away");
    });

    test("alias not in props", 3, function() {
        var old_id = mixpanel.test.get_distinct_id(),
            new_id = this.id;
        notOk(old_id === new_id);
        mixpanel.test.alias(new_id);
        same(mixpanel.test.get_property(__alias), new_id, "identify should not delete the __alias key");
        notOk(__alias in mixpanel.test.cookie.properties())
    });

    test("alias not allowed when there is previous people distinct id", 2, function() {
        mixpanel.test.register({"$people_distinct_id": this.id});
        same(mixpanel.test.alias(this.id), -2);
        same(mixpanel.test.get_property(__alias), undefined, "__alias should not be set");
    });

module("mixpanel._", {
    setup: function() {
        this.p = mixpanel._;
    }
});

    test("isObject", 5, function() {
        ok(this.p.isObject({}), "isObject identifies an object");
        ok(this.p.isObject({'hi': 'hi'}), "isObject identifies an object");
        notOk(this.p.isObject([]), "isObject fails array");
        notOk(this.p.isObject([1, 2, 3]), "isObject fails array");
        notOk(this.p.isObject("a string"), "isObject fails string");
    });

    test("toArray", 4, function() {
        function is_array(obj) {
            var obj_str = Object.prototype.toString.call(obj);
            return  (obj_str === '[object Array]');
        }

        var elements = document.getElementsByTagName("*");

        ok(is_array(this.p.toArray([])), "toArray handles arrays");
        ok(is_array(this.p.toArray(elements)), "toArray handles html lists");
        ok(is_array(this.p.toArray(null)), "toArray handles null");
        ok(is_array(this.p.toArray(undefined)), "toArray handles undefined");
    });

mpmodule("mixpanel.push");

    test("anon function called", 1, function() {
        var a = 1;
        mixpanel.push(function() {
            a = 2;
        });
        same(a, 2, 'Pushed function is executed immediately');
    });

    var value = Math.random();
    test("instance function called", 1, function() {
        mixpanel.push(['register', { value: value }]);
        same(mixpanel.cookie.props.value, value, "executed immediately");
    });

xhrmodule("mixpanel._check_and_handle_notifications");

    if (USE_XHR) {
        test("_check_and_handle_notifications makes a request to decide/ server", 2, function() {
            var initial_requests = this.requests.length;
            mixpanel.test._check_and_handle_notifications(this.id);
            same(this.requests.length - initial_requests, 1, "_check_and_handle_notifications should have fired off a request");
            ok(this.requests[0].url.match(/decide\//));
        });

        test("notifications are never checked again after identify()", 2, function() {
            mixpanel.test.identify(this.id);
            ok(this.requests.length >= 1, "identify should have fired off a request");

            var num_requests = this.requests.length;
            mixpanel.test._check_and_handle_notifications(this.id);
            mixpanel.test._check_and_handle_notifications(this.id);
            mixpanel.test._check_and_handle_notifications(this.id);
            mixpanel.test._check_and_handle_notifications(this.id);
            mixpanel.test._check_and_handle_notifications(this.id);
            same(this.requests.length, num_requests, "_check_and_handle_notifications after identify should not make requests");
        });

        test("_check_and_handle_notifications honors disable_notifications config", 1, function() {
            var initial_requests = this.requests.length;
            mixpanel.test.set_config({disable_notifications: true});
            mixpanel.test._check_and_handle_notifications(this.id);
            mixpanel.test.set_config({disable_notifications: false});
            same(this.requests.length - initial_requests, 0, "_check_and_handle_notifications should not have fired off a request");
        });
    } else {
        test("_check_and_handle_notifications makes a request", 1, function() {
            var num_scripts = $('script').length;
            mixpanel.test._check_and_handle_notifications(this.id);
            stop();
            setTimeout(function() {
                same($('script').length, num_scripts + 1, "_check_and_handle_notifications should have fired off a request");
                start();
            }, 500);
        });

        test("notifications are never checked again after identify()", 2, function() {
            var num_scripts = $('script').length;
            mixpanel.test.identify(this.id);
            stop();
            setTimeout(function() {
                ok($('script').length >= num_scripts + 1, "identify should have fired off a request");

                num_scripts = $('script').length;
                mixpanel.test._check_and_handle_notifications(this.id);
                mixpanel.test._check_and_handle_notifications(this.id);
                mixpanel.test._check_and_handle_notifications(this.id);
                mixpanel.test._check_and_handle_notifications(this.id);
                mixpanel.test._check_and_handle_notifications(this.id);
                setTimeout(function() {
                    same($('script').length, num_scripts, "_check_and_handle_notifications after identify should not make requests");
                    start();
                }, 500);
            }, 500);
        });

        test("_check_and_handle_notifications honors disable_notifications config", 1, function() {
            var num_scripts = $('script').length;
            mixpanel.test.set_config({disable_notifications: true});
            mixpanel.test._check_and_handle_notifications(this.id);
            mixpanel.test.set_config({disable_notifications: false});
            stop();
            setTimeout(function() {
                same($('script').length, num_scripts, "_check_and_handle_notifications should not have fired off a request");
                start();
            }, 500);
        });
    }

mpmodule("mixpanel.people.set");

    test("set (basic functionality)", 6, function() {
        var _to_set = { key1: 'val1' },
            _to_set2 = { key2: 'val3', '$age': 34 },
            s;

        s = mixpanel.people.set('key1', _to_set['key1']);
        ok(contains_obj(s["$set"], _to_set), ".set() a single value works");

        s = mixpanel.people.set(_to_set);
        ok(contains_obj(s["$set"], _to_set), ".set() an object (with only 1 key) works");

        s = mixpanel.people.set(_to_set2);
        ok(contains_obj(s["$set"], _to_set2), ".set() an object (with multiple keys) works");

        mixpanel.test.identify(this.id);
        s = mixpanel.test.people.set(_to_set2);
        same(s['$distinct_id'], this.id);
        same(s['$token'], this.token);
        ok(contains_obj(s['$set'], _to_set2));
    });

    test("set queues data", 2, function() {
        stop();
        s = mixpanel.test.people.set({ a: 2 }, function(resp) {
            same(resp, -1, "responded with 'queued'");
            start();
        });
        ok(contains_obj(mixpanel.test.cookie.props['__mps'], { a: 2 }), "queued set saved");
    });

    test("set hits server immediately if identified", 4, function() {
        mixpanel.test.identify(this.id);

        stop();
        s = mixpanel.test.people.set({ a: 3 }, function(resp) {
            same(resp, 1, "responded with 'success'");
            start();
        });

        same(s['$distinct_id'], this.id, '$distinct_id pulled out correctly');
        same(s['$token'], this.token, '$token pulled out correctly');
        ok(contains_obj(s['$set'], { 'a': 3 }));
    });

    test("set (info props included)", 4, function() {
        var info_props = "$os $browser $initial_referrer $initial_referring_domain".split(' ');

        var data = mixpanel.people.set('key1', 'test');

        _.each(info_props, function(prop) {
            ok(prop in data['$set'], "set properties should include " + prop);
        });
    });

mpmodule("mixpanel.people.set_once");

    test("set_once (basic functionality)", 6, function() {
        var _to_set = { key1: 'val1' },
            _to_set2 = { key2: 'val3', '$age': 34 },
            s;

        s = mixpanel.people.set_once('key1', _to_set['key1']);
        ok(contains_obj(s["$set_once"], _to_set), ".set_once() a single value works");

        s = mixpanel.people.set_once(_to_set);
        ok(contains_obj(s["$set_once"], _to_set), ".set_once() an object (with only 1 key) works");

        s = mixpanel.people.set_once(_to_set2);
        ok(contains_obj(s["$set_once"], _to_set2), ".set_once() an object (with multiple keys) works");

        mixpanel.test.identify(this.id);
        s = mixpanel.test.people.set_once(_to_set2);
        same(s['$distinct_id'], this.id);
        same(s['$token'], this.token);
        ok(contains_obj(s['$set_once'], _to_set2));
    });

    test("set_once queues data", 2, function() {
        stop();
        s = mixpanel.test.people.set_once({ a: 2 }, function(resp) {
            same(resp, -1, "responded with 'queued'");
            start();
        });
        ok(contains_obj(mixpanel.test.cookie.props['__mpso'], { a: 2 }), "queued set_once saved");
    });

    test("set_once hits server immediately if identified", 4, function() {
        mixpanel.test.identify(this.id);

        stop();
        s = mixpanel.test.people.set_once({ a: 3 }, function(resp) {
            same(resp, 1, "responded with 'success'");
            start();
        });

        same(s['$distinct_id'], this.id, '$distinct_id pulled out correctly');
        same(s['$token'], this.token, '$token pulled out correctly');
        ok(contains_obj(s['$set_once'], { 'a': 3 }));
    });

    test("set_once (info props not included)", 4, function() {
        var info_props = "$os $browser $initial_referrer $initial_referring_domain".split(' ');

        var data = mixpanel.people.set_once('key1', 'test');

        _.each(info_props, function(prop) {
            notOk(prop in data['$set_once'], "set_once properties should not include " + prop);
        });
    });

    test("queued set_once calls don't override previously queued calls", 3, function() {
        s = mixpanel.test.people.set_once({ a: 2 }, function(resp) {
            same(resp, -1, "responded with 'queued'");
        });

        s = mixpanel.test.people.set_once({ a: 3, b: 4 }, function(resp) {
            same(resp, -1, "responded with 'queued'");
        });
        ok(contains_obj(mixpanel.test.cookie.props['__mpso'], { a: 2, b: 4 }), "queued set_once call works correctly");
    });

mpmodule("mixpanel.people.increment");

    test("increment (basic functionality)", 4, function() {
        var _to_inc = { "$age": 3 },
            _to_inc2 = { "$age": 87, "pageviews": 3 },
            i;

        i = mixpanel.people.increment("$age");
        same(i["$add"], { "$age": 1 }, ".increment() with no number increments by 1");

        i = mixpanel.people.increment(_to_inc);
        same(i["$add"], _to_inc, ".increment() with an object (only 1 key) works");

        i = mixpanel.people.increment(_to_inc2);
        same(i["$add"], _to_inc2, ".increment() with an object (multiple keys) works");

        mixpanel.test.identify(this.id);
        i = mixpanel.test.people.increment(_to_inc2);
        same(i, { "$distinct_id": this.id, "$token": this.token, "$add": _to_inc2 }, "Basic inc works for additional libs");
    });

    test("increment queues data", 2, function() {
        stop();
        s = mixpanel.test.people.increment({ a: 2 }, function(resp) {
            same(resp, -1, "responded with 'queued'");
            start();
        });
        same(mixpanel.test.cookie.props['__mpa'], { a: 2 }, "queued increment saved");
    });

    test("increment hits server immediately if identified", 2, function() {
        mixpanel.test.identify(this.id);

        stop();
        s = mixpanel.test.people.increment({ a: 3 }, function(resp) {
            same(resp, 1, "responded with 'success'");
            start();
        });
        same(s, { "$distinct_id": this.id, "$token": this.token, "$add": { "a": 3 }}, "$token and $distinct_id pulled out correctly");
    });

    test("increment ignores string values", 1, function() {
        mixpanel.test.identify(this.id);
        i = mixpanel.test.people.increment({ "a" : 1, "name": "joe" });
        same(i, { "$distinct_id": this.id, "$token": this.token, "$add": { "a": 1 }}, "string value ignored");
    });

mpmodule("mixpanel.people.append");

    test("append (basic functionality)", 5, function() {
        var _append1 = { 'key': 'val' },
            _append2 = { 'key': ['val'] },
            _append3 = { 'key': 'val', 'key2': 'val2' },
            i;

        i = mixpanel.people.append('key', 'val');
        same(i["$append"], { 'key': 'val' }, ".append() with two params works");

        i = mixpanel.people.append(_append1);
        same(i["$append"], _append1, ".append() with an object (only 1 key) works");

        i = mixpanel.people.append(_append2);
        same(i["$append"], _append2, ".append() with an object (array) works");

        i = mixpanel.people.append(_append3);
        same(i["$append"], _append3, ".append() with an object (multiple keys) works");

        mixpanel.test.identify(this.id);
        i = mixpanel.test.people.append(_append1);
        same(i, { "$distinct_id": this.id, "$token": this.token, "$append": _append1 }, "Basic append works for additional libs");
    });

    test("append queues data", 2, function() {
        stop();
        s = mixpanel.test.people.append({ a: 2 }, function(resp) {
            same(resp, -1, "responded with 'queued'");
            start();
        });
        same(mixpanel.test.cookie.props['__mpap'], [ { a: 2 } ], "queued append saved");
    });

    test("append hits server immediately if identified", 2, function() {
        mixpanel.test.identify(this.id);

        stop();
        s = mixpanel.test.people.append({ a: 3 }, function(resp) {
            same(resp, 1, "responded with 'success'");
            start();
        });
        same(s, { "$distinct_id": this.id, "$token": this.token, "$append": { "a": 3 }}, "$token and $distinct_id pulled out correctly");
    });

mpmodule("mixpanel.people.union");

    test("union (basic functionality)", 7, function() {
        var _union1 = {'key': ['val1']},
            _union2 = {'key1': ['val1', 'val2'], 'key2': ['val2']},
            _union3 = {'key': 'val1'},
            _union4 = {'key1': ['val1', 'val2'], 'key2': 'val2'},
            i;

        i = mixpanel.people.union('key', ['val']);
        same(i["$union"], {'key': ['val']}, ".union() with two params works");

        i = mixpanel.people.union('key', 'val');
        same(i["$union"], {'key': ['val']}, ".union() with non-array val works");

        i = mixpanel.people.union(_union1);
        same(i["$union"], _union1, ".union() with an object (with only 1 key) works");

        i = mixpanel.people.union(_union2);
        same(i["$union"], _union2, ".union() with an object (with multiple keys) works");

        i = mixpanel.people.union(_union3);
        same(i["$union"], {'key': ['val1']}, ".union() with an object (with 1 key and non-array val) works");

        i = mixpanel.people.union(_union4);
        same(i["$union"], {'key1': ['val1', 'val2'], 'key2': ['val2']}, ".union() with an object (with multiple keys and non-array val) works");

        mixpanel.test.identify(this.id);
        i = mixpanel.test.people.union(_union2);
        same(i, { "$distinct_id": this.id, "$token": this.token, "$union": _union2 }, "Basic union message works")
    });

    test("union calls provided callback", 2, function() {
        var _union1 = {'key1': ['val1.1'], 'key2': ['val1.2']},
            _union2 = {'key1': ['val2.1'], 'key3': ['val2.3']},
            i;

        mixpanel.test.people.union({'key': 'val'}, function(resp) {
            same(resp, -1, "calls callback in 2-arg form");
        });
        mixpanel.test.people.union('key', 'val', function(resp) {
            same(resp, -1, "calls callback in 3-arg form");
        });
    });

    test("union queues and merges data", 4, function() {
        var _union1 = {'key1': ['val1.1'], 'key2': ['val1.2']},
            _union2 = {'key1': ['val2.1'], 'key3': ['val2.3']},
            i;

        mixpanel.test.people.union(_union1, function(resp) {
            same(resp, -1, "responded with 'queued'");
        });
        same(mixpanel.test.cookie.props['__mpu'], { 'key1': ['val1.1'], 'key2': ['val1.2']}, "queued union saved");
        mixpanel.test.people.union(_union2, function(resp) {
            same(resp, -1, "responded with 'queued'");
        });
        same(mixpanel.test.cookie.props['__mpu'], { 'key1': ['val1.1', 'val2.1'], 'key2': ['val1.2'], 'key3':['val2.3'] }, "queued union saved");
    });

    test("set after union clobbers union queue", 4, function() {
        var _union = {'key1': ['union_val'], 'key2': ['val2']},
            _set = {'key1': 'set_val'},
            i;

        mixpanel.test.people.union(_union, function(resp) {
            same(resp, -1, "responded with 'queued'");
        });

        mixpanel.test.people.set(_set, function(resp) {
            same(resp, -1, "responded with 'queued'");
        });

        same(mixpanel.test.cookie.props['__mpu'], {'key2': ['val2']}, "set after union empties union queue");
        ok(contains_obj(mixpanel.test.cookie.props['__mps'], {'key1': 'set_val'}), "set after union enqueues set");
    });

    test("union sends immediately if identified", 2, function() {
        mixpanel.test.identify(this.id);

        stop();
        s = mixpanel.test.people.union({ a: [3] }, function(resp) {
            same(resp, 1, "responded with 'success'");
            start();
        });
        same(s, { "$distinct_id": this.id, "$token": this.token, "$union": { "a": [3] }}, "$token and $distinct_id pulled out correctly");

    });

mpmodule("mixpanel.people.track_charge");

    test("track_charge (basic functionality)", 2, function() {
        var amt = 50, amt_2 = 20,
            charge = { '$amount': amt }
            charge_2 = { '$amount': amt_2 }

        var i = mixpanel.people.track_charge(amt);
        ok(contains_obj(i['$append']['$transactions'], charge), '.track_charge() correctly appends to the $transactions object');

        mixpanel.test.identify(this.id);
        i = mixpanel.test.people.track_charge(amt_2);
        ok(contains_obj(i['$append']['$transactions'], charge_2), '.track_charge() works for additional libs');
    });

    test("track_charge accepts properties", 1, function() {
        var amt = 50, time = new Date('feb 1 2012'),
        charge = { '$amount': amt, '$time': date_to_ISO(time) };

        var i = mixpanel.people.track_charge(amt, { '$time': time });
        ok(contains_obj(i['$append']['$transactions'], charge), '.track_charge() correctly appends to the $transactions object');
    });

    test("track_charge handles numeric strings", 1, function() {
        var amt = " 40.56 ", charge = { '$amount': 40.56 }
        var i = mixpanel.people.track_charge(amt);

        ok(contains_obj(i['$append']['$transactions'], charge), '.track_charge() correctly converts numeric strings');
    });

    // callsError may fail if there is no console, so we can't expect 2 tests
    test("track_charge handles invalid values", function() {
        if (window.console) {
            callsError(function(restore_console) {
                mixpanel.people.track_charge();
                restore_console();
            }, ".track_charge() should call an error if called with no arguments");

            callsError(function(restore_console) {
                mixpanel.people.track_charge("asdf");
                restore_console();
            }, ".track_charge() should call an error if called with a non-numeric string argument");
        }
    });

mpmodule("mixpanel.people.clear_charges");

    test("clear_charges", 1, function() {
        var d = mixpanel.test.people.clear_charges();

        same(d['$set']['$transactions'], [], 'clears transactions array');
    });

mpmodule("mixpanel.people flushing");

    test("identify with no params", 2, function() {
        var errors = 0;
        distinct_id = mixpanel.test.get_distinct_id();
        if (window.console) {
            var old_error = console.error;
            console.error = function(msg) {
                errors++;
                old_error.apply(this, arguments);
            }
        }
        mixpanel.test.identify();
        if (window.console) {
            console.error = old_error;
        }
        same(mixpanel.test.get_distinct_id(), distinct_id);
        equal(errors, 0, "No errors were expected but some were encountered when calling identify with no arguments")
    });

    test("identify flushes set queue", 4, function() {
        mixpanel.test.people.set("a", "b");
        mixpanel.test.people.set("b", "c");

        stop();
        mixpanel.test.identify(this.id, function(resp, data) {
            ok(resp == 1, "Successful write");
            ok(contains_obj(data["$set"], { "a": "b", "b": "c" }));
            same(mixpanel.test.cookie.props['__mps'], {}, "Queue is cleared after flushing");
            // reload cookie to make sure it's persisted correctly
            mixpanel.test.cookie.load();
            same(mixpanel.test.cookie.props['__mps'], {}, "Empty queue is persisted");
            start();
        });
    });

    test("identify no params flushes set queue", 4, function() {
        mixpanel.test.people.set("a", "b");
        mixpanel.test.people.set("b", "c");

        stop();
        mixpanel.test.identify(undefined, function(resp, data) {
            ok(resp == 1, "Successful write");
            ok(contains_obj(data["$set"], { "a": "b", "b": "c" }));
            same(mixpanel.test.cookie.props['__mps'], {}, "Queue is cleared after flushing");
            // reload cookie to make sure it's persisted correctly
            mixpanel.test.cookie.load();
            same(mixpanel.test.cookie.props['__mps'], {}, "Empty queue is persisted");
            start();
        });
    });

    test("identify flushes set_once queue", 4, function() {
        mixpanel.test.people.set_once("a", "b");
        mixpanel.test.people.set_once("b", "c");

        stop();
        mixpanel.test.identify(this.id, function() {}, function() {}, function() {}, function(resp, data) {
            ok(resp == 1, "Successful write");
            ok(contains_obj(data["$set_once"], { "a": "b", "b": "c" }));
            same(mixpanel.test.cookie.props['__mpso'], {}, "Queue is cleared after flushing");
            // reload cookie to make sure it's persisted correctly
            mixpanel.test.cookie.load();
            same(mixpanel.test.cookie.props['__mpso'], {}, "Empty queue is persisted");
            start();
        });
    });

    test("identify flushes add queue", 4, function() {
        var _this = this;
        mixpanel.test.people.increment("a");
        mixpanel.test.people.increment("b", 2);

        stop();
        mixpanel.test.identify(this.id, function() {}, function(resp, data) {
            ok(resp == 1, "Successful write");
            same(data, { "$token": _this.token, "$distinct_id": _this.id, "$add": { "a": 1, "b": 2 } });
            same(mixpanel.test.cookie.props['__mpa'], {}, "Queue is cleared after flushing");
            // reload cookie to make sure it's persisted correctly
            mixpanel.test.cookie.load();
            same(mixpanel.test.cookie.props['__mpa'], {}, "Empty queue is persisted");
            start();
        });
    });

    test("identify flushes append queue", 12, function() {
        var _this = this, run = 0, queue_name = '__mpap';
        mixpanel.test.people.append("a", 2);
        mixpanel.test.people.append({ 'b': 'asdf' });
        mixpanel.test.people.append("c", [1,2,3]);

        same(mixpanel.test.cookie.props[queue_name].length, 3, 'Queue has 3 elements before flushing');

        stop(); stop(); stop();
        mixpanel.test.identify(this.id, function() {}, function() {}, function(resp, data) {
            ok(resp == 1, "Successful write");
            ok(contains_obj(data, {
                "$token": _this.token,
                "$distinct_id": _this.id
            }));

            var $append = data['$append'];
            if (_.has($append, 'a')) { same($append, { 'a': 2 }); }
            else if (_.has($append, 'b')) { same($append, { 'b': 'asdf' }); }
            else if (_.has($append, 'c')) { same($append, { 'c': [1,2,3] }); }

            run++;
            if (run == 3) {
                same(mixpanel.test.cookie.props[queue_name], [], "Queue is cleared after flushing");
                // reload cookie to make sure it's persisted correctly
                mixpanel.test.cookie.load();
                same(mixpanel.test.cookie.props[queue_name], [], "Empty queue is persisted");
            };
            start();
        });
    });

    test("identify flushes union queue", 4, function() {
        var _union1 = {'key1': ['val1.1'], 'key2': 'val1.2'},
            i;

        mixpanel.test.people.union(_union1);
        mixpanel.test.people.union("key2", ["val2.2"]);

        stop();
        var noop = function() {};
        mixpanel.test.identify(this.id, noop, noop, noop, noop, function(resp, data) {
            same(resp, 1, "Successful write");
            same(data["$union"], {'key1': ['val1.1'], 'key2': ['val1.2', 'val2.2']});
            same(mixpanel.test.cookie.props['__mpu'], {}, 'Queue is cleared after flushing');

            mixpanel.test.cookie.load();
            same(mixpanel.test.cookie.props['__mpu'], {}, 'Empty queue is persisted');
            start();
        });
    });

    test("identify does not make a request if nothing is queued", 1, function() {
        var num_scripts = $('script').length;
        mixpanel.test.identify(this.id);

        stop();
        setTimeout(function() {
            // notification check results in extra script tag when !USE_XHR
            var extra_scripts = USE_XHR ? 0 : 1;
            same($('script').length, num_scripts + extra_scripts, "No scripts added to page.");
            start();
        }, 500);
    });

    // this is in response to a bug where a user fires off two
    // identify()'s back to back, and the second one flushes the same data
    // to the server.  By making sure the queue's are cleared right away
    // (before waiting for the server response), we can avoid this
    // issue.
    test("identify clears out queues before server response", 8, function() {
        mixpanel.test.people.set("key", "val");
        mixpanel.test.people.increment("num");
        mixpanel.test.people.append("ary", 'val');
        mixpanel.test.people.union("stuff", 'val');

        mixpanel.test.identify(this.id);

        same(mixpanel.test.cookie.props['__mpap'], []);
        same(mixpanel.test.cookie.props['__mpu'], {});
        same(mixpanel.test.cookie.props['__mpa'], {});
        same(mixpanel.test.cookie.props['__mps'], {});
        // reload cookie to make sure it's persisted correctly
        mixpanel.test.cookie.load();
        same(mixpanel.test.cookie.props['__mpap'], []);
        same(mixpanel.test.cookie.props['__mpu'], {});
        same(mixpanel.test.cookie.props['__mpa'], {});
        same(mixpanel.test.cookie.props['__mps'], {});
    });

mpmodule("mixpanel.people.delete_user");

    test("delete_user", 2, function() {
        d = mixpanel.test.people.delete_user();

        same(d, undefined, "Cannot delete user without valid distinct id");

        mixpanel.test.identify(this.id);
        d = mixpanel.test.people.delete_user();
        same(d, { "$token": this.token, "$distinct_id": this.id, "$delete": this.id }, "Cannot delete user without valid distinct id");
    });

mpmodule("in-app notification display");

    asyncTest("notification with normal data adds itself to DOM", 1, function() {
        mixpanel._show_notification({
            body: "notification body test",
            title: "hallo"
        });
        setTimeout(function() {
            same($('#mixpanel-notification-takeover').length, 1);
            $('#mixpanel-notification-wrapper').remove();
            start();
        }, 2000);
    });

    asyncTest("mini notification with normal data adds itself to DOM", 1, function() {
        mixpanel._show_notification({
            body: "notification body test",
            type: "mini"
        });
        setTimeout(function() {
            same($('#mixpanel-notification-mini').length, 1);
            $('#mixpanel-notification-wrapper').remove();
            start();
        }, 2000);
    });

    asyncTest("notification does not show when images don't load", 1, function() {
        mixpanel._show_notification({
            body: "bad image body test",
            image_url: "http://notgonna.loadever.com/blablabla",
            title: "bad image title"
        });
        setTimeout(function() {
            same($('#mixpanel-notification-takeover').length, 0);
            start();
        }, 2000);
    });

    test("calling _show_notification with bad data does not halt execution", 1, function() {
        mixpanel.test._show_notification();
        mixpanel.test._show_notification(15);
        mixpanel.test._show_notification('hi');
        mixpanel.test._show_notification({body: null});
        mixpanel.test._show_notification({bla: 'bla'});
        ok(true);
    });

    asyncTest("notification prevents script injection", 2, function() {
        mixpanel._show_notification({
            body: 'injection test</div><img src="nope" onerror="window.injectedvar=42;"/>',
            title: "bad image title"
        });
        setTimeout(function() {
            same($('#mixpanel-notification-takeover').length, 1);
            $('#mixpanel-notification-wrapper').remove();
            ok(_.isUndefined(window.injectedvar), 'window.injectedvar should not exist');
            start();
        }, 2000);
    });

mpmodule("verbose output");

    asyncTest("track endpoint returns json when verbose=1", 1, function() {
        mixpanel.test.set_config({ verbose: true });

        mixpanel.test.track('test', {}, function(response) {
            same(response, { status: 1, error: null }, "server returned success1");
            start();
        });
    });

    asyncTest("engage endpoint returns json when verbose=1", 1, function() {
        mixpanel.test.set_config({ verbose: true });

        mixpanel.test.identify('bilbo');
        mixpanel.test.people.set('test', 123, function(response) {
            same(response, { status: 1, error: null }, "server returned success");
            start();
        });
    });

    asyncTest("engage queue returns json when verbose=1", 1, function() {
        mixpanel.test.set_config({ verbose: true });

        mixpanel.test.people.set('test', 123, function(response) {
            same(response, { status: -1, error: null }, "library returned queued");
            start();
        });
    });

mpmodule("debug helpers");

    test("toString", 2, function() {
        same(mixpanel.test.toString(), "mixpanel.test");
        same(mixpanel.test.people.toString(), "mixpanel.test.people");
    });

mpmodule('user agent parser');

    test('device', 8, function() {
        // facebook browsing
        var a = "Mozilla/5.0 (iPad; CPU OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Mobile/11A501 [FBAN/FBIOS;FBAV/6.9.1;FBBV/1102303;FBDV/iPad2,7;FBMD/iPad;FBSN/iPhone OS;FBSV/7.0.2;FBSS/1; FBCR/Verizon;FBID/tablet;FBLC/en_US;FBOP/1]";
        same(mixpanel._.info.device(a), 'iPad');

        var a = "Mozilla/5.0 (iPhone; CPU iPhone OS 7_0 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Mobile/11A465 [FBAN/FBIOS;FBAV/6.9.1;FBBV/1102303;FBDV/iPhone5,1;FBMD/iPhone;FBSN/iPhone OS;FBSV/7.0;FBSS/2; FBCR/AT&T;FBID/phone;FBLC/fr_FR;FBOP/5]"
        same(mixpanel._.info.device(a), 'iPhone');

        var a = "Mozilla/5.0 (iPad; U; CPU iPhone OS 5_1_1 like Mac OS X; en_US) AppleWebKit (KHTML, like Gecko) Mobile [FBAN/FBForIPhone;FBAV/4.1.1;FBBV/4110.0;FBDV/iPad2,1;FBMD/iPad;FBSN/iPhone OS;FBSV/5.1.1;FBSS/1; FBCR/;FBID/tablet;FBLC/en_US;FBSF/1.0]";
        same(mixpanel._.info.device(a), 'iPad');

        // iPhone
        var a = "Mozilla/5.0 (iPhone; CPU iPhone OS 7_0 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A465 Safari/9537.53";
        same(mixpanel._.info.device(a), 'iPhone');

        // iPod Touch
        var a = "Mozila/5.0 (iPod; U; CPU like Mac OS X; en) AppleWebKit/420.1 (KHTML, like Geckto) Version/3.0 Mobile/3A101a Safari/419.3";
        same(mixpanel._.info.device(a), 'iPod Touch');

        // Android
        var a = "Mozilla/5.0 (Linux; U; Android 2.1; en-us; Nexus One Build/ERD62) AppleWebKit/530.17 (KHTML, like Gecko) Version/4.0 Mobile Safari/530.17";
        same(mixpanel._.info.device(a), 'Android');

        // Blackberry
        var a = "Mozilla/5.0 (BlackBerry; U; BlackBerry 9800; en-US) AppleWebKit/534.8+ (KHTML, like Gecko) Version/6.0.0.448 Mobile Safari/534.8+";
        same(mixpanel._.info.device(a), 'BlackBerry');

        // Windows Phone
        var a = "Mozilla/4.0 (compatible; MSIE 7.0; Windows Phone OS 7.0; Trident/3.1; IEMobile/7.0; Nokia;N70)"
        same(mixpanel._.info.device(a), 'Windows Phone');
    });

    test('browser', 32, function() {
        // facebook mobile
        var a = "Mozilla/5.0 (iPad; CPU OS 7_0_2 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Mobile/11A501 [FBAN/FBIOS;FBAV/6.9.1;FBBV/1102303;FBDV/iPad2,7;FBMD/iPad;FBSN/iPhone OS;FBSV/7.0.2;FBSS/1; FBCR/Verizon;FBID/tablet;FBLC/en_US;FBOP/1]";
        same(mixpanel._.info.browser(a), 'Facebook Mobile');
        notOk(mixpanel._.isBlockedUA(a));

        // chrome
        var a = "Mozilla/5.0 (Windows NT 6.2; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1667.0 Safari/537.36";
        same(mixpanel._.info.browser(a), 'Chrome');
        notOk(mixpanel._.isBlockedUA(a));

        var a = "Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/29.0.1547.2 Safari/537.36";
        same(mixpanel._.info.browser(a), 'Chrome');
        notOk(mixpanel._.isBlockedUA(a));

        var a = "Mozilla/5.0 (X11; U; CrOS i686 0.9.128; en-US) AppleWebKit/534.10 (KHTML, like Gecko) Chrome/8.0.552.339";
        same(mixpanel._.info.browser(a), 'Chrome');
        notOk(mixpanel._.isBlockedUA(a));

        var a = "Mozilla/5.0 (iPhone; U; CPU iPhone OS 5_1_1 like Mac OS X; en-gb) AppleWebKit/534.46.0 (KHTML, like Gecko) CriOS/19.0.1084.60 Mobile/9B206 Safari/7534.48.3";
        same(mixpanel._.info.browser(a), 'Chrome iOS');
        notOk(mixpanel._.isBlockedUA(a));

        // ie
        var a = "Mozilla/5.0 (Windows NT 6.3; Trident/7.0; rv:11.0) like Gecko";
        same(mixpanel._.info.browser(a), 'Internet Explorer');
        notOk(mixpanel._.isBlockedUA(a));

        var a = "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)";
        same(mixpanel._.info.browser(a), 'Internet Explorer');
        notOk(mixpanel._.isBlockedUA(a));

        var a = "Mozilla/5.0 (compatible; MSIE 8.0; Windows NT 5.2; Trident/4.0; Media Center PC 4.0; SLCC1; .NET CLR 3.0.04320)";
        same(mixpanel._.info.browser(a), 'Internet Explorer');
        notOk(mixpanel._.isBlockedUA(a));

        // firefox
        var a = "Mozilla/5.0 (Windows NT 6.1; Win64; x64; rv:25.0) Gecko/20100101 Firefox/25.0";
        same(mixpanel._.info.browser(a), 'Firefox');
        notOk(mixpanel._.isBlockedUA(a));

        var a = "Mozilla/5.0 (Windows NT 6.2; rv:22.0) Gecko/20130405 Firefox/23.0";
        same(mixpanel._.info.browser(a), 'Firefox');
        notOk(mixpanel._.isBlockedUA(a));

        var a = "Mozilla/5.0 (Windows NT 6.2; Win64; x64; rv:16.0.1) Gecko/20121011 Firefox/21.0.1";
        same(mixpanel._.info.browser(a), 'Firefox');
        notOk(mixpanel._.isBlockedUA(a));

        // Konqueror
        var a = "Mozilla/5.0 (X11; Linux) KHTML/4.9.1 (like Gecko) Konqueror/4.9";
        same(mixpanel._.info.browser(a), 'Konqueror');
        notOk(mixpanel._.isBlockedUA(a));

        var a = "Mozilla/5.0 (compatible; Konqueror/4.2; Linux; X11; x86_64) KHTML/4.2.4 (like Gecko) Fedora/4.2.4-2.fc11";
        same(mixpanel._.info.browser(a), 'Konqueror');
        notOk(mixpanel._.isBlockedUA(a));

        // opera
        same(mixpanel._.info.browser(a, null, true), 'Opera');

        var a = "Opera/9.80 (J2ME/MIDP; Opera Mini/9.80 (J2ME/23.377; U; en) Presto/2.5.25 Version/10.54";
        same(mixpanel._.info.browser(a, null, true), 'Opera Mini');
        notOk(mixpanel._.isBlockedUA(a));

        // safari
        same(mixpanel._.info.browser(a, "Apple"), "Safari");

        var a = "Mozilla/5.0 (iPad; CPU OS 6_0 like Mac OS X) AppleWebKit/536.26 (KHTML, like Gecko) Version/6.0 Mobile/10A5355d Safari/8536.25";
        same(mixpanel._.info.browser(a, "Apple"), 'Mobile Safari');
        notOk(mixpanel._.isBlockedUA(a));
    });

    test('blocked user agents', 5, function() {
        var bot_user_agents = [
            "Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)",
            "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
            "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            "Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)",
            "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)"
        ];
        _.each(bot_user_agents, function(ua) {
            ok(mixpanel._.isBlockedUA(ua));
        });
    });

if( /Android|iPhone|iPad|iPod|BlackBerry|Windows Phone/i.test(navigator.userAgent) ) {
    mpmodule("mobile tests");
        test("device property included", 1, function() {
            stop();
            mixpanel.test.track("test_device", {}, function(r, data) {
                ok('$device' in data.properties, "properties should include $device");
                start();
            });
        });
}

if (USE_XHR) {
    xhrmodule("xhr tests");

        asyncTest('xhr error handling code works', 2, function() {
            mixpanel.test.track('test', {}, function(response) {
                same(response, 0, "xhr returned error");
                start();
            });

            same(this.requests.length, 1, "track should have fired off a request");

            var resp = 'HTTP/1.1 500 Internal Server Error';
            this.requests[0].respond(500, { 'Content-Length': resp.length, 'Content-Type': 'text' }, resp);
        });

        asyncTest('xhr error handling code supports verbose', 2, function() {
            mixpanel.test.set_config({ verbose: true });

            mixpanel.test.track('test', {}, function(response) {
                same(response, { status: 0, error: "Bad HTTP status: 500 Internal Server Error" }, "xhr returned verbose error");
                start();
            });

            same(this.requests.length, 1, "track should have fired off a request");

            var resp = 'HTTP/1.1 500 Internal Server Error';
            this.requests[0].respond(500, { 'Content-Length': resp.length }, resp);
        });
}

// Necessary because the alias tests can't clean up after themselves, as there is no callback.
setTimeout(function() {
    _.each(document.cookie.split(';'), function(c) {
        var name = c.split('=')[0].replace(/^\s+|\s+$/g, '');
        if (name.match(/mp_test_\d+_mixpanel$/)) {
            if (window.console) {
                console.log("removing cookie:", name);
            }
            cookie.remove(name);
            cookie.remove(name, true);
        }
    });
}, 5000);

}, 10);
};

})();
