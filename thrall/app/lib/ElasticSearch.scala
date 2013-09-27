package lib

import scala.concurrent.{ExecutionContext, Future}
import org.elasticsearch.action.index.IndexResponse
import play.api.libs.json.{Json, JsValue}

import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import com.gu.mediaservice.syntax._


object ElasticSearch extends ElasticSearchClient {

  val host = Config.elasticsearchHost
  val port = Config.int("es.port")
  val cluster = Config("es.cluster")

  def indexImage(id: String, image: JsValue)(implicit ex: ExecutionContext): Future[IndexResponse] =
    client.prepareIndex(imagesIndex, imageType, id)
      .setSource(Json.stringify(image))
      .executeAndLog(s"Indexing image $id")

}
