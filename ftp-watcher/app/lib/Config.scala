package lib

import java.util.concurrent.atomic.AtomicBoolean
import com.gu.mediaservice.lib.config.Properties


object Config {

  val properties: Map[String, String] =
    Properties.fromPath("/etc/gu/ftp-watcher.properties") ++ sys.props

  val ftpHost: String = properties("ftp.host")
  val ftpPort: Int = properties.get("ftp.port").fold(21)(_.toInt)
  val ftpUser: String = properties("ftp.user")
  val ftpPassword: String = properties("ftp.password")
  val ftpPaths: List[String] = List("getty", "reuters", "ap", "pa", "aapimages")

  val imageLoaderUri: String = properties("loader.uri")

  val active: AtomicBoolean =
    new AtomicBoolean(properties.get("ftp.active").exists(_.toBoolean))

  def status: String = if (isActive) "active" else "passive"

  def isActive: Boolean = active.get

}
