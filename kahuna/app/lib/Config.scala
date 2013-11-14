package lib

import com.gu.mediaservice.lib.config.{Properties, CommonPlayAppConfig}

object Config extends CommonPlayAppConfig {

  val properties = Properties.fromFile("/etc/gu/kahuna.properties")

  val mediaApiUri: String = properties("mediaapi.uri")

}
