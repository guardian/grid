package com.gu.typesafe.config.impl;

import java.util.Collection;
import java.util.Collections;

import com.gu.typesafe.config.ConfigException;
import com.gu.typesafe.config.ConfigOrigin;
import com.gu.typesafe.config.ConfigValue;
import com.gu.typesafe.config.ConfigValueType;
import com.gu.typesafe.config.ConfigRenderOptions;

/**
 * ConfigReference replaces ConfigReference (the older class kept for back
 * compat) and represents the ${} substitution syntax. It can resolve to any
 * kind of value.
 */
final class ConfigReference extends com.gu.typesafe.config.impl.AbstractConfigValue implements com.gu.typesafe.config.impl.Unmergeable {

    final private com.gu.typesafe.config.impl.SubstitutionExpression expr;
    // the length of any prefixes added with relativized()
    final private int prefixLength;

    ConfigReference(com.gu.typesafe.config.ConfigOrigin origin, com.gu.typesafe.config.impl.SubstitutionExpression expr) {
        this(origin, expr, 0);
    }

    private ConfigReference(com.gu.typesafe.config.ConfigOrigin origin, com.gu.typesafe.config.impl.SubstitutionExpression expr, int prefixLength) {
        super(origin);
        this.expr = expr;
        this.prefixLength = prefixLength;
    }

    private com.gu.typesafe.config.ConfigException.NotResolved notResolved() {
        return new com.gu.typesafe.config.ConfigException.NotResolved(
                "need to Config#resolve(), see the API docs for Config#resolve(); substitution not resolved: "
                        + this);
    }

    @Override
    public ConfigValueType valueType() {
        throw notResolved();
    }

    @Override
    public Object unwrapped() {
        throw notResolved();
    }

    @Override
    protected ConfigReference newCopy(ConfigOrigin newOrigin) {
        return new ConfigReference(newOrigin, expr, prefixLength);
    }

    @Override
    protected boolean ignoresFallbacks() {
        return false;
    }

    @Override
    public Collection<ConfigReference> unmergedValues() {
        return Collections.singleton(this);
    }

    // ConfigReference should be a firewall against NotPossibleToResolve going
    // further up the stack; it should convert everything to ConfigException.
    // This way it's impossible for NotPossibleToResolve to "escape" since
    // any failure to resolve has to start with a ConfigReference.
    @Override
    com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> resolveSubstitutions(com.gu.typesafe.config.impl.ResolveContext context, com.gu.typesafe.config.impl.ResolveSource source) {
        com.gu.typesafe.config.impl.ResolveContext newContext = context.addCycleMarker(this);
        com.gu.typesafe.config.impl.AbstractConfigValue v;
        try {
            com.gu.typesafe.config.impl.ResolveSource.ResultWithPath resultWithPath = source.lookupSubst(newContext, expr, prefixLength);
            newContext = resultWithPath.result.context;

            if (resultWithPath.result.value != null) {
                if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                    com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth(), "recursively resolving " + resultWithPath
                            + " which was the resolution of " + expr + " against " + source);

                com.gu.typesafe.config.impl.ResolveSource recursiveResolveSource = (new com.gu.typesafe.config.impl.ResolveSource(
                        (AbstractConfigObject) resultWithPath.pathFromRoot.last(), resultWithPath.pathFromRoot));

                if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                    com.gu.typesafe.config.impl.ConfigImpl.trace(newContext.depth(), "will recursively resolve against " + recursiveResolveSource);

                com.gu.typesafe.config.impl.ResolveResult<? extends com.gu.typesafe.config.impl.AbstractConfigValue> result = newContext.resolve(resultWithPath.result.value,
                        recursiveResolveSource);
                v = result.value;
                newContext = result.context;
            } else {
                ConfigValue fallback = context.options().getResolver().lookup(expr.path().render());
                v = (com.gu.typesafe.config.impl.AbstractConfigValue) fallback;
            }
        } catch (NotPossibleToResolve e) {
            if (com.gu.typesafe.config.impl.ConfigImpl.traceSubstitutionsEnabled())
                ConfigImpl.trace(newContext.depth(),
                        "not possible to resolve " + expr + ", cycle involved: " + e.traceString());
            if (expr.optional())
                v = null;
            else
                throw new com.gu.typesafe.config.ConfigException.UnresolvedSubstitution(origin(), expr
                        + " was part of a cycle of substitutions involving " + e.traceString(), e);
        }

        if (v == null && !expr.optional()) {
            if (newContext.options().getAllowUnresolved())
                return com.gu.typesafe.config.impl.ResolveResult.make(newContext.removeCycleMarker(this), this);
            else
                throw new ConfigException.UnresolvedSubstitution(origin(), expr.toString());
        } else {
            return com.gu.typesafe.config.impl.ResolveResult.make(newContext.removeCycleMarker(this), v);
        }
    }

    @Override
    ResolveStatus resolveStatus() {
        return ResolveStatus.UNRESOLVED;
    }

    // when you graft a substitution into another object,
    // you have to prefix it with the location in that object
    // where you grafted it; but save prefixLength so
    // system property and env variable lookups don't get
    // broken.
    @Override
    ConfigReference relativized(Path prefix) {
        com.gu.typesafe.config.impl.SubstitutionExpression newExpr = expr.changePath(expr.path().prepend(prefix));
        return new ConfigReference(origin(), newExpr, prefixLength + prefix.length());
    }

    @Override
    protected boolean canEqual(Object other) {
        return other instanceof ConfigReference;
    }

    @Override
    public boolean equals(Object other) {
        // note that "origin" is deliberately NOT part of equality
        if (other instanceof ConfigReference) {
            return canEqual(other) && this.expr.equals(((ConfigReference) other).expr);
        } else {
            return false;
        }
    }

    @Override
    public int hashCode() {
        // note that "origin" is deliberately NOT part of equality
        return expr.hashCode();
    }

    @Override
    protected void render(StringBuilder sb, int indent, boolean atRoot, ConfigRenderOptions options) {
        sb.append(expr.toString());
    }

    com.gu.typesafe.config.impl.SubstitutionExpression expression() {
        return expr;
    }
}
