package com.gu.mediaservice.lib.elasticsearch6

import com.sksamuel.elastic4s.http.ElasticDsl._
import com.sksamuel.elastic4s.http.index.CreateIndexResponse
import com.sksamuel.elastic4s.http.index.admin.IndexExistsResponse
import com.sksamuel.elastic4s.http.{ElasticClient, ElasticProperties, Response}
import play.api.Logger

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

trait ElasticSearchClient {

  private val tenSeconds = Duration(10, SECONDS)

  def host: String

  def port: Int

  def cluster: String

  def imagesAlias: String

  protected val imagesIndexPrefix = "images"
  protected val imageType = "image"

  val initialImagesIndex = "images"

  lazy val client = {
    Logger.info("Connecting to Elastic 6: " + host + " / " + port)
    ElasticClient(ElasticProperties("http://" + host + ":" + port)) // TODO don't like this string config
  }

  def ensureAliasAssigned() {
    Logger.info(s"Checking alias $imagesAlias is assigned to index…")
    if (getCurrentAlias.isEmpty) {
      ensureIndexExists(initialImagesIndex)
      assignAliasTo(initialImagesIndex)
      waitUntilHealthy()
    }
  }

  def waitUntilHealthy(): Unit = {
    // TODO reinstate
  }

  def ensureIndexExists(index: String): Unit = {
    Logger.info("Checking index exists…")

    val eventualIndexExistsResponse: Future[Response[IndexExistsResponse]] = client.execute {
      indexExists(index)
    }

    val indexExistsResponse = Await.result(eventualIndexExistsResponse, tenSeconds)

    Logger.info("Got index exists result: " + indexExistsResponse.result)
    Logger.info("Index exists: " + indexExistsResponse.result.exists)
    if (!indexExistsResponse.result.exists) {
      createImageIndex(index) // TODO await
    }
  }

  def createImageIndex(index: String): Unit = {
    Logger.info(s"Creating image index $index")

    val eventualCreateIndexResponse: Future[Response[CreateIndexResponse]] = client.execute {
      createIndex(index).
        mappings(Mappings.imageMapping).
        analysis(IndexSettings.analysis)
    }

    val createIndexResponse = Await.result(eventualCreateIndexResponse, tenSeconds)

    Logger.info("Got index create result: " + createIndexResponse)
    if (createIndexResponse.isError) {
      Logger.error(createIndexResponse.error.reason)
    }
  }

  def deleteIndex(index: String) {
    ???
  }

  def getCurrentAlias: Option[String] = {
    ensureIndexExists(initialImagesIndex)
    None // TODO
  }

  // TODO do not understand why this step is required; can't you just index to the alias and let elastic sort it out?
  def getCurrentIndices: List[String] = {
    ???
  }

  def assignAliasTo(index: String): Unit = {
    Logger.info(s"Assigning alias $imagesAlias to $index")
    val aliasActionResponse = Await.result(client.execute {
      aliases(
        addAlias(imagesAlias, index)
      )
    }, tenSeconds)
    Logger.info("Got alias action response: " + aliasActionResponse)
  }

  def removeAliasFrom(index: String) = {
    ???
  }

}