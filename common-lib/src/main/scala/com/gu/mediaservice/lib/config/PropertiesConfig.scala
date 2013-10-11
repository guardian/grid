package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.config


class PropertiesConfig(appName: String) {

  val properties: Map[String, String] =
    config.Properties.fromFile(s"/etc/gu/$appName.properties")

}
