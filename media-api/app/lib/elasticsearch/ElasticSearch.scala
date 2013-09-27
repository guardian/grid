package lib.elasticsearch

import scala.concurrent.{ExecutionContext, Future}
import play.api.libs.json.JsValue
import org.elasticsearch.action.index.IndexResponse
import org.elasticsearch.action.search.SearchRequestBuilder

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
    client.prepareGet(imagesIndex, imageType, id).execute.asScala map { result =>
      if (result.isExists) Some(result.sourceAsJson) else None
    }

  def prepareImagesSearch: SearchRequestBuilder = client.prepareSearch(imagesIndex)

}
