/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 *   THIS FILE HAS BEEN MODIFIED TO ADD SUPPORT FOR COMPACT KEYS
 */
package com.gu.typesafe.config.impl;

import java.io.ObjectStreamException;
import java.io.Serializable;
import java.math.BigInteger;
import java.util.AbstractMap;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.gu.typesafe.config.*;

final class SimpleConfigObject extends AbstractConfigObject implements Serializable {

    private static final long serialVersionUID = 2L;

    // this map should never be modified - assume immutable
    final private Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> value;
    final private boolean resolved;
    final private boolean ignoresFallbacks;

    SimpleConfigObject(com.gu.typesafe.config.ConfigOrigin origin,
                       Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> value, ResolveStatus status,
                       boolean ignoresFallbacks) {
        super(origin);
        if (value == null)
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "creating config object with null map");
        this.value = value;
        this.resolved = status == ResolveStatus.RESOLVED;
        this.ignoresFallbacks = ignoresFallbacks;

        // Kind of an expensive debug check. Comment out?
        if (status != ResolveStatus.fromValues(value.values()))
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Wrong resolved status on " + this);
    }

    SimpleConfigObject(com.gu.typesafe.config.ConfigOrigin origin,
                       Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> value) {
        this(origin, value, ResolveStatus.fromValues(value.values()), false /* ignoresFallbacks */);
    }

    @Override
    public SimpleConfigObject withOnlyKey(String key) {
        return withOnlyPath(Path.newKey(key));
    }

    @Override
    public SimpleConfigObject withoutKey(String key) {
        return withoutPath(Path.newKey(key));
    }

    // gets the object with only the path if the path
    // exists, otherwise null if it doesn't. this ensures
    // that if we have { a : { b : 42 } } and do
    // withOnlyPath("a.b.c") that we don't keep an empty
    // "a" object.
    @Override
    protected SimpleConfigObject withOnlyPathOrNull(Path path) {
        String key = path.first();
        Path next = path.remainder();
        com.gu.typesafe.config.impl.AbstractConfigValue v = value.get(key);

        if (next != null) {
            if (v != null && (v instanceof AbstractConfigObject)) {
                v = ((AbstractConfigObject) v).withOnlyPathOrNull(next);
            } else {
                // if the path has more elements but we don't have an object,
                // then the rest of the path does not exist.
                v = null;
            }
        }

        if (v == null) {
            return null;
        } else {
            return new SimpleConfigObject(origin(), Collections.singletonMap(key, v),
                    v.resolveStatus(), ignoresFallbacks);
        }
    }

    @Override
    SimpleConfigObject withOnlyPath(Path path) {
        SimpleConfigObject o = withOnlyPathOrNull(path);
        if (o == null) {
            return new SimpleConfigObject(origin(),
                    Collections.<String, com.gu.typesafe.config.impl.AbstractConfigValue> emptyMap(), ResolveStatus.RESOLVED,
                    ignoresFallbacks);
        } else {
            return o;
        }
    }

    @Override
    SimpleConfigObject withoutPath(Path path) {
        String key = path.first();
        Path next = path.remainder();
        com.gu.typesafe.config.impl.AbstractConfigValue v = value.get(key);

        if (v != null && next != null && v instanceof AbstractConfigObject) {
            v = ((AbstractConfigObject) v).withoutPath(next);
            Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> updated = new HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue>(
                    value);
            updated.put(key, v);
            return new SimpleConfigObject(origin(), updated, ResolveStatus.fromValues(updated
                    .values()), ignoresFallbacks);
        } else if (next != null || v == null) {
            // can't descend, nothing to remove
            return this;
        } else {
            Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> smaller = new HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue>(
                    value.size() - 1);
            for (Map.Entry<String, com.gu.typesafe.config.impl.AbstractConfigValue> old : value.entrySet()) {
                if (!old.getKey().equals(key))
                    smaller.put(old.getKey(), old.getValue());
            }
            return new SimpleConfigObject(origin(), smaller, ResolveStatus.fromValues(smaller
                    .values()), ignoresFallbacks);
        }
    }

    @Override
    public SimpleConfigObject withValue(String key, com.gu.typesafe.config.ConfigValue v) {
        if (v == null)
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "Trying to store null ConfigValue in a ConfigObject");

        Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> newMap;
        if (value.isEmpty()) {
            newMap = Collections.singletonMap(key, (com.gu.typesafe.config.impl.AbstractConfigValue) v);
        } else {
            newMap = new HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue>(value);
            newMap.put(key, (com.gu.typesafe.config.impl.AbstractConfigValue) v);
        }

        return new SimpleConfigObject(origin(), newMap, ResolveStatus.fromValues(newMap.values()),
                ignoresFallbacks);
    }

    @Override
    SimpleConfigObject withValue(Path path, com.gu.typesafe.config.ConfigValue v) {
        String key = path.first();
        Path next = path.remainder();

        if (next == null) {
            return withValue(key, v);
        } else {
            com.gu.typesafe.config.impl.AbstractConfigValue child = value.get(key);
            if (child != null && child instanceof AbstractConfigObject) {
                // if we have an object, add to it
                return withValue(key, ((AbstractConfigObject) child).withValue(next, v));
            } else {
                // as soon as we have a non-object, replace it entirely
                com.gu.typesafe.config.impl.SimpleConfig subtree = ((com.gu.typesafe.config.impl.AbstractConfigValue) v).atPath(
                        com.gu.typesafe.config.impl.SimpleConfigOrigin.newSimple("withValue(" + next.render() + ")"), next);
                return withValue(key, subtree.root());
            }
        }
    }

    @Override
    protected com.gu.typesafe.config.impl.AbstractConfigValue attemptPeekWithPartialResolve(String key) {
        return value.get(key);
    }

    private SimpleConfigObject newCopy(ResolveStatus newStatus, com.gu.typesafe.config.ConfigOrigin newOrigin,
            boolean newIgnoresFallbacks) {
        return new SimpleConfigObject(newOrigin, value, newStatus, newIgnoresFallbacks);
    }

    @Override
    protected SimpleConfigObject newCopy(ResolveStatus newStatus, com.gu.typesafe.config.ConfigOrigin newOrigin) {
        return newCopy(newStatus, newOrigin, ignoresFallbacks);
    }

    @Override
    protected SimpleConfigObject withFallbacksIgnored() {
        if (ignoresFallbacks)
            return this;
        else
            return newCopy(resolveStatus(), origin(), true /* ignoresFallbacks */);
    }

    @Override
    ResolveStatus resolveStatus() {
        return ResolveStatus.fromBoolean(resolved);
    }

    @Override
    public SimpleConfigObject replaceChild(com.gu.typesafe.config.impl.AbstractConfigValue child, com.gu.typesafe.config.impl.AbstractConfigValue replacement) {
        HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue> newChildren = new HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue>(value);
        for (Map.Entry<String, com.gu.typesafe.config.impl.AbstractConfigValue> old : newChildren.entrySet()) {
            if (old.getValue() == child) {
                if (replacement != null)
                    old.setValue(replacement);
                else
                    newChildren.remove(old.getKey());

                return new SimpleConfigObject(origin(), newChildren, ResolveStatus.fromValues(newChildren.values()),
                        ignoresFallbacks);
            }
        }
        throw new com.gu.typesafe.config.ConfigException.BugOrBroken("SimpleConfigObject.replaceChild did not find " + child + " in " + this);
    }

    @Override
    public boolean hasDescendant(com.gu.typesafe.config.impl.AbstractConfigValue descendant) {
        for (com.gu.typesafe.config.impl.AbstractConfigValue child : value.values()) {
            if (child == descendant)
                return true;
        }
        // now do the expensive search
        for (com.gu.typesafe.config.impl.AbstractConfigValue child : value.values()) {
            if (child instanceof com.gu.typesafe.config.impl.Container && ((com.gu.typesafe.config.impl.Container) child).hasDescendant(descendant))
                return true;
        }

        return false;
    }

    @Override
    protected boolean ignoresFallbacks() {
        return ignoresFallbacks;
    }

    @Override
    public Map<String, Object> unwrapped() {
        Map<String, Object> m = new HashMap<String, Object>();
        for (Map.Entry<String, com.gu.typesafe.config.impl.AbstractConfigValue> e : value.entrySet()) {
            m.put(e.getKey(), e.getValue().unwrapped());
        }
        return m;
    }

    @Override
    protected SimpleConfigObject mergedWithObject(AbstractConfigObject abstractFallback) {
        requireNotIgnoringFallbacks();

        if (!(abstractFallback instanceof SimpleConfigObject)) {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "should not be reached (merging non-SimpleConfigObject)");
        }

        SimpleConfigObject fallback = (SimpleConfigObject) abstractFallback;

        boolean changed = false;
        boolean allResolved = true;
        Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> merged = new HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue>();
        Set<String> allKeys = new HashSet<String>();
        allKeys.addAll(this.keySet());
        allKeys.addAll(fallback.keySet());
        for (String key : allKeys) {
            com.gu.typesafe.config.impl.AbstractConfigValue first = this.value.get(key);
            com.gu.typesafe.config.impl.AbstractConfigValue second = fallback.value.get(key);
            com.gu.typesafe.config.impl.AbstractConfigValue kept;
            if (first == null)
                kept = second;
            else if (second == null)
                kept = first;
            else
                kept = first.withFallback(second);

            merged.put(key, kept);

            if (first != kept)
                changed = true;

            if (kept.resolveStatus() == ResolveStatus.UNRESOLVED)
                allResolved = false;
        }

        ResolveStatus newResolveStatus = ResolveStatus.fromBoolean(allResolved);
        boolean newIgnoresFallbacks = fallback.ignoresFallbacks();

        if (changed)
            return new SimpleConfigObject(mergeOrigins(this, fallback), merged, newResolveStatus,
                    newIgnoresFallbacks);
        else if (newResolveStatus != resolveStatus() || newIgnoresFallbacks != ignoresFallbacks())
            return newCopy(newResolveStatus, origin(), newIgnoresFallbacks);
        else
            return this;
    }

    private SimpleConfigObject modify(NoExceptionsModifier modifier) {
        try {
            return modifyMayThrow(modifier);
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("unexpected checked exception", e);
        }
    }

    private SimpleConfigObject modifyMayThrow(Modifier modifier) throws Exception {
        Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> changes = null;
        for (String k : keySet()) {
            com.gu.typesafe.config.impl.AbstractConfigValue v = value.get(k);
            // "modified" may be null, which means remove the child;
            // to do that we put null in the "changes" map.
            com.gu.typesafe.config.impl.AbstractConfigValue modified = modifier.modifyChildMayThrow(k, v);
            if (modified != v) {
                if (changes == null)
                    changes = new HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue>();
                changes.put(k, modified);
            }
        }
        if (changes == null) {
            return this;
        } else {
            Map<String, com.gu.typesafe.config.impl.AbstractConfigValue> modified = new HashMap<String, com.gu.typesafe.config.impl.AbstractConfigValue>();
            boolean sawUnresolved = false;
            for (String k : keySet()) {
                if (changes.containsKey(k)) {
                    com.gu.typesafe.config.impl.AbstractConfigValue newValue = changes.get(k);
                    if (newValue != null) {
                        modified.put(k, newValue);
                        if (newValue.resolveStatus() == ResolveStatus.UNRESOLVED)
                            sawUnresolved = true;
                    } else {
                        // remove this child; don't put it in the new map.
                    }
                } else {
                    com.gu.typesafe.config.impl.AbstractConfigValue newValue = value.get(k);
                    modified.put(k, newValue);
                    if (newValue.resolveStatus() == ResolveStatus.UNRESOLVED)
                        sawUnresolved = true;
                }
            }
            return new SimpleConfigObject(origin(), modified,
                    sawUnresolved ? ResolveStatus.UNRESOLVED : ResolveStatus.RESOLVED,
                    ignoresFallbacks());
        }
    }

    private static final class ResolveModifier implements Modifier {

        final Path originalRestrict;
        com.gu.typesafe.config.impl.ResolveContext context;
        final com.gu.typesafe.config.impl.ResolveSource source;

        ResolveModifier(com.gu.typesafe.config.impl.ResolveContext context, com.gu.typesafe.config.impl.ResolveSource source) {
            this.context = context;
            this.source = source;
            originalRestrict = context.restrictToChild();
        }

        @Override
        public com.gu.typesafe.config.impl.AbstractConfigValue modifyChildMayThrow(String key, com.gu.typesafe.config.impl.AbstractConfigValue v) throws NotPossibleToResolve {
            if (context.isRestrictedToChild()) {
                if (key.equals(context.restrictToChild().first())) {
                    Path remainder = context.restrictToChild().remainder();
                    if (remainder != null) {
                        com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> result = context.restrict(remainder).resolve(v,
                                source);
                        context = result.context.unrestricted().restrict(originalRestrict);
                        return result.value;
                    } else {
                        // we don't want to resolve the leaf child.
                        return v;
                    }
                } else {
                    // not in the restrictToChild path
                    return v;
                }
            } else {
                // no restrictToChild, resolve everything
                com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> result = context.unrestricted().resolve(v, source);
                context = result.context.unrestricted().restrict(originalRestrict);
                return result.value;
            }
        }

    }

    @Override
    com.gu.typesafe.config.impl.ResolveResult<? extends AbstractConfigObject> resolveSubstitutions(com.gu.typesafe.config.impl.ResolveContext context, com.gu.typesafe.config.impl.ResolveSource source)
            throws NotPossibleToResolve {
        if (resolveStatus() == ResolveStatus.RESOLVED)
            return com.gu.typesafe.config.impl.ResolveResult.make(context, this);

        final com.gu.typesafe.config.impl.ResolveSource sourceWithParent = source.pushParent(this);

        try {
            ResolveModifier modifier = new ResolveModifier(context, sourceWithParent);

            com.gu.typesafe.config.impl.AbstractConfigValue value = modifyMayThrow(modifier);
            return com.gu.typesafe.config.impl.ResolveResult.make(modifier.context, value).asObjectResult();
        } catch (NotPossibleToResolve e) {
            throw e;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new ConfigException.BugOrBroken("unexpected checked exception", e);
        }
    }

    @Override
    SimpleConfigObject relativized(final Path prefix) {
        return modify(new NoExceptionsModifier() {

            @Override
            public com.gu.typesafe.config.impl.AbstractConfigValue modifyChild(String key, com.gu.typesafe.config.impl.AbstractConfigValue v) {
                return v.relativized(prefix);
            }

        });
    }

    // this is only Serializable to chill out a findbugs warning
    static final private class RenderComparator implements java.util.Comparator<String>, Serializable {
        private static final long serialVersionUID = 1L;

        private static boolean isAllDigits(String s) {
            int length = s.length();

            // empty string doesn't count as a number
            // string longer than "max number of digits in a long" cannot be parsed as a long
            if (length == 0)
                return false;

            for (int i = 0; i < length; ++i) {
                char c = s.charAt(i);

                if (!Character.isDigit(c))
                    return false;
            }
            return true;
        }

        // This is supposed to sort numbers before strings,
        // and sort the numbers numerically. The point is
        // to make objects which are really list-like
        // (numeric indices) appear in order.
        @Override
        public int compare(String a, String b) {
            boolean aDigits = isAllDigits(a);
            boolean bDigits = isAllDigits(b);
            if (aDigits && bDigits) {
                return new BigInteger(a).compareTo(new BigInteger(b));
            } else if (aDigits) {
                return -1;
            } else if (bDigits) {
                return 1;
            } else {
                return a.compareTo(b);
            }
        }
    }

    @Override
    protected void render(StringBuilder sb, int indent, boolean atRoot, ConfigRenderOptions options) {
        if (isEmpty()) {
            sb.append("{}");
        } else {
            String[] keys = keySet().toArray(new String[size()]);
            boolean singleton = keys.length == 1;
            boolean shouldCompact = singleton && options.getCompactKeys();
            boolean outerBraces = options.getJson() || (!atRoot && !shouldCompact);

            int innerIndent;
            if (outerBraces) {
                innerIndent = indent + 1;
                sb.append("{");

                if (options.getFormatted())
                    sb.append('\n');
            } else {
                innerIndent = indent;
            }

            int separatorCount = 0;
            Arrays.sort(keys, new RenderComparator());
            for (String k : keys) {
                com.gu.typesafe.config.impl.AbstractConfigValue v;
                v = value.get(k);

                if (options.getOriginComments()) {
                    String[] lines = v.origin().description().split("\n");
                    for (String l : lines) {
                        indent(sb, indent + 1, options);
                        sb.append('#');
                        if (!l.isEmpty())
                            sb.append(' ');
                        sb.append(l);
                        sb.append("\n");
                    }
                }
                if (options.getComments()) {
                    for (String comment : v.origin().comments()) {
                        indent(sb, innerIndent, options);
                        sb.append("#");
                        if (!comment.startsWith(" "))
                            sb.append(' ');
                        sb.append(comment);
                        sb.append("\n");
                    }
                }
                if (shouldCompact && !atRoot) {
                  sb.append(".");
                } else {
                  indent(sb, innerIndent, options);
                }
                v.render(sb, innerIndent, false /* atRoot */, k, options);

                if (options.getFormatted()) {
                    if (options.getJson()) {
                        sb.append(",");
                        separatorCount = 2;
                    } else {
                        separatorCount = 1;
                    }
                    sb.append('\n');
                } else {
                    sb.append(",");
                    separatorCount = 1;
                }
            }
            // chop last commas/newlines
            sb.setLength(sb.length() - separatorCount);

            if (outerBraces) {
                if (options.getFormatted()) {
                    sb.append('\n'); // put a newline back
                    if (outerBraces)
                        indent(sb, indent, options);
                }
                sb.append("}");
            }
        }
        if (atRoot && options.getFormatted())
            sb.append('\n');
    }

    @Override
    public com.gu.typesafe.config.impl.AbstractConfigValue get(Object key) {
        return value.get(key);
    }

    private static boolean mapEquals(Map<String, com.gu.typesafe.config.ConfigValue> a, Map<String, com.gu.typesafe.config.ConfigValue> b) {
        if (a == b)
            return true;

        Set<String> aKeys = a.keySet();
        Set<String> bKeys = b.keySet();

        if (!aKeys.equals(bKeys))
            return false;

        for (String key : aKeys) {
            if (!a.get(key).equals(b.get(key)))
                return false;
        }
        return true;
    }

    private static int mapHash(Map<String, com.gu.typesafe.config.ConfigValue> m) {
        // the keys have to be sorted, otherwise we could be equal
        // to another map but have a different hashcode.
        List<String> keys = new ArrayList<String>();
        keys.addAll(m.keySet());
        Collections.sort(keys);

        int valuesHash = 0;
        for (String k : keys) {
            valuesHash += m.get(k).hashCode();
        }
        return 41 * (41 + keys.hashCode()) + valuesHash;
    }

    @Override
    protected boolean canEqual(Object other) {
        return other instanceof com.gu.typesafe.config.ConfigObject;
    }

    @Override
    public boolean equals(Object other) {
        // note that "origin" is deliberately NOT part of equality.
        // neither are other "extras" like ignoresFallbacks or resolve status.
        if (other instanceof com.gu.typesafe.config.ConfigObject) {
            // optimization to avoid unwrapped() for two ConfigObject,
            // which is what AbstractConfigValue does.
            return canEqual(other) && mapEquals(this, ((ConfigObject) other));
        } else {
            return false;
        }
    }

    @Override
    public int hashCode() {
        // note that "origin" is deliberately NOT part of equality
        // neither are other "extras" like ignoresFallbacks or resolve status.
        return mapHash(this);
    }

    @Override
    public boolean containsKey(Object key) {
        return value.containsKey(key);
    }

    @Override
    public Set<String> keySet() {
        return value.keySet();
    }

    @Override
    public boolean containsValue(Object v) {
        return value.containsValue(v);
    }

    @Override
    public Set<Map.Entry<String, com.gu.typesafe.config.ConfigValue>> entrySet() {
        // total bloat just to work around lack of type variance

        HashSet<java.util.Map.Entry<String, com.gu.typesafe.config.ConfigValue>> entries = new HashSet<Map.Entry<String, com.gu.typesafe.config.ConfigValue>>();
        for (Map.Entry<String, com.gu.typesafe.config.impl.AbstractConfigValue> e : value.entrySet()) {
            entries.add(new AbstractMap.SimpleImmutableEntry<String, com.gu.typesafe.config.ConfigValue>(
                    e.getKey(), e
                    .getValue()));
        }
        return entries;
    }

    @Override
    public boolean isEmpty() {
        return value.isEmpty();
    }

    @Override
    public int size() {
        return value.size();
    }

    @Override
    public Collection<com.gu.typesafe.config.ConfigValue> values() {
        return new HashSet<ConfigValue>(value.values());
    }

    final private static String EMPTY_NAME = "empty config";
    final private static SimpleConfigObject emptyInstance = empty(com.gu.typesafe.config.impl.SimpleConfigOrigin
            .newSimple(EMPTY_NAME));

    final static SimpleConfigObject empty() {
        return emptyInstance;
    }

    final static SimpleConfigObject empty(com.gu.typesafe.config.ConfigOrigin origin) {
        if (origin == null)
            return empty();
        else
            return new SimpleConfigObject(origin,
                    Collections.<String, com.gu.typesafe.config.impl.AbstractConfigValue> emptyMap());
    }

    final static SimpleConfigObject emptyMissing(ConfigOrigin baseOrigin) {
        return new SimpleConfigObject(com.gu.typesafe.config.impl.SimpleConfigOrigin.newSimple(
                baseOrigin.description() + " (not found)"),
                Collections.<String, com.gu.typesafe.config.impl.AbstractConfigValue> emptyMap());
    }

    // serialization all goes through SerializedConfigValue
    private Object writeReplace() throws ObjectStreamException {
        return new com.gu.typesafe.config.impl.SerializedConfigValue(this);
    }
}
