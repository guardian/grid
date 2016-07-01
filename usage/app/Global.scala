import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import com.gu.mediaservice.lib.play.RequestLoggingFilter

import controllers.UsageApi
import lib._

object Global extends WithFilters(CorsFilter, RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  lazy val liveSubscription = UsageRecorder.subscribeToLive
  lazy val previewSubscription = UsageRecorder.subscribeToPreview

  override def beforeStart(app: Application): Unit = {
    LogConfig.init(Config)
  }

  override def onStart(app: Application) {
    val crierReader = new CrierStreamReader()

    crierReader.start()

    UsageApi.keyStore.scheduleUpdates(Akka.system(app).scheduler)

    // Eval subscriptions to start stream
    liveSubscription
    previewSubscription
  }

  override def onStop(app: Application) {
    liveSubscription.unsubscribe
    previewSubscription.unsubscribe
  }
}
