package controllers

import org.apache.pekko.actor.Scheduler
import com.gu.mediaservice.lib.{DateTimeUtils, ImageIngestOperations}
import com.gu.mediaservice.lib.auth.Permissions.DeleteImage
import com.gu.mediaservice.lib.auth.{Authentication, Authorisation, BaseControllerWithLoginRedirects}
import com.gu.mediaservice.lib.config.{InstanceForRequest, Services}
import com.gu.mediaservice.lib.elasticsearch.ReapableEligibility
import com.gu.mediaservice.lib.logging.{GridLogging, MarkerMap}
import com.gu.mediaservice.lib.metadata.SoftDeletedMetadataTable
import com.gu.mediaservice.model.{ImageStatusRecord, Instance, SoftDeletedMetadata}
import instances.Instances
import lib.{BatchDeletionIds, ThrallConfig, ThrallMetrics, ThrallStore}
import lib.elasticsearch.ElasticSearch
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json.{JsValue, Json}
import play.api.libs.ws.WSClient
import play.api.mvc.{Action, AnyContent, ControllerComponents}

import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters._
import scala.language.postfixOps
import scala.util.control.NonFatal
import scala.util.{Failure, Success}

class ReaperController(
  es: ElasticSearch,
  store: ThrallStore,
  authorisation: Authorisation,
  val config: ThrallConfig,
  scheduler: Scheduler,
  maybeCustomReapableEligibility: Option[ReapableEligibility],
  softDeletedMetadataTable: SoftDeletedMetadataTable,
  metrics: ThrallMetrics,
  override val auth: Authentication,
  override val services: Services,
  override val controllerComponents: ControllerComponents,
  val wsClient: WSClient
)(implicit val ec: ExecutionContext) extends BaseControllerWithLoginRedirects with GridLogging with InstanceForRequest with Instances {

  private val INTERVAL = config.reaperInterval //default 15 minutes, based on max of 1000 per reap, this interval will max out at 96,000 images per day
  private val isPaused = config.reaperPaused

  implicit val logMarker: MarkerMap = MarkerMap()

  private val isReapable = maybeCustomReapableEligibility getOrElse {
    new ReapableEligibility {
      override val maybePersistOnlyTheseCollections: Option[Set[String]] = config.maybePersistOnlyTheseCollections
      override val persistenceIdentifier: String = config.persistenceIdentifier
    }
  }

  config.maybeReaperCountPerRun match {
    case Some(countOfImagesToReap) =>
      scheduler.scheduleAtFixedRate(
        initialDelay = DateTimeUtils.timeUntilNextInterval(INTERVAL), // so we always start on multiples of the interval past the hour
        interval = INTERVAL,
      ) { () =>
        try {
          getInstances().map { instances =>
            instances.foreach { instance =>
              implicit val i: Instance = instance
              if (isPaused) {
                logger.info("Reaper is paused")
                es.countTotalSoftReapable(isReapable).map(metrics.softReapable.increment(Nil, _))
                es.countTotalHardReapable(isReapable, config.hardReapImagesAge).map(metrics.hardReapable.increment(Nil, _))
              } else {
                val deletedBy = "reaper"
                logger.info(s"Reaper running for instance: ${instance.id}")
                Future.sequence(Seq(
                  doBatchSoftReap(countOfImagesToReap, deletedBy, instance),
                  doBatchHardReap(countOfImagesToReap, deletedBy, instance)
                )).onComplete {
                  case Success(_) => logger.info("Reap completed")
                  case Failure(e) => logger.error("Reap failed", e)
                }
              }
            }
          }
        } catch {
          case NonFatal(e) => logger.error("Reap failed", e)
        }
      }
    case _ => logger.info("scheduled reaper will not run because 'reaper.countPerRun' needs to be configured in thrall.conf")
  }

  private def batchDeleteWrapper(count: Int)(func: (Int, String, Instance) => Future[JsValue]) = auth.async { request =>
    val instance = instanceOf(request)
    if (!authorisation.hasPermissionTo(DeleteImage)(request.user)) {
      Future.successful(Forbidden)
    }
    else if (count > 1000) {
      Future.successful(BadRequest("Too many IDs. Maximum 1000."))
    }
    else {
      func(
        count,
        request.user.accessor.identity,
        instance
      ).map(Ok(_))
    }
  }

  private def s3DirNameFromDate(date: DateTime) = date.toString("YYYY-MM-dd")

  private def persistedBatchDeleteOperation(deleteType: String)(doBatchDelete: => Future[JsValue]) = {
    doBatchDelete.map { json =>
      config.maybeReaperBucket match {
        case None => {
          logger.info("Reaper bucket not configured; not persisting results: " + json.toString())
          json
        }
        case Some(reaperBucket) =>
          val now = DateTime.now(DateTimeZone.UTC)
          val key = s"$deleteType/${s3DirNameFromDate(now)}/$deleteType-${now.toString()}.json"
          store.client.putObject(reaperBucket, key, json.toString())
          json
        }
      }
  }

  def doBatchSoftReap(count: Int): Action[AnyContent] = batchDeleteWrapper(count)(doBatchSoftReap)

  def doBatchSoftReap(count: Int, deletedBy: String, instance: Instance): Future[JsValue] = persistedBatchDeleteOperation("soft"){
    implicit val i: Instance = instance
    es.countTotalSoftReapable(isReapable).map(metrics.softReapable.increment(Nil, _))

    logger.info(s"Soft deleting next $count images...")

    val deleteTime = DateTime.now(DateTimeZone.UTC)

    (for {
      BatchDeletionIds(esIds, esIdsActuallySoftDeleted) <- es.softDeleteNextBatchOfImages(isReapable, count, SoftDeletedMetadata(deleteTime, deletedBy))
      _ <- softDeletedMetadataTable.setStatuses(esIdsActuallySoftDeleted.map(
        ImageStatusRecord(
          _,
          deletedBy,
          deleteTime = deleteTime.toString,
          isDeleted = true,
          instance = instance.id
        )
      ))
    } yield {
      metrics.softReaped.increment(n = esIdsActuallySoftDeleted.size)
      esIds.map { id =>
        val wasSoftDeletedInES = esIdsActuallySoftDeleted.contains(id)
        val detail = Map(
          "ES" -> wasSoftDeletedInES,
        )
        logger.info(s"Soft deleted image $id : $detail")
        id -> detail
      }.toMap
    }).map(Json.toJson(_))
  }



  def doBatchHardReap(count: Int): Action[AnyContent] = batchDeleteWrapper(count)(doBatchHardReap)

  def doBatchHardReap(count: Int, deletedBy: String, instance: Instance): Future[JsValue] = persistedBatchDeleteOperation("hard"){
    implicit val i: Instance = instance
    es.countTotalHardReapable(isReapable, config.hardReapImagesAge).map(metrics.hardReapable.increment(Nil, _))

    logger.info(s"Hard deleting next $count images...")

    (for {
      BatchDeletionIds(esIds, esIdsActuallyDeleted) <- es.hardDeleteNextBatchOfImages(isReapable, count, config.hardReapImagesAge)
      mainImagesS3Deletions <- store.deleteOriginals(esIdsActuallyDeleted)
      thumbsS3Deletions <- store.deleteThumbnails(esIdsActuallyDeleted)
      pngsS3Deletions <- store.deletePNGs(esIdsActuallyDeleted)
      _ <- softDeletedMetadataTable.clearStatuses(esIdsActuallyDeleted)
      // TODO No one has issued an image-deleted notification to metadata-editor? Metadata will persist forever?
    } yield {
      metrics.hardReaped.increment(n = esIdsActuallyDeleted.size)
      esIds.map { id =>
        val wasHardDeletedFromES = esIdsActuallyDeleted.contains(id)
        val detail = Map(
          "ES" -> Some(wasHardDeletedFromES),
          "mainImage" -> mainImagesS3Deletions.get(ImageIngestOperations.fileKeyFromId(id)),
          "thumb" -> thumbsS3Deletions.get(ImageIngestOperations.fileKeyFromId(id)),
          "optimisedPng" -> pngsS3Deletions.get(ImageIngestOperations.optimisedPngKeyFromId(id)),
        )
        logger.info(s"Hard deleted image $id : $detail")
        id -> detail
      }.toMap
    }).map(Json.toJson(_))
  }
  def index = withLoginRedirect {
    val now = DateTime.now(DateTimeZone.UTC)
    (config.maybeReaperBucket, config.maybeReaperCountPerRun) match {
    case (None, _) => NotImplemented("'s3.reaper.bucket' not configured in thrall.conf")
    case (_, None) => NotImplemented("'reaper.countPerRun' not configured in thrall.conf")
    case (Some(reaperBucket), Some(countOfImagesToReap)) =>
      val recentRecords = List(now, now.minusDays(1), now.minusDays(2)).flatMap { day =>
        val s3DirName = s3DirNameFromDate(day)
        store.client.listObjects(reaperBucket, s"soft/$s3DirName/").getObjectSummaries.asScala.toList ++
          store.client.listObjects(reaperBucket, s"hard/$s3DirName/").getObjectSummaries.asScala.toList
      }

      val recentRecordKeys = recentRecords
        .filter(_.getLastModified after now.minusHours(48).toDate)
        .sortBy(_.getLastModified)
        .reverse
        .map(_.getKey)

      Ok(views.html.reaper(isPaused, INTERVAL.toString(), countOfImagesToReap, recentRecordKeys))
  }}

  def reaperRecord(key: String) = auth { config.maybeReaperBucket match {
    case None => NotImplemented("Reaper bucket not configured")
    case Some(reaperBucket) =>
      Ok(
        store.client.getObjectAsString(reaperBucket, key)
      ).as(JSON)
  }}

}
