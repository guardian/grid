
import controllers.MediaApi
import lib.elasticsearch.ElasticSearch
import play.api.libs.concurrent.Akka
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters


object Global extends WithFilters(CorsFilter) with GlobalSettings {

  override def beforeStart(app: Application) {
    ElasticSearch.ensureAliasAssigned()
  }

  override def onStart(app: Application) {
    MediaApi.keyStore.scheduleUpdates(Akka.system(app).scheduler)
  }

}
