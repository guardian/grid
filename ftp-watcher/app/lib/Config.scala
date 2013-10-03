package lib

import com.gu.mediaservice.lib.config


object Config {

  private val properties: Map[String, String] =
    config.Properties.fromFile("/etc/gu/ftp-watcher.properties")

  val ftpHost: String = properties("ftp.host")
  val ftpPort: Int = properties.get("ftp.port").fold(21)(_.toInt)
  val ftpUser: String = properties("ftp.user")
  val ftpPassword: String = properties("ftp.password")
  val ftpPaths: List[String] = List("getty", "reuters")

}
