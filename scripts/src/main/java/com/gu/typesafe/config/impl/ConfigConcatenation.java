package com.gu.typesafe.config.impl;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

import com.gu.typesafe.config.ConfigException;
import com.gu.typesafe.config.ConfigObject;
import com.gu.typesafe.config.ConfigOrigin;
import com.gu.typesafe.config.ConfigValueType;
import com.gu.typesafe.config.ConfigRenderOptions;

/**
 * A ConfigConcatenation represents a list of values to be concatenated (see the
 * spec). It only has to exist if at least one value is an unresolved
 * substitution, otherwise we could go ahead and collapse the list into a single
 * value.
 *
 * Right now this is always a list of strings and ${} references, but in the
 * future should support a list of ConfigList. We may also support
 * concatenations of objects, but ConfigDelayedMerge should be used for that
 * since a concat of objects really will merge, not concatenate.
 */
final class ConfigConcatenation extends com.gu.typesafe.config.impl.AbstractConfigValue implements com.gu.typesafe.config.impl.Unmergeable, Container {

    final private List<com.gu.typesafe.config.impl.AbstractConfigValue> pieces;

    ConfigConcatenation(com.gu.typesafe.config.ConfigOrigin origin, List<com.gu.typesafe.config.impl.AbstractConfigValue> pieces) {
        super(origin);
        this.pieces = pieces;

        if (pieces.size() < 2)
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("Created concatenation with less than 2 items: "
                    + this);

        boolean hadUnmergeable = false;
        for (com.gu.typesafe.config.impl.AbstractConfigValue p : pieces) {
            if (p instanceof ConfigConcatenation)
                throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                        "ConfigConcatenation should never be nested: " + this);
            if (p instanceof com.gu.typesafe.config.impl.Unmergeable)
                hadUnmergeable = true;
        }
        if (!hadUnmergeable)
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "Created concatenation without an unmergeable in it: " + this);
    }

    private com.gu.typesafe.config.ConfigException.NotResolved notResolved() {
        return new com.gu.typesafe.config.ConfigException.NotResolved(
                "need to Config#resolve(), see the API docs for Config#resolve(); substitution not resolved: "
                        + this);
    }

    @Override
    public com.gu.typesafe.config.ConfigValueType valueType() {
        throw notResolved();
    }

    @Override
    public Object unwrapped() {
        throw notResolved();
    }

    @Override
    protected ConfigConcatenation newCopy(com.gu.typesafe.config.ConfigOrigin newOrigin) {
        return new ConfigConcatenation(newOrigin, pieces);
    }

    @Override
    protected boolean ignoresFallbacks() {
        // we can never ignore fallbacks because if a child ConfigReference
        // is self-referential we have to look lower in the merge stack
        // for its value.
        return false;
    }

    @Override
    public Collection<ConfigConcatenation> unmergedValues() {
        return Collections.singleton(this);
    }

    private static boolean isIgnoredWhitespace(com.gu.typesafe.config.impl.AbstractConfigValue value) {
        return (value instanceof ConfigString) && !((ConfigString)value).wasQuoted();
    }

    /**
     * Add left and right, or their merger, to builder.
     */
    private static void join(ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue> builder, com.gu.typesafe.config.impl.AbstractConfigValue origRight) {
        com.gu.typesafe.config.impl.AbstractConfigValue left = builder.get(builder.size() - 1);
        com.gu.typesafe.config.impl.AbstractConfigValue right = origRight;

        // check for an object which can be converted to a list
        // (this will be an object with numeric keys, like foo.0, foo.1)
        if (left instanceof com.gu.typesafe.config.ConfigObject && right instanceof SimpleConfigList) {
            left = DefaultTransformer.transform(left, com.gu.typesafe.config.ConfigValueType.LIST);
        } else if (left instanceof SimpleConfigList && right instanceof com.gu.typesafe.config.ConfigObject) {
            right = DefaultTransformer.transform(right, ConfigValueType.LIST);
        }

        // Since this depends on the type of two instances, I couldn't think
        // of much alternative to an instanceof chain. Visitors are sometimes
        // used for multiple dispatch but seems like overkill.
        com.gu.typesafe.config.impl.AbstractConfigValue joined = null;
        if (left instanceof com.gu.typesafe.config.ConfigObject && right instanceof com.gu.typesafe.config.ConfigObject) {
            joined = right.withFallback(left);
        } else if (left instanceof SimpleConfigList && right instanceof SimpleConfigList) {
            joined = ((SimpleConfigList)left).concatenate((SimpleConfigList)right);
        } else if ((left instanceof SimpleConfigList || left instanceof ConfigObject) &&
                   isIgnoredWhitespace(right)) {
            joined = left;
            // it should be impossible that left is whitespace and right is a list or object
        } else if (left instanceof ConfigConcatenation || right instanceof ConfigConcatenation) {
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken("unflattened ConfigConcatenation");
        } else if (left instanceof com.gu.typesafe.config.impl.Unmergeable || right instanceof com.gu.typesafe.config.impl.Unmergeable) {
            // leave joined=null, cannot join
        } else {
            // handle primitive type or primitive type mixed with object or list
            String s1 = left.transformToString();
            String s2 = right.transformToString();
            if (s1 == null || s2 == null) {
                throw new com.gu.typesafe.config.ConfigException.WrongType(left.origin(),
                        "Cannot concatenate object or list with a non-object-or-list, " + left
                                + " and " + right + " are not compatible");
            } else {
                com.gu.typesafe.config.ConfigOrigin joinedOrigin = SimpleConfigOrigin.mergeOrigins(left.origin(),
                        right.origin());
                joined = new ConfigString.Quoted(joinedOrigin, s1 + s2);
            }
        }

        if (joined == null) {
            builder.add(right);
        } else {
            builder.remove(builder.size() - 1);
            builder.add(joined);
        }
    }

    static List<com.gu.typesafe.config.impl.AbstractConfigValue> consolidate(List<com.gu.typesafe.config.impl.AbstractConfigValue> pieces) {
        if (pieces.size() < 2) {
            return pieces;
        } else {
            List<com.gu.typesafe.config.impl.AbstractConfigValue> flattened = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>(pieces.size());
            for (com.gu.typesafe.config.impl.AbstractConfigValue v : pieces) {
                if (v instanceof ConfigConcatenation) {
                    flattened.addAll(((ConfigConcatenation) v).pieces);
                } else {
                    flattened.add(v);
                }
            }

            ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue> consolidated = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>(
                    flattened.size());
            for (com.gu.typesafe.config.impl.AbstractConfigValue v : flattened) {
                if (consolidated.isEmpty())
                    consolidated.add(v);
                else
                    join(consolidated, v);
            }

            return consolidated;
        }
    }

    static com.gu.typesafe.config.impl.AbstractConfigValue concatenate(List<com.gu.typesafe.config.impl.AbstractConfigValue> pieces) {
        List<com.gu.typesafe.config.impl.AbstractConfigValue> consolidated = consolidate(pieces);
        if (consolidated.isEmpty()) {
            return null;
        } else if (consolidated.size() == 1) {
            return consolidated.get(0);
        } else {
            ConfigOrigin mergedOrigin = SimpleConfigOrigin.mergeOrigins(consolidated);
            return new ConfigConcatenation(mergedOrigin, consolidated);
        }
    }

    @Override
    com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> resolveSubstitutions(com.gu.typesafe.config.impl.ResolveContext context, ResolveSource source)
            throws NotPossibleToResolve {
        if (ConfigImpl.traceSubstitutionsEnabled()) {
            int indent = context.depth() + 2;
            ConfigImpl.trace(indent - 1, "concatenation has " + pieces.size() + " pieces:");
            int count = 0;
            for (com.gu.typesafe.config.impl.AbstractConfigValue v : pieces) {
                ConfigImpl.trace(indent, count + ": " + v);
                count += 1;
            }
        }

        // Right now there's no reason to pushParent here because the
        // content of ConfigConcatenation should not need to replaceChild,
        // but if it did we'd have to do this.
        ResolveSource sourceWithParent = source; // .pushParent(this);
        com.gu.typesafe.config.impl.ResolveContext newContext = context;

        List<com.gu.typesafe.config.impl.AbstractConfigValue> resolved = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>(pieces.size());
        for (com.gu.typesafe.config.impl.AbstractConfigValue p : pieces) {
            // to concat into a string we have to do a full resolve,
            // so unrestrict the context, then put restriction back afterward
            Path restriction = newContext.restrictToChild();
            com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> result = newContext.unrestricted()
                    .resolve(p, sourceWithParent);
            com.gu.typesafe.config.impl.AbstractConfigValue r = result.value;
            newContext = result.context.restrict(restriction);
            if (ConfigImpl.traceSubstitutionsEnabled())
                ConfigImpl.trace(context.depth(), "resolved concat piece to " + r);
            if (r == null) {
                // it was optional... omit
            } else {
                resolved.add(r);
            }
        }

        // now need to concat everything
        List<com.gu.typesafe.config.impl.AbstractConfigValue> joined = consolidate(resolved);
        // if unresolved is allowed we can just become another
        // ConfigConcatenation
        if (joined.size() > 1 && context.options().getAllowUnresolved())
            return com.gu.typesafe.config.impl.ResolveResult.make(newContext, new ConfigConcatenation(this.origin(), joined));
        else if (joined.isEmpty())
            // we had just a list of optional references using ${?}
            return com.gu.typesafe.config.impl.ResolveResult.make(newContext, null);
        else if (joined.size() == 1)
            return com.gu.typesafe.config.impl.ResolveResult.make(newContext, joined.get(0));
        else
            throw new ConfigException.BugOrBroken("Bug in the library; resolved list was joined to too many values: "
                    + joined);
    }

    @Override
    ResolveStatus resolveStatus() {
        return ResolveStatus.UNRESOLVED;
    }

    @Override
    public ConfigConcatenation replaceChild(com.gu.typesafe.config.impl.AbstractConfigValue child, com.gu.typesafe.config.impl.AbstractConfigValue replacement) {
        List<com.gu.typesafe.config.impl.AbstractConfigValue> newPieces = replaceChildInList(pieces, child, replacement);
        if (newPieces == null)
            return null;
        else
            return new ConfigConcatenation(origin(), newPieces);
    }

    @Override
    public boolean hasDescendant(com.gu.typesafe.config.impl.AbstractConfigValue descendant) {
        return hasDescendantInList(pieces, descendant);
    }

    // when you graft a substitution into another object,
    // you have to prefix it with the location in that object
    // where you grafted it; but save prefixLength so
    // system property and env variable lookups don't get
    // broken.
    @Override
    ConfigConcatenation relativized(Path prefix) {
        List<com.gu.typesafe.config.impl.AbstractConfigValue> newPieces = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>();
        for (com.gu.typesafe.config.impl.AbstractConfigValue p : pieces) {
            newPieces.add(p.relativized(prefix));
        }
        return new ConfigConcatenation(origin(), newPieces);
    }

    @Override
    protected boolean canEqual(Object other) {
        return other instanceof ConfigConcatenation;
    }

    @Override
    public boolean equals(Object other) {
        // note that "origin" is deliberately NOT part of equality
        if (other instanceof ConfigConcatenation) {
            return canEqual(other) && this.pieces.equals(((ConfigConcatenation) other).pieces);
        } else {
            return false;
        }
    }

    @Override
    public int hashCode() {
        // note that "origin" is deliberately NOT part of equality
        return pieces.hashCode();
    }

    @Override
    protected void render(StringBuilder sb, int indent, boolean atRoot, ConfigRenderOptions options) {
        for (com.gu.typesafe.config.impl.AbstractConfigValue p : pieces) {
            p.render(sb, indent, atRoot, options);
        }
    }
}
