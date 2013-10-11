package lib.elasticsearch

import scala.concurrent.{ExecutionContext, Future}

import play.api.libs.json.JsValue
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.index.query.QueryBuilders._

import com.gu.mediaservice.syntax._
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import lib.Config
import org.elasticsearch.search.sort.SortOrder


object ElasticSearch extends ElasticSearchClient {

  lazy val host = Config.elasticsearchHost
  lazy val port = Config.int("es.port")
  lazy val cluster = Config("es.cluster")

  type Id = String

  def getImageById(id: Id)(implicit ex: ExecutionContext): Future[Option[JsValue]] =
    client.prepareGet(imagesIndex, imageType, id).execute.asScala map (_.sourceOpt)

  def search(q: Option[Id])(implicit ex: ExecutionContext): Future[Seq[(Id, JsValue)]] = {
    val query = q filter (_.nonEmpty) map (matchQuery("metadata.description", _)) getOrElse matchAllQuery
    val search = prepareImagesSearch.setQuery(query)
    for (res <- search.executeAndLog("Image search query"))
    yield res.getHits.hits.toList flatMap (h => h.sourceOpt map (h.id -> _))
  }

  private def prepareImagesSearch: SearchRequestBuilder =
    client.prepareSearch(imagesIndex).setTypes(imageType).addSort("upload-time", SortOrder.DESC)

}
