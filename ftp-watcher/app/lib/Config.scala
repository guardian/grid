package lib

import com.gu.mediaservice.lib.config.PropertiesConfig


object Config extends PropertiesConfig("ftp-watcher") {

  val ftpHost: String = properties("ftp.host")
  val ftpPort: Int = properties.get("ftp.port").fold(21)(_.toInt)
  val ftpUser: String = properties("ftp.user")
  val ftpPassword: String = properties("ftp.password")
  val ftpPaths: List[String] = List("getty", "reuters")

  val imageLoaderUri: String = properties("loader.uri")

}
