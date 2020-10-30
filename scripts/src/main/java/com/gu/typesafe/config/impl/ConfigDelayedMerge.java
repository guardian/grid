/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;

import com.gu.typesafe.config.ConfigException;
import com.gu.typesafe.config.ConfigOrigin;
import com.gu.typesafe.config.ConfigValueType;
import com.gu.typesafe.config.ConfigRenderOptions;

/**
 * The issue here is that we want to first merge our stack of config files, and
 * then we want to evaluate substitutions. But if two substitutions both expand
 * to an object, we might need to merge those two objects. Thus, we can't ever
 * "override" a substitution when we do a merge; instead we have to save the
 * stack of values that should be merged, and resolve the merge when we evaluate
 * substitutions.
 */
final class ConfigDelayedMerge extends com.gu.typesafe.config.impl.AbstractConfigValue implements com.gu.typesafe.config.impl.Unmergeable,
        com.gu.typesafe.config.impl.ReplaceableMergeStack {

    // earlier items in the stack win
    final private List<com.gu.typesafe.config.impl.AbstractConfigValue> stack;

    ConfigDelayedMerge(com.gu.typesafe.config.ConfigOrigin origin, List<com.gu.typesafe.config.impl.AbstractConfigValue> stack) {
        super(origin);
        this.stack = stack;
        if (stack.isEmpty())
            throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                    "creating empty delayed merge value");

        for (com.gu.typesafe.config.impl.AbstractConfigValue v : stack) {
            if (v instanceof ConfigDelayedMerge || v instanceof com.gu.typesafe.config.impl.ConfigDelayedMergeObject)
                throw new com.gu.typesafe.config.ConfigException.BugOrBroken(
                        "placed nested DelayedMerge in a ConfigDelayedMerge, should have consolidated stack");
        }
    }

    @Override
    public ConfigValueType valueType() {
        throw new com.gu.typesafe.config.ConfigException.NotResolved(
                "called valueType() on value with unresolved substitutions, need to Config#resolve() first, see API docs");
    }

    @Override
    public Object unwrapped() {
        throw new com.gu.typesafe.config.ConfigException.NotResolved(
                "called unwrapped() on value with unresolved substitutions, need to Config#resolve() first, see API docs");
    }

    @Override
    com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> resolveSubstitutions(com.gu.typesafe.config.impl.ResolveContext context, com.gu.typesafe.config.impl.ResolveSource source)
            throws NotPossibleToResolve {
        return resolveSubstitutions(this, stack, context, source);
    }

    // static method also used by ConfigDelayedMergeObject
    static com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> resolveSubstitutions(com.gu.typesafe.config.impl.ReplaceableMergeStack replaceable,
                                                                                                                                     List<com.gu.typesafe.config.impl.AbstractConfigValue> stack,
                                                                                                                                     com.gu.typesafe.config.impl.ResolveContext context, com.gu.typesafe.config.impl.ResolveSource source) throws NotPossibleToResolve {
        if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled()) {
            com.gu.typesafe.config.impl.ConfigImpl.trace(context.depth(), "delayed merge stack has " + stack.size() + " items:");
            int count = 0;
            for (com.gu.typesafe.config.impl.AbstractConfigValue v : stack) {
                com.gu.typesafe.config.impl.ConfigImpl.trace(context.depth() + 1, count + ": " + v);
                count += 1;
            }
        }

        // to resolve substitutions, we need to recursively resolve
        // the stack of stuff to merge, and merge the stack so
        // we won't be a delayed merge anymore. If restrictToChildOrNull
        // is non-null, or resolve options allow partial resolves,
        // we may remain a delayed merge though.

        com.gu.typesafe.config.impl.ResolveContext newContext = context;
        int count = 0;
        com.gu.typesafe.config.impl.AbstractConfigValue merged = null;
        for (com.gu.typesafe.config.impl.AbstractConfigValue end : stack) {
            // the end value may or may not be resolved already

            com.gu.typesafe.config.impl.ResolveSource sourceForEnd;

            if (end instanceof com.gu.typesafe.config.impl.ReplaceableMergeStack)
                throw new ConfigException.BugOrBroken("A delayed merge should not contain another one: " + replaceable);
            else if (end instanceof com.gu.typesafe.config.impl.Unmergeable) {
                // the remainder could be any kind of value, including another
                // ConfigDelayedMerge
                com.gu.typesafe.config.impl.AbstractConfigValue remainder = replaceable.makeReplacement(context, count + 1);

                if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                    com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth(), "remainder portion: " + remainder);

                // If, while resolving 'end' we come back to the same
                // merge stack, we only want to look _below_ 'end'
                // in the stack. So we arrange to replace the
                // ConfigDelayedMerge with a value that is only
                // the remainder of the stack below this one.

                if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                    com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth(), "building sourceForEnd");

                // we resetParents() here because we'll be resolving "end"
                // against a root which does NOT contain "end"
                sourceForEnd = source.replaceWithinCurrentParent((com.gu.typesafe.config.impl.AbstractConfigValue) replaceable, remainder);

                if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                    com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth(), "  sourceForEnd before reset parents but after replace: "
                            + sourceForEnd);

                sourceForEnd = sourceForEnd.resetParents();
            } else {
                if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                    com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth(),
                            "will resolve end against the original source with parent pushed");

                sourceForEnd = source.pushParent(replaceable);
            }

            if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled()) {
                com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth(), "sourceForEnd      =" + sourceForEnd);
            }

            if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth(), "Resolving highest-priority item in delayed merge " + end
                        + " against " + sourceForEnd + " endWasRemoved=" + (source != sourceForEnd));
            com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> result = newContext.resolve(end, sourceForEnd);
            com.gu.typesafe.config.impl.AbstractConfigValue resolvedEnd = result.value;
            newContext = result.context;

            if (resolvedEnd != null) {
                if (merged == null) {
                    merged = resolvedEnd;
                } else {
                    if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                        com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth() + 1, "merging " + merged + " with fallback " + resolvedEnd);
                    merged = merged.withFallback(resolvedEnd);
                }
            }

            count += 1;

            if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth(), "stack merged, yielding: " + merged);
        }

        return com.gu.typesafe.config.impl.ResolveResult.make(newContext, merged);
    }

    @Override
    public com.gu.typesafe.config.impl.AbstractConfigValue makeReplacement(com.gu.typesafe.config.impl.ResolveContext context, int skipping) {
        return ConfigDelayedMerge.makeReplacement(context, stack, skipping);
    }

    // static method also used by ConfigDelayedMergeObject; end may be null
    static com.gu.typesafe.config.impl.AbstractConfigValue makeReplacement(com.gu.typesafe.config.impl.ResolveContext context, List<com.gu.typesafe.config.impl.AbstractConfigValue> stack, int skipping) {
        List<com.gu.typesafe.config.impl.AbstractConfigValue> subStack = stack.subList(skipping, stack.size());

        if (subStack.isEmpty()) {
            if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                ConfigImpl.trace(context.depth(), "Nothing else in the merge stack, replacing with null");
            return null;
        } else {
            // generate a new merge stack from only the remaining items
            com.gu.typesafe.config.impl.AbstractConfigValue merged = null;
            for (com.gu.typesafe.config.impl.AbstractConfigValue v : subStack) {
                if (merged == null)
                    merged = v;
                else
                    merged = merged.withFallback(v);
            }
            return merged;
        }
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
            return new ConfigDelayedMerge(origin(), newStack);
    }

    @Override
    public boolean hasDescendant(com.gu.typesafe.config.impl.AbstractConfigValue descendant) {
        return hasDescendantInList(stack, descendant);
    }

    @Override
    ConfigDelayedMerge relativized(Path prefix) {
        List<com.gu.typesafe.config.impl.AbstractConfigValue> newStack = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>();
        for (com.gu.typesafe.config.impl.AbstractConfigValue o : stack) {
            newStack.add(o.relativized(prefix));
        }
        return new ConfigDelayedMerge(origin(), newStack);
    }

    // static utility shared with ConfigDelayedMergeObject
    static boolean stackIgnoresFallbacks(List<com.gu.typesafe.config.impl.AbstractConfigValue> stack) {
        com.gu.typesafe.config.impl.AbstractConfigValue last = stack.get(stack.size() - 1);
        return last.ignoresFallbacks();
    }

    @Override
    protected boolean ignoresFallbacks() {
        return stackIgnoresFallbacks(stack);
    }

    @Override
    protected com.gu.typesafe.config.impl.AbstractConfigValue newCopy(ConfigOrigin newOrigin) {
        return new ConfigDelayedMerge(newOrigin, stack);
    }

    @Override
    protected final ConfigDelayedMerge mergedWithTheUnmergeable(com.gu.typesafe.config.impl.Unmergeable fallback) {
        return (ConfigDelayedMerge) mergedWithTheUnmergeable(stack, fallback);
    }

    @Override
    protected final ConfigDelayedMerge mergedWithObject(AbstractConfigObject fallback) {
        return (ConfigDelayedMerge) mergedWithObject(stack, fallback);
    }

    @Override
    protected ConfigDelayedMerge mergedWithNonObject(com.gu.typesafe.config.impl.AbstractConfigValue fallback) {
        return (ConfigDelayedMerge) mergedWithNonObject(stack, fallback);
    }

    @Override
    public Collection<com.gu.typesafe.config.impl.AbstractConfigValue> unmergedValues() {
        return stack;
    }

    @Override
    protected boolean canEqual(Object other) {
        return other instanceof ConfigDelayedMerge;
    }

    @Override
    public boolean equals(Object other) {
        // note that "origin" is deliberately NOT part of equality
        if (other instanceof ConfigDelayedMerge) {
            return canEqual(other)
                    && (this.stack == ((ConfigDelayedMerge) other).stack || this.stack
                            .equals(((ConfigDelayedMerge) other).stack));
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
        render(stack, sb, indent, atRoot, atKey, options);
    }

    @Override
    protected void render(StringBuilder sb, int indent, boolean atRoot, ConfigRenderOptions options) {
        render(sb, indent, atRoot, null, options);
    }

    // static method also used by ConfigDelayedMergeObject.
    static void render(List<com.gu.typesafe.config.impl.AbstractConfigValue> stack, StringBuilder sb, int indent, boolean atRoot, String atKey,
                       ConfigRenderOptions options) {
        boolean commentMerge = options.getComments();
        if (commentMerge) {
            sb.append("# unresolved merge of " + stack.size() + " values follows (\n");
            if (atKey == null) {
                indent(sb, indent, options);
                sb.append("# this unresolved merge will not be parseable because it's at the root of the object\n");
                indent(sb, indent, options);
                sb.append("# the HOCON format has no way to list multiple root objects in a single file\n");
            }
        }

        List<com.gu.typesafe.config.impl.AbstractConfigValue> reversed = new ArrayList<com.gu.typesafe.config.impl.AbstractConfigValue>();
        reversed.addAll(stack);
        Collections.reverse(reversed);

        int i = 0;
        for (com.gu.typesafe.config.impl.AbstractConfigValue v : reversed) {
            if (commentMerge) {
                indent(sb, indent, options);
                if (atKey != null) {
                    sb.append("#     unmerged value " + i + " for key "
                            + com.gu.typesafe.config.impl.ConfigImplUtil.renderJsonString(atKey) + " from ");
                } else {
                    sb.append("#     unmerged value " + i + " from ");
                }
                i += 1;
                sb.append(v.origin().description());
                sb.append("\n");

                for (String comment : v.origin().comments()) {
                    indent(sb, indent, options);
                    sb.append("# ");
                    sb.append(comment);
                    sb.append("\n");
                }
            }
            indent(sb, indent, options);

            if (atKey != null) {
                sb.append(ConfigImplUtil.renderJsonString(atKey));
                if (options.getFormatted())
                    sb.append(" : ");
                else
                    sb.append(":");
            }
            v.render(sb, indent, atRoot, options);
            sb.append(",");
            if (options.getFormatted())
                sb.append('\n');
        }
        // chop comma or newline
        sb.setLength(sb.length() - 1);
        if (options.getFormatted()) {
            sb.setLength(sb.length() - 1); // also chop comma
            sb.append("\n"); // put a newline back
        }
        if (commentMerge) {
            indent(sb, indent, options);
            sb.append("# ) end of unresolved merge\n");
        }
    }
}
