import lib.{LogConfig, Config}
import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter
import com.gu.mediaservice.lib.auth.KeyStore

import com.gu.mediaservice.lib.play.RequestLoggingFilter


object Global extends WithFilters(CorsFilter, RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  import lib.Config._

  lazy val keyStore = new KeyStore(keyStoreBucket, awsCredentials)

  override def beforeStart(app: Application): Unit = {
    LogConfig.init(Config)
  }

  override def onStart(app: Application) {
    keyStore.scheduleUpdates(Akka.system(app).scheduler)
  }
}

