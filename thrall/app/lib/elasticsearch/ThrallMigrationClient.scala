package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{CompletionPreview, ElasticSearchClient, InProgress, MigrationAlreadyRunningError, MigrationNotRunningError, MigrationStatus, MigrationStatusProvider, NotRunning, Paused, Running}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.Image
import com.sksamuel.elastic4s.ElasticApi.{existsQuery, matchQuery, not}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl.{addAlias, aliases, removeAlias, _}
import com.sksamuel.elastic4s.requests.searches.SearchHit
import com.sksamuel.elastic4s.requests.searches.aggs.responses.bucket.Terms
import com.sksamuel.elastic4s.requests.searches.aggs.responses.metrics.TopHits
import com.sksamuel.elastic4s.requests.searches.queries.Query
import lib.{FailedMigrationDetails, FailedMigrationSummary, FailedMigrationsGrouping, FailedMigrationsOverview}
import play.api.libs.json.{JsObject, Json}

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.DurationInt
import scala.util.{Failure, Success}


final case class ScrolledSearchResults(hits: List[SearchHit], scrollId: Option[String])

trait ThrallMigrationClient extends MigrationStatusProvider {
  self: ElasticSearchClient =>

  private val scrollKeepAlive = 5.minutes

  def startScrollingImageIdsToMigrate(migrationIndexName: String, isReapableQuery: Query)(implicit ex: ExecutionContext, logMarker: LogMarker = MarkerMap()) = {
    // TODO create constant for field name "esInfo.migration.migratedTo"
    val query = search(imagesCurrentAlias).version(true).scroll(scrollKeepAlive).size(100) query not(
      matchQuery("esInfo.migration.migratedTo", migrationIndexName),
      isReapableQuery,
      existsQuery(s"esInfo.migration.failures.$migrationIndexName")
    )
    executeAndLog(query, "retrieving next batch of image ids to migrate").map { response =>
      ScrolledSearchResults(response.result.hits.hits.toList, response.result.scrollId)
    }
  }
  def continueScrollingImageIdsToMigrate(scrollId: String)(implicit ex: ExecutionContext, logMarker: LogMarker = MarkerMap()) = {
    val query = searchScroll(scrollId).keepAlive(scrollKeepAlive)
    executeAndLog(query, "retrieving next batch of image ids to migrate, continuation of scroll").map { response =>
      ScrolledSearchResults(response.result.hits.hits.toList, response.result.scrollId)
    }
  }
  def closeScroll(scrollId: String)(implicit ex: ExecutionContext, logMarker: LogMarker = MarkerMap()) = {
    val close = clearScroll(scrollId)
    executeAndLog(close, s"Closing unwanted scroll").failed.foreach { e =>
      logger.error(logMarker, "ES closeScroll request failed", e)
    }
  }

  private def adjustMigrationAlias(action: String)(handleIfApplicable: PartialFunction[MigrationStatus, Unit]): Unit = {
    handleIfApplicable.applyOrElse(
      refreshAndRetrieveMigrationStatus(),
      (currentStatus: MigrationStatus) => {
        logger.error(s"Could not $action migration when migration status is $currentStatus")
        throw new MigrationNotRunningError
      }
    )
  }

  def pauseMigration(): Unit = adjustMigrationAlias("pause") {
    case InProgress(migrationIndexName) =>
      assignAliasTo(migrationIndexName, MigrationStatusProvider.PAUSED_ALIAS)
  }
  def resumeMigration(): Unit = adjustMigrationAlias("resume") {
    case Paused(migrationIndexName) =>
      removeAliasFrom(migrationIndexName, MigrationStatusProvider.PAUSED_ALIAS)
  }

  def previewMigrationCompletion(): Unit = adjustMigrationAlias("preview complete") {
    case running: Running =>
      assignAliasTo(running.migrationIndexName, MigrationStatusProvider.COMPLETION_PREVIEW_ALIAS)
  }
  def unPreviewMigrationCompletion(): Unit = adjustMigrationAlias("unpreview complete") {
    case CompletionPreview(migrationIndexName) =>
      removeAliasFrom(migrationIndexName, MigrationStatusProvider.COMPLETION_PREVIEW_ALIAS)
  }

  def startMigration(newIndexName: String)(implicit logMarker: LogMarker): Unit = {
    val currentStatus = refreshAndRetrieveMigrationStatus()
    if (currentStatus != NotRunning) {
      logger.error(logMarker, s"Could not start migration to $newIndexName when migration status is $currentStatus")
      throw new MigrationAlreadyRunningError
    }
    for {
      _ <- createImageIndex(newIndexName)
      _ = logger.info(logMarker, s"Created index $newIndexName")
      _ <- assignAliasTo(newIndexName, imagesMigrationAlias)
      _ = logger.info(logMarker, s"Assigned migration index $imagesMigrationAlias to $newIndexName")
      _ = refreshAndRetrieveMigrationStatus()
    } yield ()
  }

  def completeMigration(logMarker: LogMarker)(implicit ec: ExecutionContext): Future[Unit] = {
    val currentStatus = refreshAndRetrieveMigrationStatus()
    currentStatus match {
      case completionPreview: CompletionPreview => for {
          currentIndex <- getIndexForAlias(imagesCurrentAlias)
          currentIndexName <- currentIndex.map(_.name).map(Future.successful).getOrElse(Future.failed(new Exception(s"No index found for '$imagesCurrentAlias' alias")))
          _ <- client.execute { aliases (
            removeAlias(imagesMigrationAlias, completionPreview.migrationIndexName),
            removeAlias(imagesCurrentAlias, currentIndexName),
            addAlias(imagesCurrentAlias, completionPreview.migrationIndexName),
            addAlias(imagesHistoricalAlias, currentIndexName)
          )}.transform {
            case Success(response) if response.result.success =>
              Success(())
            case Success(response) if response.isError =>
              Failure(new Exception("Failed to complete migration (alias switching failed)", response.error.asException))
            case _ =>
              Failure(new Exception("Failed to complete migration (alias switching failed)"))
          }
          _ = logger.info(logMarker, s"Completed Migration (by switching & removing aliases)")
          _ = refreshAndRetrieveMigrationStatus()
      } yield ()
      case _ =>
        logger.error(logMarker, s"Cannot complete migration when migration status is $currentStatus, migration must be in 'CompletionPreview' state")
        throw new MigrationNotRunningError
    }
  }

  def getMigrationFailuresOverview(
    currentIndexName: String, migrationIndexName: String
  )(implicit ec: ExecutionContext, logMarker: LogMarker = MarkerMap()): Future[FailedMigrationsOverview] = {

    val examplesSubAggregation = topHitsAgg("examples")
      .fetchSource(false)
      .size(3)

    val aggregateOnFailureMessage =
      termsAgg("failures", s"esInfo.migration.failures.$migrationIndexName.keyword")
        .size(1000)
        .subAggregations(examplesSubAggregation)

    val aggSearch = ElasticDsl.search(currentIndexName).trackTotalHits(true) query must(
      existsQuery(s"esInfo.migration.failures.$migrationIndexName"),
      not(matchQuery("esInfo.migration.migratedTo", migrationIndexName))
    ) aggregations aggregateOnFailureMessage

    executeAndLog(aggSearch, s"retrieving grouped overview of migration failures").map { response =>
      FailedMigrationsOverview(
        totalFailed = response.result.hits.total.value,
        grouped = response.result.aggregations.result[Terms](aggregateOnFailureMessage.name).buckets.map { bucket  =>
          FailedMigrationsGrouping(
            message = bucket.key,
            count = bucket.docCount,
            exampleIDs = bucket.result[TopHits](examplesSubAggregation.name).hits.map(_.id)
          )
        }
      )
    }
  }

  def getMigrationFailures(
    currentIndexName: String, migrationIndexName: String, from: Int, pageSize: Int, filter: String
  )(implicit ec: ExecutionContext, logMarker: LogMarker = MarkerMap()): Future[FailedMigrationSummary] = {
    val search = ElasticDsl.search(currentIndexName).trackTotalHits(true).version(true).from(from).size(pageSize) query must(
      existsQuery(s"esInfo.migration.failures.$migrationIndexName"),
      termQuery(s"esInfo.migration.failures.$migrationIndexName.keyword", filter),
      not(matchQuery("esInfo.migration.migratedTo", migrationIndexName))
    ) sortByFieldDesc "lastModified"
    executeAndLog(search, s"retrieving list of migration failures")
      .map { resp =>
        val failedMigrationDetails: Seq[FailedMigrationDetails] = resp.result.hits.hits.map { hit =>

          val sourceJson = Json.parse(hit.sourceAsString)

          FailedMigrationDetails(
            imageId = hit.id,
            lastModified = (sourceJson \ "lastModified").asOpt[String].getOrElse("-"),
            crops = (sourceJson \ "exports").asOpt[List[JsObject]].map(_.size.toString).getOrElse("-"),
            usages = (sourceJson \ "usages").asOpt[List[JsObject]].map(_.size.toString).getOrElse("-"),
            uploadedBy = (sourceJson \ "uploadedBy").asOpt[String].getOrElse("-"),
            uploadTime = (sourceJson \ "uploadTime").asOpt[String].getOrElse("-"),
            sourceJson = Json.prettyPrint(sourceJson),
            esDocAsImageValidationFailures = sourceJson.validate[Image].fold(failure => Some(failure.toString()), _ => None),
            version = hit.version
          )
        }

        FailedMigrationSummary(
          totalFailed = resp.result.hits.total.value,
          details = failedMigrationDetails
        )
      }
  }
}
