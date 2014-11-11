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

  protected val imagesIndexPrefix = "images"
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

  def ensureAliasAssigned() {
    Logger.info(s"Checking alias $imagesAlias is assigned to index…")

    if (getCurrentAlias.isEmpty) {
      ensureIndexExists(initialImagesIndex)
      assignAliasTo(initialImagesIndex)
    }
  }

  def ensureIndexExists(index: String) {
    Logger.info("Checking index exists…")
    val indexExists = client.admin.indices.prepareExists(index)
                        .execute.actionGet.isExists

    if (! indexExists) createIndex(index)
  }

  def createIndex(index: String) {
    Logger.info(s"Creating index $index")
    client.admin.indices
      .prepareCreate(index)
      .addMapping(imageType, Mappings.imageMapping)
      .execute.actionGet
  }

  def deleteIndex() {
    Logger.info(s"Deleting index $initialImagesIndex")
    client.admin.indices.delete(new DeleteIndexRequest(initialImagesIndex)).actionGet
  }

  def getCurrentAlias: Option[String] = {
    // getAliases returns null, so wrap it in an Option
    Option(client.admin.cluster
      .prepareState.execute
      .actionGet.getState
      .getMetaData.getAliases.get(imagesAlias))
      .map(_.keys.toArray.head.toString)
  }

  def assignAliasTo(index: String) = {
    Logger.info(s"Assigning alias $imagesAlias to $index")
    client.admin.indices
      .prepareAliases
      .addAlias(index, imagesAlias)
      .execute.actionGet
  }

  def removeAliasFrom(index: String) = {
    Logger.info(s"Removing alias $imagesAlias from $index")
    client.admin.indices
      .prepareAliases
      .removeAlias(index, imagesAlias)
      .execute.actionGet
  }

}
