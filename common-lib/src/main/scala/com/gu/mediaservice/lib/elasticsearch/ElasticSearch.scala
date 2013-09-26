package com.gu.mediaservice.lib.elasticsearch

import org.elasticsearch.action.admin.indices.delete.DeleteIndexRequest
import org.elasticsearch.client.Client
import org.elasticsearch.client.transport.TransportClient
import org.elasticsearch.common.settings.{ImmutableSettings, Settings}
import org.elasticsearch.common.transport.InetSocketTransportAddress
import play.api.Logger


trait ElasticSearch {

  def host: String
  def port: Int
  def cluster: String

  protected val imagesIndex = "images"
  protected val imageType = "image"

  private lazy val settings: Settings =
    ImmutableSettings.settingsBuilder
      .put("cluster.name", cluster)
      .put("client.transport.sniff", true)
      .build

  lazy val client: Client =
    new TransportClient(settings)
      .addTransportAddress(new InetSocketTransportAddress(host, port))

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

}
