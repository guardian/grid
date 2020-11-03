package com.gu.typesafe.config.impl;

import java.util.Collection;

final class ConfigNodeArray extends com.gu.typesafe.config.impl.ConfigNodeComplexValue {
    ConfigNodeArray(Collection<com.gu.typesafe.config.impl.AbstractConfigNode> children) {
        super(children);
    }

    @Override
    protected ConfigNodeArray newNode(Collection<com.gu.typesafe.config.impl.AbstractConfigNode> nodes) {
        return new ConfigNodeArray(nodes);
    }
}
