package lib

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig}

object Config extends CommonPlayAppConfig {

  val properties = Properties.fromPath("/etc/gu/kahuna.properties")

  val domainRoot: String = string("domain.root")

  val mediaApiUri: String =
    properties.getOrElse("mediaapi.uri", s"https://api.$domainRoot")

}
