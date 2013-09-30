package lib.elasticsearch

import scala.concurrent.{ExecutionContext, Future}

import play.api.libs.json.JsValue
import org.elasticsearch.action.index.IndexResponse
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.index.query.QueryBuilders._
import scalaz.syntax.id._

import com.gu.mediaservice.syntax._
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import lib.Config
import model.Image

object ElasticSearch extends ElasticSearchClient {

  val host = Config.elasticsearchHost
  val port = Config.int("es.port")
  val cluster = Config("es.cluster")

  def indexImage(image: Image): Future[IndexResponse] =
    client.prepareIndex(imagesIndex, imageType, image.id)
      .setSource(image.asJson)
      .execute.asScala

  def getImageById(id: String)(implicit ex: ExecutionContext): Future[Option[JsValue]] =
    client.prepareGet(imagesIndex, imageType, id).execute.asScala map (_.sourceOpt)

  def search(q: Option[String])(implicit ex: ExecutionContext): Future[Seq[JsValue]] = {
    val query = q filter (_.nonEmpty) map (matchQuery("metadata.description", _)) getOrElse matchAllQuery
    for (res <- prepareImagesSearch.unsafeTap(_ setQuery query).executeAndLog("Image search query"))
    yield res.getHits.hits.toList flatMap (_.sourceOpt)
  }

  private def prepareImagesSearch: SearchRequestBuilder =
    client.prepareSearch(imagesIndex).setTypes(imageType)

}
