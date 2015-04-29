package com.gu.mediaservice.lib.config

trait CommonPlayAppProperties {

  val properties: Map[String, String]

  // Note: had to make these lazy to avoid init order problems ;_;

  lazy val ssl: Boolean = properties.get("ssl").map(_.toBoolean).getOrElse(true)
  lazy val domainRoot: String = properties("domain.root")

  lazy val services = new Services(domainRoot, ssl)

}
