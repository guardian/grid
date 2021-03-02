package com.gu.mediaservice

import java.util.concurrent.TimeUnit

import com.amazonaws.services.dynamodbv2.document._
import com.amazonaws.services.dynamodbv2.document.spec.{QuerySpec, ScanSpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.gu.mediaservice.indexing.IndexInputCreation._
import com.gu.mediaservice.indexing.ProduceProgress
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import com.gu.mediaservice.model.Image
import com.typesafe.scalalogging.LazyLogging
import net.logstash.logback.marker.Markers
import play.api.libs.json.{JsObject, Json}
import play.api.libs.ws.WSClient

import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.{Failure, Success, Try}
import scala.collection.JavaConverters._

case class BatchIndexHandlerConfig(
                                    apiKey: String,
                                    projectionEndpoint: String,
                                    imagesEndpoint: String,
                                    batchIndexBucket: String,
                                    kinesisStreamName: String,
                                    dynamoTableName: String,
                                    batchSize: Int,
                                    kinesisEndpoint: Option[String] = None,
                                    kinesisMaximumMetric: Option[(String, Integer)] = None,
                                    maxIdleConnections: Int,
                                    stage: Option[String],
                                    threshold: Option[Integer],
                                    startState: ProduceProgress,
                                    checkerStartState: ProduceProgress,
                                    maxSize: Int,
                                    domainRoot: String
                                  )

case class SuccessResult(foundImagesCount: Int, notFoundImagesCount: Int, progressHistory: String, projectionTookInSec: Long)

class BatchIndexHandler(cfg: BatchIndexHandlerConfig)(implicit wsClient: WSClient) extends LoggingWithMarkers {

  import cfg._

  private val ProjectionTimeoutInSec = 740
  private val OthersTimeoutInSec = 90
  // lambda max timeout is 15 minuets
  // we need some time to be able to do reset if timeout happen before lambda max timeout will come to place
  private val TimeNeededToResetIfTimeoutInSec = 60
  private val MainProcessingTimeoutInSec = (ProjectionTimeoutInSec + OthersTimeoutInSec) - TimeNeededToResetIfTimeoutInSec

  private val GetIdsTimeout = new FiniteDuration(20, TimeUnit.SECONDS)
  private val GlobalTimeout = new FiniteDuration(MainProcessingTimeoutInSec, TimeUnit.SECONDS)
  private val ImagesProjectionTimeout = new FiniteDuration(ProjectionTimeoutInSec, TimeUnit.SECONDS)
  val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)
  private val gridClient = GridClient(services)

  private val ImagesBatchProjector = new ImagesBatchProjection(apiKey, ImagesProjectionTimeout, gridClient, maxSize, projectionEndpoint)
  ImagesBatchProjector.assertApiKeyIsValid          // fail as fast as possible if the api key is duff

  private val InputIdsStore = new InputIdsStore(AwsHelpers.buildDynamoTableClient(dynamoTableName), batchSize)

  import ImagesBatchProjector._
  import InputIdsStore._

  private implicit val ec: ExecutionContext = scala.concurrent.ExecutionContext.Implicits.global

  def checkImages(): Unit = {
    val stateProgress = scala.collection.mutable.ArrayBuffer[ProduceProgress]()
    stateProgress += NotStarted
    val mediaIdsFuture = getMediaIdsBatchByState(checkerStartState)
    val mediaIds = Await.result(mediaIdsFuture, GetIdsTimeout)
    logger.info(s"got ${mediaIds.size}, completed mediaIds, $mediaIds")
    Try {
      val processImagesFuture: Future[SuccessResult] = Future {
        stateProgress += updateStateToItemsLocating(mediaIds)
        logger.info(s"Indexing ${mediaIds.length} media ids. Getting images from: $imagesEndpoint")
        val start = System.currentTimeMillis()
        val result = getImages(mediaIds, imagesEndpoint, InputIdsStore)



        logger.info(s"foundImagesIds: ${result.found}")
        logger.info(s"notFoundImagesIds: ${result.notFound}")
        logger.info(s"failedImageIds: ${result.failed}")

        val end = System.currentTimeMillis()
        val imageExistenceCheckTookInSecs = (end - start) / 1000
        logger.info(s"Images received in $imageExistenceCheckTookInSecs seconds. Found ${result.found.size} images, could not find ${result.notFound.size} images, ${result.failed} failed")

        //Mark failed images as "finished" because we couldn't double check them
        updateStateToFinished(result.failed)

        //Mark not found images as not found
        updateStateToInconsistent(result.notFound)

        //Mark found as found
        updateStateToFound(result.found)


        SuccessResult(result.found.size, result.notFound.size, stateProgress.map(_.name).mkString(","), imageExistenceCheckTookInSecs)
      }
      Await.result(processImagesFuture, GlobalTimeout)
    } match {
      case Success(res) =>
        logSuccessResult(res)
      case Failure(exp) =>
        exp.printStackTrace()
        val resetIdsCount = mediaIds.size
        stateProgress += updateStateToFinished(mediaIds)
        logFailure(exp, resetIdsCount, stateProgress.toList)
        // propagating exception
        throw exp
    }
  }

  def processImages(): Unit = {

    if (AwsHelpers.checkKinesisIsNiceAndFast(stage, threshold))
      processImagesOnlyIfKinesisIsNiceAndFast()
    else
      logger.info("Kinesis is too busy; leaving it for now")
  }

  def processImagesOnlyIfKinesisIsNiceAndFast(): Unit = {
    val stateProgress = scala.collection.mutable.ArrayBuffer[ProduceProgress]()
    stateProgress += NotStarted
    val mediaIdsFuture = getUnprocessedMediaIdsBatch(startState)
    val mediaIds = Await.result(mediaIdsFuture, GetIdsTimeout)
    logger.info(s"got ${mediaIds.size}, unprocessed mediaIds, $mediaIds")
    Try {
      val processImagesFuture: Future[SuccessResult] = Future {
        stateProgress += updateStateToItemsInProgress(mediaIds)
        logger.info(s"Indexing ${mediaIds.length} media ids. Getting image projections from: $projectionEndpoint")
        val start = System.currentTimeMillis()
        // left is found images
        val maybeBlobsFuture: List[Either[Image, String]] = getImagesProjection(mediaIds, projectionEndpoint, InputIdsStore)

        val (foundImages, notFoundImagesIds) = partitionToSuccessAndNotFound(maybeBlobsFuture)
        val foundImagesIds = foundImages.map(_.id)
        logger.info(s"foundImagesIds: $foundImagesIds")
        logger.info(s"notFoundImagesIds: $notFoundImagesIds")
        val end = System.currentTimeMillis()
        val projectionTookInSec = (end - start) / 1000
        logger.info(s"Projections received in $projectionTookInSec seconds. Found ${foundImages.size} images, could not find ${notFoundImagesIds.size} images")

        if (foundImages.nonEmpty) {
          val kinesisClient = AwsHelpers.buildKinesisClient(kinesisEndpoint)
          foundImages.foreach { image =>
            val message = UpdateMessage(
              subject = "reingest-image",
              image = Some(image)
            )
            AwsHelpers.putToKinesis(message, kinesisStreamName, kinesisClient)
          }
          stateProgress += updateStateToFinished(foundImages.map(_.id))
        } else {
          logger.info("all was empty terminating current batch")
          stateProgress += NotFound
        }
        SuccessResult(foundImages.size, notFoundImagesIds.size, stateProgress.map(_.name).mkString(","), projectionTookInSec)
      }
      Await.result(processImagesFuture, GlobalTimeout)
    } match {
      case Success(res) =>
        logSuccessResult(res)
      case Failure(exp) =>
        exp.printStackTrace()
        val resetIdsCount = mediaIds.size
        stateProgress += resetItemsState(mediaIds)
        logFailure(exp, resetIdsCount, stateProgress.toList)
        // propagating exception
        throw exp
    }
  }

  private def partitionToSuccessAndNotFound(maybeBlobsFuture: List[Either[Image, String]]): (List[Image], List[String]) = {
    val images: List[Image] = maybeBlobsFuture.flatMap(_.left.toOption)
    val notFoundIds: List[String] = maybeBlobsFuture.flatMap(_.right.toOption)
    (images, notFoundIds)
  }

}

object InputIdsStore {
  val PKField: String = "id"
  val StateField: String = "progress_state"

  def getAllMediaIdsWithinProgressQuery(progress: ProduceProgress) = {
    new QuerySpec()
      .withKeyConditionExpression(s"$StateField = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", progress.stateId))
  }
}

class InputIdsStore(table: Table, batchSize: Int) extends LazyLogging {

  import InputIdsStore._

  def getUnprocessedMediaIdsBatch(unprocessedState: ProduceProgress)(implicit ec: ExecutionContext): Future[List[String]] = Future {
    logger.info("attempt to get mediaIds batch from dynamo")
    val valueMap = new ValueMap()
      .withNumber(":sub", unprocessedState.stateId)

    val querySpec = new QuerySpec()
      .withKeyConditionExpression(s"$StateField = :sub")
      .withValueMap(valueMap)
      .withMaxResultSize(batchSize)
    val mediaIds = table.getIndex(StateField).query(querySpec).asScala.toList.map(it => {
      val json = Json.parse(it.toJSON).as[JsObject]
      (json \ PKField).as[String]
    })
    mediaIds
  }

  def getProcessedMediaIdsBatch(implicit ec: ExecutionContext): Future[List[String]] = Future {
    logger.info(s"attempt to get mediaIds batch from dynamo: ${table.getTableName}")
    val scanSpec = new ScanSpec()
      .withFilterExpression(s"$StateField in (:finished, :not_found, :in_progress)")
      .withValueMap(new ValueMap()
        .withNumber(":finished", Enqueued.stateId)
        .withNumber(":not_found", NotFound.stateId)
        .withNumber(":in_progress", InProgress.stateId)
      )
      .withMaxResultSize(batchSize)
    val mediaIds = table.scan(scanSpec).asScala.toList.map(it => {
      val json = Json.parse(it.toJSON).as[JsObject]
      (json \ PKField).as[String]
    })
    mediaIds
  }

  def getMediaIdsBatchByState(state: ProduceProgress)(implicit ec: ExecutionContext): Future[List[String]] =Future {
    logger.info(s"attempt to get mediaIds batch from dynamo with state ${state.stateId}")
    val querySpec = new QuerySpec()
      .withKeyConditionExpression(s"$StateField = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", state.stateId))
      .withMaxResultSize(batchSize)
    val mediaIds = table.getIndex(StateField).query(querySpec).asScala.toList.map(it => {
      val json = Json.parse(it.toJSON).as[JsObject]
      (json \ PKField).as[String]
    })
    mediaIds
  }
  /**
    * state is used to synchronise multiple overlapping lambda executions, track progress and avoiding repeated operations
    */

  def updateStateToItemsFound(ids: List[String]): ProduceProgress = {
    updateItemsState(ids, Verified)
  }

  def updateStateToInconsistent(ids: List[String]): ProduceProgress = {
    updateItemsState(ids, Inconsistent)
  }

  // used to synchronise situation of other lambda execution will start while previous one is still running
  def updateStateToItemsLocating(ids: List[String]): ProduceProgress = {
    updateItemsState(ids, Locating)
  }

  // used to synchronise situation of other lambda execution will start while previous one is still running
  def updateStateToItemsInProgress(ids: List[String]): ProduceProgress = {
    updateItemsState(ids, InProgress)
  }

  // used to track images that were not projected successfully
  def updateStateToNotFoundImage(notFoundId: String) = {
    updateItemState(notFoundId, NotFound)
  }

  def updateStateToFound(ids: List[String]): ProduceProgress = {
    logger.info(s"updating items state to found")
    updateItemsState(ids, Verified)
  }

  def updateStateToFinished(ids: List[String]): ProduceProgress = {
    updateItemsState(ids, Enqueued)
  }

  // used in situation if something failed
  def resetItemsState(ids: List[String]): ProduceProgress = {
    updateItemsState(ids, Reset)
  }

  // used in situation if something failed
  def resetItemState(id: String): ProduceProgress = {
    updateItemState(id, Reset)
    Reset
  }

  // used in situation if something failed in a expected way and we want to ignore that file in next batch
   def setStateToKnownError(id: String): ProduceProgress = {
    updateItemState(id, KnownError)
    KnownError
  }

  def setStateToUnknownError(id: String): ProduceProgress = {
    updateItemState(id, UnknownError)
    UnknownError
  }

  def setStateToTooBig(id: String, size: Int): ProduceProgress = {
    logger.info(Markers.appendEntries(Map("tooBigSize" -> size).asJava),s"setting item $id to TooBig state (size $size) to ignore it next time")
    updateItemState(id, TooBig)
    TooBig
  }

  private def updateItemState(id: String, progress: ProduceProgress) = {
    logger.info(Markers.appendEntries(Map(
      "progressState" -> progress.stateId,
      "progressName" -> progress.name,
      "imageId" -> id
    ).asJava), "Updating item state")
    val us = new UpdateItemSpec().
      withPrimaryKey(PKField, id).
      withUpdateExpression(s"set $StateField = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", progress.stateId))
    table.updateItem(us)
  }

  private def updateItemsState(ids: List[String], progress: ProduceProgress, imageSize: Option[Int] = None): ProduceProgress = {
    ids.foreach(id => updateItemState(id, progress))
    progress
  }

}
