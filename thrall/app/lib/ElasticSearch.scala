package lib

import scala.concurrent.Future
import org.elasticsearch.action.index.IndexResponse
import play.api.libs.json.{Json, JsValue}

import com.gu.mediaservice.lib.elasticsearch.ElasticSearch
import com.gu.mediaservice.syntax._
import play.api.Logger


object ElasticSearch extends ElasticSearch {

  val host = Config.elasticsearchHost
  val port = Config.int("es.port")
  val cluster = Config("es.cluster")

  def indexImage(id: String, image: JsValue): Future[IndexResponse] = {
    Logger.info(s"Indexing image, id = $id")
    client.prepareIndex(imagesIndex, imageType, id)
      .setSource(Json.stringify(image))
      .execute.asScala
  }

}
