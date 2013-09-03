package lib.elasticsearch

import play.api.Logger

import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.action.admin.indices.delete.DeleteIndexRequest
import org.elasticsearch.common.settings.{ImmutableSettings, Settings}
import org.elasticsearch.common.transport.InetSocketTransportAddress
import org.elasticsearch.client.Client
import org.elasticsearch.client.transport.TransportClient

import lib.Config
import lib.conversions._

object ElasticSearch {

  private val imagesIndex = "images"

  val settings: Settings =
    ImmutableSettings.settingsBuilder
      .put("cluster.name", Config("es.cluster"))
      .put("client.transport.sniff", true)
      .build

  val client: Client =
    new TransportClient(settings)
      .addTransportAddress(new InetSocketTransportAddress(Config("es.host"), Config.int("es.port")))

  def ensureIndexExists() {
    Logger.info("Checking index exists...")
    val indexExists = client.admin.indices.prepareExists(imagesIndex).execute.actionGet.isExists
    if (! indexExists) createIndex()
  }

  def createIndex() {
    Logger.info(s"Creating index on $imagesIndex")
    client.admin.indices
      .prepareCreate(imagesIndex)
      .addMapping("image", Mappings.imageMapping)
      .execute.actionGet
  }

  def deleteIndex() {
    Logger.info(s"Deleting index $imagesIndex")
    client.admin.indices.delete(new DeleteIndexRequest("images")).actionGet
  }

  def prepareImagesSearch: SearchRequestBuilder = client.prepareSearch(imagesIndex)
}
