/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import com.gu.typesafe.config.*;
import com.gu.typesafe.config.ConfigMergeable;
import com.gu.typesafe.config.ConfigRenderOptions;

abstract class AbstractConfigObject extends com.gu.typesafe.config.impl.AbstractConfigValue implements com.gu.typesafe.config.ConfigObject, com.gu.typesafe.config.impl.Container {
    final private com.gu.typesafe.config.impl.SimpleConfig config;

    protected AbstractConfigObject(com.gu.typesafe.config.ConfigOrigin origin) {
        super(origin);
        this.config = new com.gu.typesafe.config.impl.SimpleConfig(this);
    }

    @Override
    public com.gu.typesafe.config.impl.SimpleConfig toConfig() {
        return config;
    }

    @Override
    public AbstractConfigObject toFallbackValue() {
        return this;
    }

    @Override
    abstract public AbstractConfigObject withOnlyKey(String key);

    @Override
    abstract public AbstractConfigObject withoutKey(String key);

    @Override
    abstract public AbstractConfigObject withValue(String key, com.gu.typesafe.config.ConfigValue value);

    abstract protected AbstractConfigObject withOnlyPathOrNull(Path path);

    abstract AbstractConfigObject withOnlyPath(Path path);

    abstract AbstractConfigObject withoutPath(Path path);

    abstract AbstractConfigObject withValue(Path path, com.gu.typesafe.config.ConfigValue value);

    /**
     * This looks up the key with no transformation or type conversion of any
     * kind, and returns null if the key is not present. The object must be
     * resolved along the nodes needed to get the key or
     * ConfigException.NotResolved will be thrown.
     *
     * @param key
     * @return the unmodified raw value or null
     */
    protected final com.gu.typesafe.config.impl.AbstractConfigValue peekAssumingResolved(String key, Path originalPath) {
        try {
            return attemptPeekWithPartialResolve(key);
        } catch (com.gu.typesafe.config.ConfigException.NotResolved e) {
            throw com.gu.typesafe.config.impl.ConfigImpl.improveNotResolved(originalPath, e);
        }
    }

    /**
     * Look up the key on an only-partially-resolved object, with no
     * transformation or type conversion of any kind; if 'this' is not resolved
     * then try to look up the key anyway if possible.
     *
     * @param key
     *            key to look up
     * @return the value of the key, or null if known not to exist
     * @throws com.gu.typesafe.config.ConfigException.NotResolved
     *             if can't figure out key's value (or existence) without more
     *             resolving
     */
    abstract com.gu.typesafe.config.impl.AbstractConfigValue attemptPeekWithPartialResolve(String key);

    /**
     * Looks up the path with no transformation or type conversion. Returns null
     * if the path is not found; throws ConfigException.NotResolved if we need
     * to go through an unresolved node to look up the path.
     */
    protected com.gu.typesafe.config.impl.AbstractConfigValue peekPath(Path path) {
        return peekPath(this, path);
    }

    private static com.gu.typesafe.config.impl.AbstractConfigValue peekPath(AbstractConfigObject self, Path path) {
        try {
            // we'll fail if anything along the path can't
            // be looked at without resolving.
            Path next = path.remainder();
            com.gu.typesafe.config.impl.AbstractConfigValue v = self.attemptPeekWithPartialResolve(path.first());

            if (next == null) {
                return v;
            } else {
                if (v instanceof AbstractConfigObject) {
                    return peekPath((AbstractConfigObject) v, next);
                } else {
                    return null;
                }
            }
        } catch (com.gu.typesafe.config.ConfigException.NotResolved e) {
            throw ConfigImpl.improveNotResolved(path, e);
        }
    }

    @Override
    public com.gu.typesafe.config.ConfigValueType valueType() {
        return ConfigValueType.OBJECT;
    }

    protected abstract AbstractConfigObject newCopy(ResolveStatus status, com.gu.typesafe.config.ConfigOrigin origin);

    @Override
    protected AbstractConfigObject newCopy(com.gu.typesafe.config.ConfigOrigin origin) {
        return newCopy(resolveStatus(), origin);
    }

    @Override
    protected AbstractConfigObject constructDelayedMerge(com.gu.typesafe.config.ConfigOrigin origin,
                                                         List<com.gu.typesafe.config.impl.AbstractConfigValue> stack) {
        return new com.gu.typesafe.config.impl.ConfigDelayedMergeObject(origin, stack);
    }

    @Override
    protected abstract AbstractConfigObject mergedWithObject(AbstractConfigObject fallback);

    @Override
    public AbstractConfigObject withFallback(ConfigMergeable mergeable) {
        return (AbstractConfigObject) super.withFallback(mergeable);
    }

    static com.gu.typesafe.config.ConfigOrigin mergeOrigins(
            Collection<? extends com.gu.typesafe.config.impl.AbstractConfigValue> stack) {
        if (stack.isEmpty())
            throw new ConfigException.BugOrBroken(
                    "can't merge origins on empty list");
        List<com.gu.typesafe.config.ConfigOrigin> origins = new ArrayList<com.gu.typesafe.config.ConfigOrigin>();
        com.gu.typesafe.config.ConfigOrigin firstOrigin = null;
        int numMerged = 0;
        for (com.gu.typesafe.config.impl.AbstractConfigValue v : stack) {
            if (firstOrigin == null)
                firstOrigin = v.origin();

            if (v instanceof AbstractConfigObject
                    && ((AbstractConfigObject) v).resolveStatus() == ResolveStatus.RESOLVED
                    && ((ConfigObject) v).isEmpty()) {
                // don't include empty files or the .empty()
                // config in the description, since they are
                // likely to be "implementation details"
            } else {
                origins.add(v.origin());
                numMerged += 1;
            }
        }

        if (numMerged == 0) {
            // the configs were all empty, so just use the first one
            origins.add(firstOrigin);
        }

        return com.gu.typesafe.config.impl.SimpleConfigOrigin.mergeOrigins(origins);
    }

    static com.gu.typesafe.config.ConfigOrigin mergeOrigins(AbstractConfigObject... stack) {
        return mergeOrigins(Arrays.asList(stack));
    }

    @Override
    abstract com.gu.typesafe.config.impl.ResolveResult<? extends AbstractConfigObject> resolveSubstitutions(com.gu.typesafe.config.impl.ResolveContext context,
                                                                                                            com.gu.typesafe.config.impl.ResolveSource source)
            throws NotPossibleToResolve;

    @Override
    abstract AbstractConfigObject relativized(final Path prefix);

    @Override
    public abstract com.gu.typesafe.config.impl.AbstractConfigValue get(Object key);

    @Override
    protected abstract void render(StringBuilder sb, int indent, boolean atRoot, ConfigRenderOptions options);

    private static UnsupportedOperationException weAreImmutable(String method) {
        return new UnsupportedOperationException("ConfigObject is immutable, you can't call Map."
                + method);
    }

    @Override
    public void clear() {
        throw weAreImmutable("clear");
    }

    @Override
    public com.gu.typesafe.config.ConfigValue put(String arg0, com.gu.typesafe.config.ConfigValue arg1) {
        throw weAreImmutable("put");
    }

    @Override
    public void putAll(Map<? extends String, ? extends com.gu.typesafe.config.ConfigValue> arg0) {
        throw weAreImmutable("putAll");
    }

    @Override
    public ConfigValue remove(Object arg0) {
        throw weAreImmutable("remove");
    }

    @Override
    public AbstractConfigObject withOrigin(ConfigOrigin origin) {
        return (AbstractConfigObject) super.withOrigin(origin);
    }
}
