import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import com.gu.mediaservice.lib.play.RequestLoggingFilter

import controllers.UsageApi
import lib._

object Global extends WithFilters(CorsFilter, RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  lazy val previewSubscription = UsageRecorder.subscribeToPreview
  lazy val liveSubscription = UsageRecorder.subscribeToLive

  override def beforeStart(app: Application): Unit = {
    LogConfig.init(Config)
  }

  override def onStart(app: Application) {
    val crierReader = new CrierStreamReader()

    crierReader.start()

    UsageApi.keyStore.scheduleUpdates(Akka.system(app).scheduler)

    // Eval subscription to start stream
//    previewSubscription
    liveSubscription
  }

  override def onStop(app: Application) {
//    previewSubscription.unsubscribe
    liveSubscription.unsubscribe
  }
}
