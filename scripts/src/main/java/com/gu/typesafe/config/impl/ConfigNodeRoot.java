package com.gu.typesafe.config.impl;

import com.gu.typesafe.config.ConfigException;
import com.gu.typesafe.config.ConfigOrigin;
import com.gu.typesafe.config.ConfigSyntax;

import java.util.ArrayList;
import java.util.Collection;

final class ConfigNodeRoot extends com.gu.typesafe.config.impl.ConfigNodeComplexValue {
    final private com.gu.typesafe.config.ConfigOrigin origin;

    ConfigNodeRoot(Collection<com.gu.typesafe.config.impl.AbstractConfigNode> children, ConfigOrigin origin) {
        super(children);
        this.origin = origin;
    }

    @Override
    protected ConfigNodeRoot newNode(Collection<com.gu.typesafe.config.impl.AbstractConfigNode> nodes) {
        throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Tried to indent the root object");
    }

    protected com.gu.typesafe.config.impl.ConfigNodeComplexValue value() {
        for (com.gu.typesafe.config.impl.AbstractConfigNode node : children) {
            if (node instanceof com.gu.typesafe.config.impl.ConfigNodeComplexValue) {
                return (com.gu.typesafe.config.impl.ConfigNodeComplexValue)node;
            }
        }
        throw new com.gu.typesafe.config.ConfigException.BugOrBroken("ConfigNodeRoot did not contain a value");
    }

    protected ConfigNodeRoot setValue(String desiredPath, com.gu.typesafe.config.impl.AbstractConfigNodeValue value, ConfigSyntax flavor) {
        ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> childrenCopy = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>(children);
        for (int i = 0; i < childrenCopy.size(); i++) {
            com.gu.typesafe.config.impl.AbstractConfigNode node = childrenCopy.get(i);
            if (node instanceof com.gu.typesafe.config.impl.ConfigNodeComplexValue) {
                if (node instanceof ConfigNodeArray) {
                    throw new com.gu.typesafe.config.ConfigException.WrongType(origin, "The ConfigDocument had an array at the root level, and values cannot be modified inside an array.");
                } else if (node instanceof com.gu.typesafe.config.impl.ConfigNodeObject) {
                    if (value == null) {
                        childrenCopy.set(i, ((com.gu.typesafe.config.impl.ConfigNodeObject)node).removeValueOnPath(desiredPath, flavor));
                    } else {
                        childrenCopy.set(i, ((com.gu.typesafe.config.impl.ConfigNodeObject) node).setValueOnPath(desiredPath, value, flavor));
                    }
                    return new ConfigNodeRoot(childrenCopy, origin);
                }
            }
        }
        throw new com.gu.typesafe.config.ConfigException.BugOrBroken("ConfigNodeRoot did not contain a value");
    }

    protected boolean hasValue(String desiredPath) {
        Path path = com.gu.typesafe.config.impl.PathParser.parsePath(desiredPath);
        ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode> childrenCopy = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigNode>(children);
        for (int i = 0; i < childrenCopy.size(); i++) {
            com.gu.typesafe.config.impl.AbstractConfigNode node = childrenCopy.get(i);
            if (node instanceof com.gu.typesafe.config.impl.ConfigNodeComplexValue) {
                if (node instanceof ConfigNodeArray) {
                    throw new com.gu.typesafe.config.ConfigException.WrongType(origin, "The ConfigDocument had an array at the root level, and values cannot be modified inside an array.");
                } else if (node instanceof com.gu.typesafe.config.impl.ConfigNodeObject) {
                    return ((com.gu.typesafe.config.impl.ConfigNodeObject) node).hasValue(path);
                }
            }
        }
        throw new ConfigException.BugOrBroken("ConfigNodeRoot did not contain a value");
    }
}
