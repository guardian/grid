/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.gu.typesafe.config.ConfigException;
import com.gu.typesafe.config.ConfigList;
import com.gu.typesafe.config.ConfigOrigin;
import com.gu.typesafe.config.ConfigValue;
import com.gu.typesafe.config.ConfigMergeable;
import com.gu.typesafe.config.ConfigRenderOptions;

// This is just like ConfigDelayedMerge except we know statically
// that it will turn out to be an object.
final class ConfigDelayedMergeObject extends AbstractConfigObject implements com.gu.typesafe.config.impl.Unmergeable,
        com.gu.typesafe.config.impl.ReplaceableMergeStack {

    final private List<com.gu.typesafe.config.impl.AbstractConfigValue> stack;

    ConfigDelayedMergeObject(com.gu.typesafe.config.ConfigOrigin origin, List<com.gu.typesafe.config.impl.AbstractConfigValue> stack) {
        super(origin);
        this.stack = stack;

        if (stack.isEmpty())
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "creating empty delayed merge object");
        if (!(stack.get(0) instanceof AbstractConfigObject))
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "created a delayed merge object not guaranteed to be an object");

        for (com.gu.typesafe.config.impl.AbstractConfigValue v : stack) {
            if (v instanceof ConfigDelayedMerge || v instanceof ConfigDelayedMergeObject)
                throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                        "placed nested DelayedMerge in a ConfigDelayedMergeObject, should have consolidated stack");
        }
    }

    @Override
    protected ConfigDelayedMergeObject newCopy(ResolveStatus status, ConfigOrigin origin) {
        if (status != resolveStatus())
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "attempt to create resolved ConfigDelayedMergeObject");
        return new ConfigDelayedMergeObject(origin, stack);
    }

    @Override
    com.gu.typesafe.config.impl.ResolveResult<? extends AbstractConfigObject> resolveSubstitutions(com.gu.typesafe.config.impl.ResolveContext context, com.gu.typesafe.config.impl.ResolveSource source)
            throws NotPossibleToResolve {
        com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> merged = ConfigDelayedMerge.resolveSubstitutions(this, stack,
                context, source);
        return merged.asObjectResult();
    }

    @Override
    public com.gu.typesafe.config.impl.AbstractConfigValue makeReplacement(com.gu.typesafe.config.impl.ResolveContext context, int skipping) {
        return ConfigDelayedMerge.makeReplacement(context, stack, skipping);
    }

    @Override
    ResolveStatus resolveStatus() {
        return ResolveStatus.UNRESOLVED;
    }

    @Override
    public com.gu.typesafe.config.impl.AbstractConfigValue replaceChild(com.gu.typesafe.config.impl.AbstractConfigValue child, com.gu.typesafe.config.impl.AbstractConfigValue replacement) {
        List<com.gu.typesafe.config.impl.AbstractConfigValue> newStack = replaceChildInList(stack, child, replacement);
        if (newStack == null)
            return null;
        else
            return new ConfigDelayedMergeObject(origin(), newStack);
    }

    @Override
    public boolean hasDescendant(com.gu.typesafe.config.impl.AbstractConfigValue descendant) {
        return hasDescendantInList(stack, descendant);
    }

    @Override
    ConfigDelayedMergeObject relativized(Path prefix) {
        List<com.gu.typesafe.config.impl.AbstractConfigValue> newStack = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>();
        for (com.gu.typesafe.config.impl.AbstractConfigValue o : stack) {
            newStack.add(o.relativized(prefix));
        }
        return new ConfigDelayedMergeObject(origin(), newStack);
    }

    @Override
    protected boolean ignoresFallbacks() {
        return ConfigDelayedMerge.stackIgnoresFallbacks(stack);
    }

    @Override
    protected final ConfigDelayedMergeObject mergedWithTheUnmergeable(com.gu.typesafe.config.impl.Unmergeable fallback) {
        requireNotIgnoringFallbacks();

        return (ConfigDelayedMergeObject) mergedWithTheUnmergeable(stack, fallback);
    }

    @Override
    protected final ConfigDelayedMergeObject mergedWithObject(AbstractConfigObject fallback) {
        return mergedWithNonObject(fallback);
    }

    @Override
    protected final ConfigDelayedMergeObject mergedWithNonObject(com.gu.typesafe.config.impl.AbstractConfigValue fallback) {
        requireNotIgnoringFallbacks();

        return (ConfigDelayedMergeObject) mergedWithNonObject(stack, fallback);
    }

    @Override
    public ConfigDelayedMergeObject withFallback(ConfigMergeable mergeable) {
        return (ConfigDelayedMergeObject) super.withFallback(mergeable);
    }

    @Override
    public ConfigDelayedMergeObject withOnlyKey(String key) {
        throw notResolved();
    }

    @Override
    public ConfigDelayedMergeObject withoutKey(String key) {
        throw notResolved();
    }

    @Override
    protected AbstractConfigObject withOnlyPathOrNull(Path path) {
        throw notResolved();
    }

    @Override
    AbstractConfigObject withOnlyPath(Path path) {
        throw notResolved();
    }

    @Override
    AbstractConfigObject withoutPath(Path path) {
        throw notResolved();
    }

    @Override
    public ConfigDelayedMergeObject withValue(String key, com.gu.typesafe.config.ConfigValue value) {
        throw notResolved();
    }

    @Override
    ConfigDelayedMergeObject withValue(Path path, com.gu.typesafe.config.ConfigValue value) {
        throw notResolved();
    }

    @Override
    public Collection<com.gu.typesafe.config.impl.AbstractConfigValue> unmergedValues() {
        return stack;
    }

    @Override
    protected boolean canEqual(Object other) {
        return other instanceof ConfigDelayedMergeObject;
    }

    @Override
    public boolean equals(Object other) {
        // note that "origin" is deliberately NOT part of equality
        if (other instanceof ConfigDelayedMergeObject) {
            return canEqual(other)
                    && (this.stack == ((ConfigDelayedMergeObject) other).stack || this.stack
                            .equals(((ConfigDelayedMergeObject) other).stack));
        } else {
            return false;
        }
    }

    @Override
    public int hashCode() {
        // note that "origin" is deliberately NOT part of equality
        return stack.hashCode();
    }

    @Override
    protected void render(StringBuilder sb, int indent, boolean atRoot, String atKey, ConfigRenderOptions options) {
        ConfigDelayedMerge.render(stack, sb, indent, atRoot, atKey, options);
    }

    @Override
    protected void render(StringBuilder sb, int indent, boolean atRoot, ConfigRenderOptions options) {
        render(sb, indent, atRoot, null, options);
    }

    private static com.gu.typesafe.config.ConfigException notResolved() {
        return new com.gu.typesafe.config.ConfigException.NotResolved(
                "need to Config#resolve() before using this object, see the API docs for Config#resolve()");
    }

    @Override
    public Map<String, Object> unwrapped() {
        throw notResolved();
    }

    @Override
    public com.gu.typesafe.config.impl.AbstractConfigValue get(Object key) {
        throw notResolved();
    }

    @Override
    public boolean containsKey(Object key) {
        throw notResolved();
    }

    @Override
    public boolean containsValue(Object value) {
        throw notResolved();
    }

    @Override
    public Set<java.util.Map.Entry<String, com.gu.typesafe.config.ConfigValue>> entrySet() {
        throw notResolved();
    }

    @Override
    public boolean isEmpty() {
        throw notResolved();
    }

    @Override
    public Set<String> keySet() {
        throw notResolved();
    }

    @Override
    public int size() {
        throw notResolved();
    }

    @Override
    public Collection<ConfigValue> values() {
        throw notResolved();
    }

    @Override
    protected com.gu.typesafe.config.impl.AbstractConfigValue attemptPeekWithPartialResolve(String key) {
        // a partial resolve of a ConfigDelayedMergeObject always results in a
        // SimpleConfigObject because all the substitutions in the stack get
        // resolved in order to look up the partial.
        // So we know here that we have not been resolved at all even
        // partially.
        // Given that, all this code is probably gratuitous, since the app code
        // is likely broken. But in general we only throw NotResolved if you try
        // to touch the exact key that isn't resolved, so this is in that
        // spirit.

        // we'll be able to return a key if we have a value that ignores
        // fallbacks, prior to any unmergeable values.
        for (com.gu.typesafe.config.impl.AbstractConfigValue layer : stack) {
            if (layer instanceof AbstractConfigObject) {
                AbstractConfigObject objectLayer = (AbstractConfigObject) layer;
                com.gu.typesafe.config.impl.AbstractConfigValue v = objectLayer.attemptPeekWithPartialResolve(key);
                if (v != null) {
                    if (v.ignoresFallbacks()) {
                        // we know we won't need to merge anything in to this
                        // value
                        return v;
                    } else {
                        // we can't return this value because we know there are
                        // unmergeable values later in the stack that may
                        // contain values that need to be merged with this
                        // value. we'll throw the exception when we get to those
                        // unmergeable values, so continue here.
                        continue;
                    }
                } else if (layer instanceof com.gu.typesafe.config.impl.Unmergeable) {
                    // an unmergeable object (which would be another
                    // ConfigDelayedMergeObject) can't know that a key is
                    // missing, so it can't return null; it can only return a
                    // value or throw NotPossibleToResolve
                    throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                            "should not be reached: unmergeable object returned null value");
                } else {
                    // a non-unmergeable AbstractConfigObject that returned null
                    // for the key in question is not relevant, we can keep
                    // looking for a value.
                    continue;
                }
            } else if (layer instanceof com.gu.typesafe.config.impl.Unmergeable) {
                throw new com.gu.typesafe.config.ConfigException.NotResolved("Key '" + key + "' is not available at '"
                        + origin().description() + "' because value at '"
                        + layer.origin().description()
                        + "' has not been resolved and may turn out to contain or hide '" + key
                        + "'."
                        + " Be sure to Config#resolve() before using a config object.");
            } else if (layer.resolveStatus() == ResolveStatus.UNRESOLVED) {
                // if the layer is not an object, and not a substitution or
                // merge,
                // then it's something that's unresolved because it _contains_
                // an unresolved object... i.e. it's an array
                if (!(layer instanceof ConfigList))
                    throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Expecting a list here, not " + layer);
                // all later objects will be hidden so we can say we won't find
                // the key
                return null;
            } else {
                // non-object, but resolved, like an integer or something.
                // has no children so the one we're after won't be in it.
                // we would only have this in the stack in case something
                // else "looks back" to it due to a cycle.
                // anyway at this point we know we can't find the key anymore.
                if (!layer.ignoresFallbacks()) {
                    throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                            "resolved non-object should ignore fallbacks");
                }
                return null;
            }
        }
        // If we get here, then we never found anything unresolved which means
        // the ConfigDelayedMergeObject should not have existed. some
        // invariant was violated.
        throw new ConfigException.BugOrBroken(
                "Delayed merge stack does not contain any unmergeable values");

    }
}
