package com.gu.mediaservice.lib.elasticsearch

import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s._
import com.sksamuel.elastic4s.http.JavaClient
import com.sksamuel.elastic4s.requests.common.HealthStatus
import com.sksamuel.elastic4s.requests.indexes.CreateIndexResponse
import com.sksamuel.elastic4s.requests.indexes.admin.IndexExistsResponse

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration._
import scala.concurrent.{Await, Future}

case class ElasticSearchImageCounts(
  catCount: Long,
  searchResponseCount: Long,
  indexStatsCount: Long,
  uploadedInLastFiveMinutes: Long
)

trait ElasticSearchClient extends ElasticSearchExecutions with GridLogging {

  private val tenSeconds = Duration(10, SECONDS)
  private val thirtySeconds = Duration(30, SECONDS)

  def url: String

  protected val imagesIndexPrefix = "images"
  protected val imageType = "image"

  def shards: Int
  def replicas: Int

  lazy val client = {
    logger.info("Connecting to Elastic 8: " + url)
    val client = JavaClient(ElasticProperties(url))
    ElasticClient(client)
  }

  //TODO: this function should fail and cause healthcheck fails
  def ensureIndexExistsAndAliasAssigned(alias: String, index: String): Unit = {
    logger.info(s"Checking alias $alias is assigned to index $index")
    val indexForCurrentAlias = Await.result(getIndexForAlias(alias), tenSeconds)
    if (indexForCurrentAlias.isEmpty) {
      createIndexIfMissing(index)
      assignAliasTo(index, alias)
      waitUntilHealthy()
    }
  }

  def waitUntilHealthy(): Unit = {
    logger.info("waiting for cluster health to be green")
    val clusterHealthResponse = Await.result(client.execute(clusterHealth().waitForStatus(HealthStatus.Green).timeout("25s")), thirtySeconds)
    logger.info("await cluster health response: " + clusterHealthResponse)
    if (clusterHealthResponse.isError) {
      throw new RuntimeException("cluster health could not be confirmed as green")  // TODO Exception isn't great but our callers aren't looking at our return value
    }
  }

  def healthCheck(): Future[Boolean] = {
      Future.successful(true) // TODO reimplement
  }

  case class IndexWithAliases(name: String, aliases: Seq[String])
  def getIndexForAlias(alias: String)(implicit logMarker: LogMarker = MarkerMap()): Future[Option[IndexWithAliases]] = {
    executeAndLog(getAliases(alias, Nil), s"Looking up index for alias '$alias'").map(_.result.mappings.headOption.map{
      case (index, aliases) => IndexWithAliases(
        name = index.name,
        aliases = aliases.map(_.name),
      )
    })
  }

  def countImages(indexName: String): Future[ElasticSearchImageCounts] = {
    implicit val logMarker: MarkerMap = MarkerMap()
    val queryCatCount = catCount(indexName) // document count only of index including live documents, not deleted documents which have not yet been removed by the merge process
    val queryImageSearch = search(indexName) trackTotalHits true limit 0 // hits that match the query defined in the request
    val uploadedInLastFiveMinutes = count(indexName) query rangeQuery("uploadTime").gte("now-5m")
    val queryStats = indexStats(indexName) // total accumulated values of an index for both primary and replica shards
    val indexForAlias = getIndexForAlias(indexName)

    for {
      catCount <- executeAndLog(queryCatCount, "Images cat count")
      imageSearch <- executeAndLog(queryImageSearch, "Images search")
      stats <- executeAndLog(queryStats, "Stats aggregation")
      uploadedInLastFiveMinutes <- executeAndLog(uploadedInLastFiveMinutes, "Count uploaded in last five minutes")
      maybeRealIndexName <- indexForAlias
    } yield {
      // indexName may also be an alias; do a lookup for the real name if it exists
      val realIndexName = maybeRealIndexName.map(_.name).getOrElse(indexName)
      ElasticSearchImageCounts(
        catCount = catCount.result.count,
        searchResponseCount = imageSearch.result.hits.total.value,
        indexStatsCount = stats.result.indices(realIndexName).total.docs.count,
        uploadedInLastFiveMinutes = uploadedInLastFiveMinutes.result.count
      )
    }
  }

  def createIndexIfMissing(index: String): Unit = {
    logger.info("Checking index exists…")

    val eventualIndexExistsResponse: Future[Response[IndexExistsResponse]] = client.execute {
      indexExists(index)
    }

    val indexExistsResponse = Await.result(eventualIndexExistsResponse, tenSeconds)

    logger.info("Got index exists result: " + indexExistsResponse.result)
    logger.info("Index exists: " + indexExistsResponse.result.exists)
    if (!indexExistsResponse.result.exists) {
      createImageIndex(index)
    }
  }

  def createImageIndex(index: String): Either[ElasticError, Boolean] = {
    logger.info(s"Creating image index '$index' with $shards shards and $replicas replicas")

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
      // Override to 25,000 to preserve the existing behaviour without comprising the Elastic cluster.
      // The grid UI should consider scrolling by datetime offsets if possible.
      val maximumPaginationOverride = Map("max_result_window" -> 101000)

      val nonRecommendenedIndexSettingOverrides = maximumFieldsOverride ++ maximumPaginationOverride
      logger.warn("Applying non recommended index setting overrides; please consider altering the application " +
        "to remove the need for these: " + nonRecommendenedIndexSettingOverrides)

      createIndex(index).
        mapping(Mappings.imageMapping).
        analysis(IndexSettings.analysis).
        settings(nonRecommendenedIndexSettingOverrides).
        shards(shards).
        replicas(replicas)
    }

    val createIndexResponse = Await.result(eventualCreateIndexResponse, tenSeconds)

    logger.info("Got index create result: " + createIndexResponse)
    if (createIndexResponse.isError) {
      logger.error(createIndexResponse.error.reason)
      Left(createIndexResponse.error)
    }
    else {
      Right(createIndexResponse.result.acknowledged)
    }
  }

  def assignAliasTo(index: String, alias: String): Either[ElasticError, Boolean] = {
    logger.info(s"Assigning alias $alias to $index")
    val aliasActionResponse = Await.result(client.execute {
      aliases(
        addAlias(alias, index)
      )
    }, tenSeconds)
    logger.info("Got alias action response: " + aliasActionResponse)
    if(aliasActionResponse.isError){
      Left(aliasActionResponse.error)
    }
    else {
      Right(aliasActionResponse.result.success)
    }
  }

  def changeAliasTo(newIndex: String, oldIndex: String, alias: String): Unit = {
    logger.info(s"Assigning alias $alias to $newIndex")
    val aliasActionResponse = Await.result(client.execute {
      aliases(
        removeAlias(alias, oldIndex),
        addAlias(alias, newIndex)
      )
    }, tenSeconds)
    logger.info("Got alias action response: " + aliasActionResponse)
  }

  def removeAliasFrom(index: String, alias: String) = {
    logger.info(s"Removing alias $alias from $index")
    val removeAliasResponse = Await.result(client.execute {
      aliases(
        removeAlias(alias, index),
      )
    }, tenSeconds)
    logger.info("Got alias remove response: " + removeAliasResponse)
  }

}
