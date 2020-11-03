/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import java.util.Collection;

/**
 * Status of substitution resolution.
 */
enum ResolveStatus {
    UNRESOLVED, RESOLVED;

    final static ResolveStatus fromValues(
            Collection<? extends com.gu.typesafe.config.impl.AbstractConfigValue> values) {
        for (com.gu.typesafe.config.impl.AbstractConfigValue v : values) {
            if (v.resolveStatus() == ResolveStatus.UNRESOLVED)
                return ResolveStatus.UNRESOLVED;
        }
        return ResolveStatus.RESOLVED;
    }

    final static ResolveStatus fromBoolean(boolean resolved) {
        return resolved ? ResolveStatus.RESOLVED : ResolveStatus.UNRESOLVED;
    }
}
