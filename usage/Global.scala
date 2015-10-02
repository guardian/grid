import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import lib._

import controllers.UsageApi

import com.gu.mediaservice.lib.play.RequestLoggingFilter


object Global extends WithFilters(RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  // TODO: We shouldn't need to lazy val this ideally
  lazy val usageRecorder = UsageRecorder.observable.subscribe(println(_))

  override def beforeStart(app: Application): Unit = {
    LogConfig.init(Config)
  }

  override def onStart(app: Application) {
    UsageApi.keyStore.scheduleUpdates(Akka.system(app).scheduler)

    usageRecorder
  }

  override def onStop(app: Application) {
    usageRecorder.unsubscribe()
  }
}
