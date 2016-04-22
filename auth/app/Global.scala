import scala.collection.JavaConverters._
import com.typesafe.config.ConfigValue

import play.api.libs.concurrent.Akka
import play.api.{Logger, Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import controllers.{Authed}

import lib.Config

import com.gu.mediaservice.lib.play.RequestLoggingFilter


object Global extends WithFilters(CorsFilter, RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  override def beforeStart(app: Application) {

    val allAppConfig: Seq[(String, ConfigValue)] =
      Config.appConfig.underlying.entrySet.asScala.toSeq.map(entry => (entry.getKey, entry.getValue))

    Logger.info("Play app config: \n" + allAppConfig.mkString("\n"))
  }

  override def onStart(app: Application) {
    Authed.keyStore.scheduleUpdates(Akka.system(app).scheduler)
    Authed.permissionStore.scheduleUpdates(Akka.system(app).scheduler)
  }
}
