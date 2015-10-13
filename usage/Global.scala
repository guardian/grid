import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import com.gu.mediaservice.lib.play.RequestLoggingFilter

import controllers.UsageApi
import lib._

object Global extends WithFilters(RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  override def beforeStart(app: Application): Unit = {
    LogConfig.init(Config)
  }

  override def onStart(app: Application) {
    UsageApi.keyStore.scheduleUpdates(Akka.system(app).scheduler)
    UsageRecorder.subscribe
  }

  override def onStop(app: Application) {
    UsageRecorder.unsubscribe
  }
}
