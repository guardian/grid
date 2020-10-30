/**
 *   Copyright (C) 2014 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import com.gu.typesafe.config.ConfigValue;

/**
 * An AbstractConfigValue which contains other values. Java has no way to
 * express "this has to be an AbstractConfigValue also" other than making
 * AbstractConfigValue an interface which would be aggravating. But we can say
 * we are a ConfigValue.
 */
interface Container extends ConfigValue {
    /**
     * Replace a child of this value. CAUTION if replacement is null, delete the
     * child, which may also delete the parent, or make the parent into a
     * non-container.
     */
    com.gu.typesafe.config.impl.AbstractConfigValue replaceChild(com.gu.typesafe.config.impl.AbstractConfigValue child, com.gu.typesafe.config.impl.AbstractConfigValue replacement);

    /**
     * Super-expensive full traversal to see if descendant is anywhere
     * underneath this container.
     */
    boolean hasDescendant(com.gu.typesafe.config.impl.AbstractConfigValue descendant);
}
