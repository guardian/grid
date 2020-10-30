/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import com.gu.typesafe.config.ConfigIncludeContext;
import com.gu.typesafe.config.ConfigParseOptions;
import com.gu.typesafe.config.ConfigParseable;

class SimpleIncludeContext implements com.gu.typesafe.config.ConfigIncludeContext {

    private final com.gu.typesafe.config.impl.Parseable parseable;
    private final com.gu.typesafe.config.ConfigParseOptions options;

    SimpleIncludeContext(com.gu.typesafe.config.impl.Parseable parseable) {
        this.parseable = parseable;
        this.options = SimpleIncluder.clearForInclude(parseable.options());
    }

    private SimpleIncludeContext(com.gu.typesafe.config.impl.Parseable parseable, com.gu.typesafe.config.ConfigParseOptions options) {
        this.parseable = parseable;
        this.options = options;
    }

    SimpleIncludeContext withParseable(Parseable parseable) {
        if (parseable == this.parseable)
            return this;
        else
            return new SimpleIncludeContext(parseable);
    }

    @Override
    public ConfigParseable relativeTo(String filename) {
        if (ConfigImpl.traceLoadsEnabled())
            ConfigImpl.trace("Looking for '" + filename + "' relative to " + parseable);
        if (parseable != null)
            return parseable.relativeTo(filename);
        else
            return null;
    }

    @Override
    public com.gu.typesafe.config.ConfigParseOptions parseOptions() {
        return options;
    }

    @Override
    public ConfigIncludeContext setParseOptions(ConfigParseOptions options) {
        return new SimpleIncludeContext(parseable, options.setSyntax(null).setOriginDescription(null));
    }
}
