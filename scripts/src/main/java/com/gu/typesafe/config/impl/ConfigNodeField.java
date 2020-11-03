/**
 *   Copyright (C) 2015 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import com.gu.typesafe.config.ConfigException;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

final class ConfigNodeField extends com.gu.typesafe.config.impl.AbstractConfigNode {
    final private ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> children;

    public ConfigNodeField(Collection<com.gu.typesafe.config.impl.AbstractConfigNode> children) {
        this.children = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>(children);
    }

    @Override
    protected Collection<com.gu.typesafe.config.impl.Token> tokens() {
        ArrayList<com.gu.typesafe.config.impl.Token> tokens = new ArrayList<com.gu.typesafe.config.impl.Token>();
        for (com.gu.typesafe.config.impl.AbstractConfigNode child : children) {
            tokens.addAll(child.tokens());
        }
        return tokens;
    }

    public ConfigNodeField replaceValue(com.gu.typesafe.config.impl.AbstractConfigNodeValue newValue) {
        ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> childrenCopy = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>(children);
        for (int i = 0; i < childrenCopy.size(); i++) {
            if (childrenCopy.get(i) instanceof com.gu.typesafe.config.impl.AbstractConfigNodeValue) {
                childrenCopy.set(i, newValue);
                return new ConfigNodeField(childrenCopy);
            }
        }
        throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Field node doesn't have a value");
    }

    public com.gu.typesafe.config.impl.AbstractConfigNodeValue value() {
        for (int i = 0; i < children.size(); i++) {
            if (children.get(i) instanceof com.gu.typesafe.config.impl.AbstractConfigNodeValue) {
                return (com.gu.typesafe.config.impl.AbstractConfigNodeValue)children.get(i);
            }
        }
        throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Field node doesn't have a value");
    }

    public com.gu.typesafe.config.impl.ConfigNodePath path() {
        for (int i = 0; i < children.size(); i++) {
            if (children.get(i) instanceof com.gu.typesafe.config.impl.ConfigNodePath) {
                return (com.gu.typesafe.config.impl.ConfigNodePath)children.get(i);
            }
        }
        throw new ConfigException.BugOrBroken("Field node doesn't have a path");
    }

    protected com.gu.typesafe.config.impl.Token separator() {
        for (com.gu.typesafe.config.impl.AbstractConfigNode child : children) {
            if (child instanceof com.gu.typesafe.config.impl.ConfigNodeSingleToken) {
                com.gu.typesafe.config.impl.Token t = ((com.gu.typesafe.config.impl.ConfigNodeSingleToken) child).token();
                if (t == com.gu.typesafe.config.impl.Tokens.PLUS_EQUALS || t == com.gu.typesafe.config.impl.Tokens.COLON || t == com.gu.typesafe.config.impl.Tokens.EQUALS) {
                    return t;
                }
            }
        }
        return null;
    }

    protected List<String> comments() {
        List<String> comments = new ArrayList<String>();
        for (com.gu.typesafe.config.impl.AbstractConfigNode child : children) {
            if (child instanceof com.gu.typesafe.config.impl.ConfigNodeComment) {
                comments.add(((com.gu.typesafe.config.impl.ConfigNodeComment) child).commentText());
            }
        }
        return comments;
    }
}
