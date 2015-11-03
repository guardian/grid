import controllers.{Authed, MediaApi}
import lib.elasticsearch.ElasticSearch
import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter

import lib.{LogConfig, Config}

import com.gu.mediaservice.lib.play.RequestLoggingFilter


object Global extends WithFilters(CorsFilter, RequestLoggingFilter, new GzipFilter) with GlobalSettings {

  override def beforeStart(app: Application) {
    LogConfig.init(Config)

    ElasticSearch.ensureAliasAssigned()
  }

  override def onStart(app: Application) {
    Authed.keyStore.scheduleUpdates(Akka.system(app).scheduler)
    Authed.permissionStore.scheduleUpdates(Akka.system(app).scheduler)
  }

}
