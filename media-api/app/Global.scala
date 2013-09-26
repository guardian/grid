
import lib.elasticsearch.ElasticSearch
import play.api.{Application, GlobalSettings}


object Global extends GlobalSettings {

  override def beforeStart(app: Application) {
    ElasticSearch.ensureIndexExists()
  }

}
