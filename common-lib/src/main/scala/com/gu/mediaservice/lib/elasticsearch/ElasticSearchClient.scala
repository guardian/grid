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

  protected val imagesIndexSuffix = "images"
  protected val imagesAlias = "imagesAlias"
  protected val imageType = "image"

  val initialImagesIndex = "images"

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
    Logger.info("Checking index exists…")
    val indexExists = client.admin.cluster
      .prepareState.execute
      .actionGet.getState
      .getMetaData.getAliases.containsKey(imagesAlias)

    if (! indexExists) createIndex()
  }

  def ensureAliasExists() {
    Logger.info("Checking alias exists…")
    val aliasExists = client.admin.indices.prepareAliasesExist(imagesAlias).execute.actionGet.isExists
    if (! aliasExists) createAlias()
  }

  def createAlias(index: String = initialImagesIndex) = {
    Logger.info(s"Creating alias $imagesAlias on $index")
    client.admin.indices
      .prepareAliases
      .addAlias(index, imagesAlias)
      .execute.actionGet
  }

  def deleteAlias(index: String) = {
    Logger.info(s"Deleting alias $imagesAlias on $index")
    client.admin.indices
      .prepareAliases
      .removeAlias(index, imagesAlias)
      .execute.actionGet
  }

  def createIndex(index: String = initialImagesIndex) {
    Logger.info(s"Creating index on $index")
    client.admin.indices
      .prepareCreate(index)
      .addMapping(imageType, Mappings.imageMapping)
      .execute.actionGet
  }

  def deleteIndex() {
    Logger.info(s"Deleting index $initialImagesIndex")
    client.admin.indices.delete(new DeleteIndexRequest(initialImagesIndex)).actionGet
  }

}
