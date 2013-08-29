package lib.elasticsearch

import scala.concurrent.Future
import play.api.libs.concurrent.Execution.Implicits._
import play.api.Logger

import org.elasticsearch.action.search.SearchRequestBuilder
import org.elasticsearch.common.settings.{ImmutableSettings, Settings}
import org.elasticsearch.common.transport.InetSocketTransportAddress
import org.elasticsearch.client.Client
import org.elasticsearch.client.transport.TransportClient

import lib.conversions._


object ElasticSearch {

  private val log = Logger(getClass)

  val esCluster = "media-api"
  val esHost = "localhost"
  val esPort = 9300

  val imagesIndex = "images"

  val settings: Settings =
    ImmutableSettings.settingsBuilder
      .put("cluster.name", esCluster)
      .put("client.transport.sniff", true)
      .build

  val client: Client =
    new TransportClient(settings)
      .addTransportAddress(new InetSocketTransportAddress(esHost, esPort))

  def ensureIndexExists() {
    val indexExists = client.admin.indices.prepareExists(imagesIndex).execute.actionGet.isExists
    if (! indexExists) createIndex()
    else log.info("Oh, the index already seems to exist.")
  }

  def createIndex() {
    log.info(s"Creating index on $imagesIndex")
    client.admin.indices
      .prepareCreate(imagesIndex)
      .addMapping("image", Mappings.imageMapping)
      .execute.actionGet
  }

  def prepareImagesSearch: SearchRequestBuilder = client.prepareSearch("images")
}
