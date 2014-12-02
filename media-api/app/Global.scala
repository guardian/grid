
import controllers.MediaApi
import lib.elasticsearch.ElasticSearch
import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters
import play.filters.gzip.GzipFilter


object Global extends WithFilters(CorsFilter, new GzipFilter) with GlobalSettings {

  override def beforeStart(app: Application) {
    ElasticSearch.ensureAliasAssigned()
  }

  override def onStart(app: Application) {
    MediaApi.keyStore.scheduleUpdates(Akka.system(app).scheduler)
  }

}
