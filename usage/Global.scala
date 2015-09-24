import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import lib.{LogConfig, Config, ContentPollStream}

import controllers.UsageApi

import com.gu.mediaservice.lib.play.RequestLoggingFilter


object Global extends WithFilters(RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  lazy val pollSubscription = ContentPollStream.pollObservable.subscribe(_ => {})

  override def beforeStart(app: Application): Unit = {
    LogConfig.init(Config)
  }

  override def onStart(app: Application) {
    UsageApi.keyStore.scheduleUpdates(Akka.system(app).scheduler)

    pollSubscription
  }

  override def onStop(app: Application) {
    pollSubscription.unsubscribe()
  }
}
