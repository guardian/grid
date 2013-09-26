package lib

import scala.concurrent.Future
import org.elasticsearch.action.index.IndexResponse
import play.api.libs.json.JsValue

import com.gu.mediaservice.lib.elasticsearch.ElasticSearch
import com.gu.mediaservice.syntax._
import lib.Config


object ElasticSearch extends ElasticSearch {

  val host = Config.elasticsearchHost
  val port = Config.int("es.port")
  val cluster = Config("es.cluster")

  def indexImage(id: String, image: JsValue): Future[IndexResponse] =
    client.prepareIndex(imagesIndex, imageType, id).setSource(image).execute.asScala

}
