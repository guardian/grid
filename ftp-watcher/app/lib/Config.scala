package lib

import java.util.concurrent.atomic.AtomicBoolean
import com.gu.mediaservice.lib.config.Properties


object Config {

  val properties = Properties.fromFile("/etc/gu/ftp-watcher.properties")

  val ftpHost: String = properties("ftp.host")
  val ftpPort: Int = properties.get("ftp.port").fold(21)(_.toInt)
  val ftpUser: String = properties("ftp.user")
  val ftpPassword: String = properties("ftp.password")
  val ftpPaths: List[String] = List("getty", "reuters")

  val imageLoaderUri: String = properties("loader.uri")

  val passive: AtomicBoolean =
    new AtomicBoolean(sys.props.get("active").forall(! _.toBoolean))

  def status: String = if (isActive) "active" else "passive"

  def isActive: Boolean = ! passive.get

}
