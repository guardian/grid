/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.io.File;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;

import com.gu.typesafe.config.*;
import com.gu.typesafe.config.ConfigIncluderClasspath;

class SimpleIncluder implements com.gu.typesafe.config.impl.FullIncluder {

    private com.gu.typesafe.config.ConfigIncluder fallback;

    SimpleIncluder(com.gu.typesafe.config.ConfigIncluder fallback) {
        this.fallback = fallback;
    }

    // ConfigIncludeContext does this for us on its options
    static com.gu.typesafe.config.ConfigParseOptions clearForInclude(com.gu.typesafe.config.ConfigParseOptions options) {
        // the class loader and includer are inherited, but not this other
        // stuff.
        return options.setSyntax(null).setOriginDescription(null).setAllowMissing(true);
    }

    // this is the heuristic includer
    @Override
    public com.gu.typesafe.config.ConfigObject include(final com.gu.typesafe.config.ConfigIncludeContext context, String name) {
        com.gu.typesafe.config.ConfigObject obj = includeWithoutFallback(context, name);

        // now use the fallback includer if any and merge
        // its result.
        if (fallback != null) {
            return obj.withFallback(fallback.include(context, name));
        } else {
            return obj;
        }
    }

    // the heuristic includer in static form
    static com.gu.typesafe.config.ConfigObject includeWithoutFallback(final com.gu.typesafe.config.ConfigIncludeContext context, String name) {
        // the heuristic is valid URL then URL, else relative to including file;
        // relativeTo in a file falls back to classpath inside relativeTo().

        URL url;
        try {
            url = new URL(name);
        } catch (MalformedURLException e) {
            url = null;
        }

        if (url != null) {
            return includeURLWithoutFallback(context, url);
        } else {
            NameSource source = new RelativeNameSource(context);
            return fromBasename(source, name, context.parseOptions());
        }
    }

    @Override
    public com.gu.typesafe.config.ConfigObject includeURL(com.gu.typesafe.config.ConfigIncludeContext context, URL url) {
        com.gu.typesafe.config.ConfigObject obj = includeURLWithoutFallback(context, url);

        // now use the fallback includer if any and merge
        // its result.
        if (fallback != null && fallback instanceof com.gu.typesafe.config.ConfigIncluderURL) {
            return obj.withFallback(((com.gu.typesafe.config.ConfigIncluderURL) fallback).includeURL(context, url));
        } else {
            return obj;
        }
    }

    static com.gu.typesafe.config.ConfigObject includeURLWithoutFallback(final com.gu.typesafe.config.ConfigIncludeContext context, URL url) {
        return com.gu.typesafe.config.ConfigFactory.parseURL(url, context.parseOptions()).root();
    }

    @Override
    public com.gu.typesafe.config.ConfigObject includeFile(com.gu.typesafe.config.ConfigIncludeContext context, File file) {
        com.gu.typesafe.config.ConfigObject obj = includeFileWithoutFallback(context, file);

        // now use the fallback includer if any and merge
        // its result.
        if (fallback != null && fallback instanceof com.gu.typesafe.config.ConfigIncluderFile) {
            return obj.withFallback(((com.gu.typesafe.config.ConfigIncluderFile) fallback).includeFile(context, file));
        } else {
            return obj;
        }
    }

    static com.gu.typesafe.config.ConfigObject includeFileWithoutFallback(final com.gu.typesafe.config.ConfigIncludeContext context, File file) {
        return com.gu.typesafe.config.ConfigFactory.parseFileAnySyntax(file, context.parseOptions()).root();
    }

    @Override
    public com.gu.typesafe.config.ConfigObject includeResources(com.gu.typesafe.config.ConfigIncludeContext context, String resource) {
        com.gu.typesafe.config.ConfigObject obj = includeResourceWithoutFallback(context, resource);

        // now use the fallback includer if any and merge
        // its result.
        if (fallback != null && fallback instanceof ConfigIncluderClasspath) {
            return obj.withFallback(((ConfigIncluderClasspath) fallback).includeResources(context,
                    resource));
        } else {
            return obj;
        }
    }

    static com.gu.typesafe.config.ConfigObject includeResourceWithoutFallback(final com.gu.typesafe.config.ConfigIncludeContext context,
                                                                              String resource) {
        return ConfigFactory.parseResourcesAnySyntax(resource, context.parseOptions()).root();
    }

    @Override
    public com.gu.typesafe.config.ConfigIncluder withFallback(com.gu.typesafe.config.ConfigIncluder fallback) {
        if (this == fallback) {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("trying to create includer cycle");
        } else if (this.fallback == fallback) {
            return this;
        } else if (this.fallback != null) {
            return new SimpleIncluder(this.fallback.withFallback(fallback));
        } else {
            return new SimpleIncluder(fallback);
        }
    }

    interface NameSource {
        com.gu.typesafe.config.ConfigParseable nameToParseable(String name, com.gu.typesafe.config.ConfigParseOptions parseOptions);
    }

    static private class RelativeNameSource implements NameSource {
        final private com.gu.typesafe.config.ConfigIncludeContext context;

        RelativeNameSource(com.gu.typesafe.config.ConfigIncludeContext context) {
            this.context = context;
        }

        @Override
        public com.gu.typesafe.config.ConfigParseable nameToParseable(String name, com.gu.typesafe.config.ConfigParseOptions options) {
            com.gu.typesafe.config.ConfigParseable p = context.relativeTo(name);
            if (p == null) {
                // avoid returning null
                return Parseable
                        .newNotFound(name, "include was not found: '" + name + "'", options);
            } else {
                return p;
            }
        }
    };

    // this function is a little tricky because there are three places we're
    // trying to use it; for 'include "basename"' in a .conf file, for
    // loading app.{conf,json,properties} from classpath, and for
    // loading app.{conf,json,properties} from the filesystem.
    static com.gu.typesafe.config.ConfigObject fromBasename(NameSource source, String name, ConfigParseOptions options) {
        com.gu.typesafe.config.ConfigObject obj;
        if (name.endsWith(".conf") || name.endsWith(".json") || name.endsWith(".properties")) {
            com.gu.typesafe.config.ConfigParseable p = source.nameToParseable(name, options);

            obj = p.parse(p.options().setAllowMissing(options.getAllowMissing()));
        } else {
            com.gu.typesafe.config.ConfigParseable confHandle = source.nameToParseable(name + ".conf", options);
            com.gu.typesafe.config.ConfigParseable jsonHandle = source.nameToParseable(name + ".json", options);
            ConfigParseable propsHandle = source.nameToParseable(name + ".properties", options);
            boolean gotSomething = false;
            List<com.gu.typesafe.config.ConfigException.IO> fails = new ArrayList<com.gu.typesafe.config.ConfigException.IO>();

            com.gu.typesafe.config.ConfigSyntax syntax = options.getSyntax();

            obj = com.gu.typesafe.config.impl.SimpleConfigObject.empty(com.gu.typesafe.config.impl.SimpleConfigOrigin.newSimple(name));
            if (syntax == null || syntax == com.gu.typesafe.config.ConfigSyntax.CONF) {
                try {
                    obj = confHandle.parse(confHandle.options().setAllowMissing(false)
                            .setSyntax(com.gu.typesafe.config.ConfigSyntax.CONF));
                    gotSomething = true;
                } catch (com.gu.typesafe.config.ConfigException.IO e) {
                    fails.add(e);
                }
            }

            if (syntax == null || syntax == com.gu.typesafe.config.ConfigSyntax.JSON) {
                try {
                    com.gu.typesafe.config.ConfigObject parsed = jsonHandle.parse(jsonHandle.options()
                            .setAllowMissing(false).setSyntax(com.gu.typesafe.config.ConfigSyntax.JSON));
                    obj = obj.withFallback(parsed);
                    gotSomething = true;
                } catch (com.gu.typesafe.config.ConfigException.IO e) {
                    fails.add(e);
                }
            }

            if (syntax == null || syntax == com.gu.typesafe.config.ConfigSyntax.PROPERTIES) {
                try {
                    com.gu.typesafe.config.ConfigObject parsed = propsHandle.parse(propsHandle.options()
                            .setAllowMissing(false).setSyntax(ConfigSyntax.PROPERTIES));
                    obj = obj.withFallback(parsed);
                    gotSomething = true;
                } catch (com.gu.typesafe.config.ConfigException.IO e) {
                    fails.add(e);
                }
            }

            if (!options.getAllowMissing() && !gotSomething) {
                if (com.gu.typesafe.config.impl.ConfigImpl.traceLoadsEnabled()) {
                    // the individual exceptions should have been logged already
                    // with tracing enabled
                    com.gu.typesafe.config.impl.ConfigImpl.trace("Did not find '" + name
                            + "' with any extension (.conf, .json, .properties); "
                            + "exceptions should have been logged above.");
                }

                if (fails.isEmpty()) {
                    // this should not happen
                    throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                            "should not be reached: nothing found but no exceptions thrown");
                } else {
                    StringBuilder sb = new StringBuilder();
                    for (Throwable t : fails) {
                        sb.append(t.getMessage());
                        sb.append(", ");
                    }
                    sb.setLength(sb.length() - 2);
                    throw new ConfigException.IO(com.gu.typesafe.config.impl.SimpleConfigOrigin.newSimple(name), sb.toString(),
                            fails.get(0));
                }
            } else if (!gotSomething) {
                if (com.gu.typesafe.config.impl.ConfigImpl.traceLoadsEnabled()) {
                    ConfigImpl.trace("Did not find '" + name
                            + "' with any extension (.conf, .json, .properties); but '" + name
                                    + "' is allowed to be missing. Exceptions from load attempts should have been logged above.");
                }
            }
        }

        return obj;
    }

    // the Proxy is a proxy for an application-provided includer that uses our
    // default implementations when the application-provided includer doesn't
    // have an implementation.
    static private class Proxy implements com.gu.typesafe.config.impl.FullIncluder {
        final com.gu.typesafe.config.ConfigIncluder delegate;

        Proxy(com.gu.typesafe.config.ConfigIncluder delegate) {
            this.delegate = delegate;
        }

        @Override
        public com.gu.typesafe.config.ConfigIncluder withFallback(com.gu.typesafe.config.ConfigIncluder fallback) {
            // we never fall back
            return this;
        }

        @Override
        public com.gu.typesafe.config.ConfigObject include(com.gu.typesafe.config.ConfigIncludeContext context, String what) {
            return delegate.include(context, what);
        }

        @Override
        public com.gu.typesafe.config.ConfigObject includeResources(com.gu.typesafe.config.ConfigIncludeContext context, String what) {
            if (delegate instanceof ConfigIncluderClasspath)
                return ((ConfigIncluderClasspath) delegate).includeResources(context, what);
            else
                return includeResourceWithoutFallback(context, what);
        }

        @Override
        public com.gu.typesafe.config.ConfigObject includeURL(com.gu.typesafe.config.ConfigIncludeContext context, URL what) {
            if (delegate instanceof com.gu.typesafe.config.ConfigIncluderURL)
                return ((ConfigIncluderURL) delegate).includeURL(context, what);
            else
                return includeURLWithoutFallback(context, what);
        }

        @Override
        public ConfigObject includeFile(ConfigIncludeContext context, File what) {
            if (delegate instanceof com.gu.typesafe.config.ConfigIncluderFile)
                return ((ConfigIncluderFile) delegate).includeFile(context, what);
            else
                return includeFileWithoutFallback(context, what);
        }
    }

    static com.gu.typesafe.config.impl.FullIncluder makeFull(ConfigIncluder includer) {
        if (includer instanceof com.gu.typesafe.config.impl.FullIncluder)
            return (com.gu.typesafe.config.impl.FullIncluder) includer;
        else
            return new Proxy(includer);
    }
}
