package com.gu.typesafe.config.impl;

import com.gu.typesafe.config.ConfigValue;
import com.gu.typesafe.config.ConfigMergeable;

interface MergeableValue extends ConfigMergeable {
    // converts a Config to its root object and a ConfigValue to itself
    ConfigValue toFallbackValue();
}
