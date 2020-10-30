package com.gu.typesafe.config.impl;

import java.util.ArrayList;
import java.util.Collection;

final class ConfigNodeInclude extends com.gu.typesafe.config.impl.AbstractConfigNode {
    final private ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> children;
    final private ConfigIncludeKind kind;
    final private boolean isRequired;

    ConfigNodeInclude(Collection<com.gu.typesafe.config.impl.AbstractConfigNode> children, ConfigIncludeKind kind, boolean isRequired) {
        this.children = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>(children);
        this.kind = kind;
        this.isRequired = isRequired;
    }

    final public Collection<com.gu.typesafe.config.impl.AbstractConfigNode> children() {
        return children;
    }

    @Override
    protected Collection<com.gu.typesafe.config.impl.Token> tokens() {
        ArrayList<com.gu.typesafe.config.impl.Token> tokens = new ArrayList<com.gu.typesafe.config.impl.Token>();
        for (com.gu.typesafe.config.impl.AbstractConfigNode child : children) {
            tokens.addAll(child.tokens());
        }
        return tokens;
    }

    protected ConfigIncludeKind kind() {
        return kind;
    }

    protected boolean isRequired() {
        return isRequired;
    }

    protected String name() {
        for (com.gu.typesafe.config.impl.AbstractConfigNode n : children) {
            if (n instanceof com.gu.typesafe.config.impl.ConfigNodeSimpleValue) {
                return (String) com.gu.typesafe.config.impl.Tokens.getValue(((com.gu.typesafe.config.impl.ConfigNodeSimpleValue) n).token()).unwrapped();
            }
        }
        return null;
    }
}
