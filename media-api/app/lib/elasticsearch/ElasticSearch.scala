package lib.elasticsearch

import scala.concurrent.{ExecutionContext, Future}

import play.api.Logger
import play.api.libs.json.JsValue

import org.elasticsearch.action.admin.indices.delete.DeleteIndexRequest
import org.elasticsearch.action.index.IndexResponse
import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.common.settings.{ImmutableSettings, Settings}
import org.elasticsearch.common.transport.InetSocketTransportAddress
import org.elasticsearch.client.Client
import org.elasticsearch.client.transport.TransportClient

import lib.Config
import lib.syntax._
import model.Image


object ElasticSearch {

  private val imagesIndex = "images"
  private val imageType = "image"

  val settings: Settings =
    ImmutableSettings.settingsBuilder
      .put("cluster.name", Config("es.cluster"))
      .put("client.transport.sniff", true)
      .build

  val client: Client =
    new TransportClient(settings)
      .addTransportAddress(new InetSocketTransportAddress(Config.elasticsearchHost, Config.int("es.port")))

  def ensureIndexExists() {
    Logger.info("Checking index exists...")
    val indexExists = client.admin.indices.prepareExists(imagesIndex).execute.actionGet.isExists
    if (! indexExists) createIndex()
  }

  def createIndex() {
    Logger.info(s"Creating index on $imagesIndex")
    client.admin.indices
      .prepareCreate(imagesIndex)
      .addMapping(imageType, Mappings.imageMapping)
      .execute.actionGet
  }

  def deleteIndex() {
    Logger.info(s"Deleting index $imagesIndex")
    client.admin.indices.delete(new DeleteIndexRequest("images")).actionGet
  }

  def getImageById(id: String)(implicit ex: ExecutionContext): Future[Option[JsValue]] =
    client.prepareGet(imagesIndex, imageType, id).execute.asScala map { result =>
      if (result.isExists) Some(result.sourceAsJson) else None
    }

  def prepareImagesSearch: SearchRequestBuilder = client.prepareSearch(imagesIndex)

  def indexImage(image: Image): Future[IndexResponse] =
    client.prepareIndex(imagesIndex, imageType, image.id)
      .setSource(image.asJson)
      .execute.asScala

}
