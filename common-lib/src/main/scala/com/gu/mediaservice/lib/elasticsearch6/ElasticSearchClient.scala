package com.gu.mediaservice.lib.elasticsearch6

import com.sksamuel.elastic4s.HealthStatus
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
  private val thirtySeconds = Duration(30, SECONDS)

  def url: String

  def cluster: String

  def imagesAlias: String

  protected val imagesIndexPrefix = "images"
  protected val imageType = "image"

  val initialImagesIndex = "images"

  def shards: Int
  def replicas: Int

  lazy val client = {
    Logger.info("Connecting to Elastic 6: " + url)
    ElasticClient(ElasticProperties(url))
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
    Logger.info("waiting for cluster health to be green")
    val clusterHealthResponse = Await.result(client.execute(clusterHealth().waitForStatus(HealthStatus.Green).timeout("25s")), thirtySeconds)
    Logger.info("await cluster health response: " + clusterHealthResponse)
    if (clusterHealthResponse.isError) {
      throw new RuntimeException("cluster health could not be confirmed as green")  // TODO Exception isn't great but our callers aren't looking at our return value
    }
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
      createImageIndex(index)
    }
  }

  def createImageIndex(index: String): Unit = {
    Logger.info(s"Creating image index '$index' with $shards shards and $replicas replicas")

    val eventualCreateIndexResponse: Future[Response[CreateIndexResponse]] = client.execute {
      // File metadata indexing creates a potentially unbounded number of dynamic files; Elastic 1 had no limit.
      // Elastic 6 limits it over index disk usage concerns.
      // When this limit is hit, no new images with previously unseen fields can be indexed.
      // https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping.html
      // Do we really need to store all raw metadata in the index; only taking a bounded subset would greatly reduce the size of the index and
      // remove the risk of field exhaustion bug striking in productions
      val maximumFieldsOverride = Map("mapping.total_fields.limit" -> Integer.MAX_VALUE)

      // Deep pagination. It's fairly easy to scroll the grid past the default Elastic 6 pagination limit.
      // Elastic start talking about why this is problematic in the 2.x docs and by 6 it's been defaulted to 10k.
      // https://www.elastic.co/guide/en/elasticsearch/guide/current/pagination.html
      // Override to 100,000 to preserve the existing behaviour without comprising the Elastic cluster.
      // The grid UI should consider scrolling by datetime offsets if possible.
      val maximumPaginationOverride = Map("max_result_window" -> 25000)

      val nonRecommendenedIndexSettingOverrides = maximumFieldsOverride ++ maximumPaginationOverride
      Logger.warn("Applying non recommended index setting overrides; please consider altering the application " +
        "to remove the need for these: " + nonRecommendenedIndexSettingOverrides)

      createIndex(index).
        mappings(Mappings.imageMapping).
        analysis(IndexSettings.analysis).
        settings(nonRecommendenedIndexSettingOverrides).
        shards(shards).replicas(replicas)
    }

    val createIndexResponse = Await.result(eventualCreateIndexResponse, tenSeconds)

    Logger.info("Got index create result: " + createIndexResponse)
    if (createIndexResponse.isError) {
      Logger.error(createIndexResponse.error.reason)
    }
  }

  def getCurrentAlias: Option[String] = {
    ensureIndexExists(initialImagesIndex)
    None // TODO
  }

  // Elastic only allows one index in an alias set to be the write index.
  // To mirror index updates to all indexes in the alias group, the grid queries the alias set and explicitly executes
  // each update on every aliased index.
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

  def changeAliasTo(newIndex: String, oldIndex: String, alias: String = imagesAlias): Unit = {
    Logger.info(s"Assigning alias $alias to $newIndex")
    val aliasActionResponse = Await.result(client.execute {
      aliases(
        removeAlias(alias, oldIndex),
        addAlias(alias, newIndex)
      )
    }, tenSeconds)
    Logger.info("Got alias action response: " + aliasActionResponse)
  }

  def removeAliasFrom(index: String) = {
    ???
  }

}