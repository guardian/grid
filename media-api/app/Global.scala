
import controllers.MediaApi
import lib.Config
import lib.elasticsearch.ElasticSearch
import play.api.{Application, GlobalSettings}
import play.api.mvc.WithFilters


object Global extends WithFilters(CorsFilter) with GlobalSettings {

  override def beforeStart(app: Application) {
    ElasticSearch.ensureIndexExists()
    MediaApi.keyStore.update()
  }

}
