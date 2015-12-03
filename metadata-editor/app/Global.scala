import lib.{ControllerHelper, MetadataMessageConsumer, LogConfig, Config}
import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import com.gu.mediaservice.lib.play.RequestLoggingFilter


object Global extends WithFilters(CorsFilter, RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  override def beforeStart(app: Application): Unit = {
    LogConfig.init(Config)
    MetadataMessageConsumer.startSchedule()
  }

  override def onStart(app: Application) {
    ControllerHelper.keyStore.scheduleUpdates(Akka.system(app).scheduler)
  }

  override def onStop(app: Application): Unit = {
    MetadataMessageConsumer.actorSystem.shutdown()
  }
}

