/**
 *   Copyright (C) 2011-2012 Typesafe Inc. <http://typesafe.com>
 */
package com.gu.typesafe.config.impl;

import com.gu.typesafe.config.ConfigIncluder;
import com.gu.typesafe.config.ConfigIncluderFile;
import com.gu.typesafe.config.ConfigIncluderURL;
import com.gu.typesafe.config.ConfigIncluderClasspath;

interface FullIncluder extends ConfigIncluder, ConfigIncluderFile, ConfigIncluderURL,
            ConfigIncluderClasspath {

}
