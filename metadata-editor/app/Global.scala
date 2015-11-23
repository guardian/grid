import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import com.gu.mediaservice.lib.play.RequestLoggingFilter

import lib.{LogConfig, Config}
import lib.MetadataMessageConsumer
import lib.collections.CollectionsStore
import controllers.Authed


object Global extends WithFilters(CorsFilter, RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  override def beforeStart(app: Application): Unit = {
    LogConfig.init(Config)
    MetadataMessageConsumer.startSchedule()
  }

  override def onStart(app: Application) {
    Authed.keyStore.scheduleUpdates(Akka.system(app).scheduler)
    CollectionsStore.collectionsStore.scheduleUpdates(Akka.system(app).scheduler)
  }

  override def onStop(app: Application): Unit = {
    MetadataMessageConsumer.actorSystem.shutdown()
  }
}

