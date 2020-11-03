/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.io.ObjectStreamException;
import java.io.Serializable;

import com.gu.typesafe.config.ConfigOrigin;
import com.gu.typesafe.config.ConfigRenderOptions;
import com.gu.typesafe.config.ConfigValueType;

/**
 * This exists because sometimes null is not the same as missing. Specifically,
 * if a value is set to null we can give a better error message (indicating
 * where it was set to null) in case someone asks for the value. Also, null
 * overrides values set "earlier" in the search path, while missing values do
 * not.
 *
 */
final class ConfigNull extends com.gu.typesafe.config.impl.AbstractConfigValue implements Serializable {

    private static final long serialVersionUID = 2L;

    ConfigNull(com.gu.typesafe.config.ConfigOrigin origin) {
        super(origin);
    }

    @Override
    public com.gu.typesafe.config.ConfigValueType valueType() {
        return ConfigValueType.NULL;
    }

    @Override
    public Object unwrapped() {
        return null;
    }

    @Override
    String transformToString() {
        return "null";
    }

    @Override
    protected void render(StringBuilder sb, int indent, boolean atRoot, ConfigRenderOptions options) {
        sb.append("null");
    }

    @Override
    protected ConfigNull newCopy(ConfigOrigin origin) {
        return new ConfigNull(origin);
    }

    // serialization all goes through SerializedConfigValue
    private Object writeReplace() throws ObjectStreamException {
        return new com.gu.typesafe.config.impl.SerializedConfigValue(this);
    }
}
