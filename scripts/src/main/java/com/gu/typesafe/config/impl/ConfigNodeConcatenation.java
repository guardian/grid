package com.gu.typesafe.config.impl;

import java.util.Collection;

final class ConfigNodeConcatenation extends com.gu.typesafe.config.impl.ConfigNodeComplexValue {
    ConfigNodeConcatenation(Collection<AbstractConfigNode> children) {
        super(children);
    }

    @Override
    protected ConfigNodeConcatenation newNode(Collection<AbstractConfigNode> nodes) {
        return new ConfigNodeConcatenation(nodes);
    }
}
