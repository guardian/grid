package com.gu.mediaservice.lib.elasticsearch

import org.elasticsearch.action.admin.indices.delete.DeleteIndexRequest
import org.elasticsearch.client.Client
import org.elasticsearch.client.transport.TransportClient
import org.elasticsearch.common.settings.{ImmutableSettings, Settings}
import org.elasticsearch.common.transport.InetSocketTransportAddress

import play.api.Logger


trait ElasticSearchClient {

  def host: String
  def port: Int
  def cluster: String

  private val imagesIndex = "images"
  protected val imagesAlias = "imagesAlias"
  protected val imageType = "image"

  private lazy val settings: Settings =
    ImmutableSettings.settingsBuilder
      .put("cluster.name", cluster)
      .put("client.transport.sniff", true)
      .build

  lazy val client: Client =
    new TransportClient(settings)
      .addTransportAddress(new InetSocketTransportAddress(host, port))

  def ensureIndexAndAliasExists() {
    ensureIndexExists()
    ensureAliasExists()
  }

  def ensureIndexExists() {
    Logger.info("Checking index exists...")
    val indexExists = client.admin.indices.prepareExists(imagesIndex).execute.actionGet.isExists
    if (! indexExists) createIndex()
  }

  def ensureAliasExists() {
    Logger.info("Checking alias exists...")
    val aliasExists = client.admin.indices.prepareAliasesExist(imagesAlias).execute.actionGet.isExists
    if (! aliasExists) createAlias()
  }

  def createAlias() = {
    Logger.info(s"Creating alias $imagesAlias on $imagesIndex")
    client.admin.indices
      .prepareAliases
      .addAlias(imagesIndex, imagesAlias)
      .execute.actionGet
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
    client.admin.indices.delete(new DeleteIndexRequest(imagesIndex)).actionGet
  }

}
