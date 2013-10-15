package lib.elasticsearch

import scala.concurrent.{ExecutionContext, Future}

import play.api.libs.json.JsValue
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.index.query.QueryBuilders._
import org.elasticsearch.search.sort.SortOrder
import scalaz.syntax.std.function1._, scalaz.syntax.id._

import com.gu.mediaservice.syntax._
import com.gu.mediaservice.lib.elasticsearch.ElasticSearchClient
import lib.Config


object ElasticSearch extends ElasticSearchClient {

  lazy val host = Config.elasticsearchHost
  lazy val port = Config.int("es.port")
  lazy val cluster = Config("es.cluster")

  type Id = String

  def getImageById(id: Id)(implicit ex: ExecutionContext): Future[Option[JsValue]] =
    client.prepareGet(imagesIndex, imageType, id).execute.asScala map (_.sourceOpt)

  def search(q: Option[Id], orderBy: Option[String])(implicit ex: ExecutionContext): Future[Seq[(Id, JsValue)]] = {
    val query = q filter (_.nonEmpty) map (matchQuery("metadata.description", _)) getOrElse matchAllQuery
    val search = prepareImagesSearch.setQuery(query) |> sorts.addFromRequest(orderBy)
    for (res <- search.executeAndLog("Image search query"))
    yield res.getHits.hits.toList flatMap (h => h.sourceOpt map (h.id -> _))
  }

  def prepareImagesSearch: SearchRequestBuilder =
    client.prepareSearch(imagesIndex).setTypes(imageType)

  object sorts {

    def addFromRequest(sortBy: Option[String])(builder: SearchRequestBuilder): SearchRequestBuilder = {
      val sorts = sortBy.fold(Seq("upload-time" -> SortOrder.DESC))(parseSorts)
      for ((field, order) <- sorts) builder.addSort(field, order)
      builder
    }

    type Field = String

    val DescField = "-(.+)".r

    def parseSorts(sortBy: String): Seq[(Field, SortOrder)] =
      sortBy.split(',').toList.map {
        case DescField(field) => (field, SortOrder.DESC)
        case field            => (field, SortOrder.ASC)
      }

  }

}
