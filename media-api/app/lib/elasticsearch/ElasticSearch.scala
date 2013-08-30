package lib.elasticsearch

import play.api.Logger

import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.common.settings.{ImmutableSettings, Settings}
import org.elasticsearch.common.transport.InetSocketTransportAddress
import org.elasticsearch.client.Client
import org.elasticsearch.client.transport.TransportClient

import lib.conversions._
import lib.Config


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

  def prepareImagesSearch: SearchRequestBuilder = client.prepareSearch(imagesIndex)
}
