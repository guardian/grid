package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.{ElasticSearchClient, MigrationAlreadyRunningError, MigrationStatusProvider, NotRunning}
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.sksamuel.elastic4s.ElasticApi.{existsQuery, matchQuery, not}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.requests.searches.SearchHit
import lib.{FailedMigrationDetails, FailedMigrationSummary}
import play.api.libs.json.{JsError, JsSuccess, Json, Reads, __}

import scala.concurrent.{ExecutionContext, Future}
import scala.concurrent.duration.DurationInt


final case class ScrolledSearchResults(hits: List[SearchHit], scrollId: Option[String])
final case class EsInfoContainer(esInfo: EsInfo)

trait ThrallMigrationClient extends MigrationStatusProvider {
  self: ElasticSearchClient =>

  private val scrollKeepAlive = 30.minutes

  def startScrollingImageIdsToMigrate(migrationIndexName: String)(implicit ex: ExecutionContext, logMarker: LogMarker = MarkerMap()) = {
    // TODO create constant for field name "esInfo.migration.migratedTo"
    val query = search(imagesCurrentAlias).version(true).scroll(scrollKeepAlive).size(100) query not(
      matchQuery("esInfo.migration.migratedTo", migrationIndexName),
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

  def getMigrationFailures(
    currentIndexName: String, migrationIndexName: String, maxReturn: Int
  )(implicit ec: ExecutionContext, logMarker: LogMarker = MarkerMap()): Future[FailedMigrationSummary] = {
    val search = ElasticDsl.search(currentIndexName).size(maxReturn) query must(
      existsQuery(s"esInfo.migration.failures.$migrationIndexName"),
      not(matchQuery("esInfo.migration.migratedTo", migrationIndexName))
    )
    executeAndLog(search, s"retrieving list of migration failures")
      .map { resp =>
        logger.info(logMarker, s"failed migrations - got ${resp.result.hits.size} hits")
        val failedMigrationDetails: Seq[FailedMigrationDetails] = resp.result.hits.hits.map { hit =>
            logger.info(logMarker, s"failed migrations - got hit $hit.id")
            val source = hit.sourceAsString
            val cause = Json.parse(source).validate(Json.reads[EsInfoContainer]) match {
              case JsSuccess(EsInfoContainer(EsInfo(Some(Left(migrationFailure)))), _) =>
                migrationFailure.failures.getOrElse(migrationIndexName, "UNKNOWN - NO FAILURE MATCHING MIGRATION INDEX NAME")
              case JsError(errors) =>
                logger.error(logMarker, s"Could not parse EsInfo for ${hit.id} - $errors")
                "Could not extract migration info from ES due to parsing failure"
              case _ => "UNKNOWN - NO FAILURE MATCHING MIGRATION INDEX NAME"
            }
            FailedMigrationDetails(imageId = hit.id, cause = cause)
        }

        FailedMigrationSummary(
          totalFailed = resp.result.hits.total.value,
          totalFailedRelation = resp.result.hits.total.relation,
          returned = resp.result.hits.hits.length,
          details = failedMigrationDetails
        )
      }
  }
}
