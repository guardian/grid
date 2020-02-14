package com.gu.mediaservice

import java.util.concurrent.TimeUnit

import com.amazonaws.services.dynamodbv2.document._
import com.amazonaws.services.dynamodbv2.document.spec.{QuerySpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.gu.mediaservice.indexing.IndexInputCreation._
import com.gu.mediaservice.indexing.ProduceProgress
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.model.Image
import com.typesafe.scalalogging.LazyLogging
import play.api.libs.json.{JsObject, Json}

import scala.collection.JavaConverters._
import scala.concurrent.duration.FiniteDuration
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.{Failure, Success, Try}

case class BatchIndexHandlerConfig(
                                    apiKey: String,
                                    projectionEndpoint: String,
                                    batchIndexBucket: String,
                                    kinesisStreamName: String,
                                    dynamoTableName: String,
                                    batchSize: Int,
                                    kinesisEndpoint: Option[String] = None,
                                    maxIdleConnections: Int
                                  )

case class SuccessResult(foundImagesCount: Int, notFoundImagesCount: Int, progressHistory: String, projectionTookInSec: Long)

class BatchIndexHandler(cfg: BatchIndexHandlerConfig) extends LoggingWithMarkers {

  import cfg._

  private val ProjectionTimoutInMins = 11
  private val GetIdsTimoutInMins = 1
  private val OthersTimoutInMins = 1
  private val MainProcessingTimoutInMins = ProjectionTimoutInMins + OthersTimoutInMins

  private val GetIdsTimeout = new FiniteDuration(GetIdsTimoutInMins, TimeUnit.MINUTES)
  private val GlobalTimeout = new FiniteDuration(MainProcessingTimoutInMins, TimeUnit.MINUTES)
  private val ImagesProjectionTimeout = new FiniteDuration(ProjectionTimoutInMins, TimeUnit.MINUTES)
  private val gridClient = GridClient(maxIdleConnections, debugHttpResponse = false)

  private val ImagesBatchProjector = new ImagesBatchProjection(apiKey, projectionEndpoint, ImagesProjectionTimeout, gridClient)
  private val AwsFunctions = new BatchIndexHandlerAwsFunctions(cfg)
  private val InputIdsStore = new InputIdsStore(AwsFunctions.buildDynamoTableClient, batchSize)

  import AwsFunctions._
  import ImagesBatchProjector._
  import InputIdsStore._

  private implicit val ec: ExecutionContext = scala.concurrent.ExecutionContext.Implicits.global

  def processImages(): Unit = {
    if (!validApiKey(projectionEndpoint)) throw new IllegalStateException("invalid api key")
    val stateProgress = scala.collection.mutable.ArrayBuffer[ProduceProgress]()
    stateProgress += NotStarted
    val mediaIdsFuture = getUnprocessedMediaIdsBatch
    val mediaIds = Await.result(mediaIdsFuture, GetIdsTimeout)
    Try {
      val processImagesFuture: Future[SuccessResult] = Future {
        stateProgress += updateStateToItemsInProgress(mediaIds)
        logger.info(s"Indexing ${mediaIds.length} media ids. Getting image projections from: $projectionEndpoint")
        val start = System.currentTimeMillis()
        val maybeBlobsFuture: List[Either[Image, String]] = getImagesProjection(mediaIds, projectionEndpoint, InputIdsStore)

        val (foundImages, notFoundImagesIds) = partitionToSuccessAndNotFound(maybeBlobsFuture)
        val end = System.currentTimeMillis()
        val projectionTookInSec = (end - start) / 1000
        val message = s"Projections received in $projectionTookInSec seconds. Found ${foundImages.size} images, could not find ${notFoundImagesIds.size} images"
        val jsonMsg = Json.obj(
          "batchSize" -> mediaIds.size,
          "foundImagesCount" -> foundImages.size,
          "notFoundImagesCount" -> notFoundImagesIds.size,
          "projectionTookInSec" -> projectionTookInSec,
          "message" -> message
        )
        logger.info(jsonMsg.toString())

        if (foundImages.nonEmpty) {
          logger.info("attempting to store blob to s3")
          val bulkIndexRequest = putToS3(foundImages)
          val indexMessage = UpdateMessage(
            subject = "batch-index",
            bulkIndexRequest = Some(bulkIndexRequest)
          )
          putToKinesis(indexMessage)
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

class InputIdsStore(table: Table, batchSize: Int) extends LazyLogging {

  private val PKField: String = "id"
  private val StateField: String = "progress_state"

  def getUnprocessedMediaIdsBatch(implicit ec: ExecutionContext): Future[List[String]] = Future {
    logger.info("attempt to get mediaIds batch from dynamo")
    val querySpec = new QuerySpec()
      .withKeyConditionExpression(s"$StateField = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", 0))
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

  // used to synchronise situation of other lambda execution will start while previous one is still running
  def updateStateToItemsInProgress(ids: List[String]): ProduceProgress = {
    logger.info(s"updating items state to in progress")
    updateItemsState(ids, InProgress)
  }

  // used to track images that were not projected successfully
  def updateStateToNotFoundImage(notFoundId: String) =
    updateItemSate(notFoundId, NotFound.stateId)

  def updateStateToFinished(ids: List[String]): ProduceProgress = {
    logger.info(s"updating items state to in progress")
    updateItemsState(ids, Finished)
  }

  // used in situation if something failed
  def resetItemsState(ids: List[String]): ProduceProgress = {
    logger.info("resetting items state")
    updateItemsState(ids, Reset)
  }

  // used in situation if something failed
  def resetItemState(id: String): ProduceProgress = {
    logger.info("resetting items state")
    updateItemSate(id, Reset.stateId)
    Reset
  }

  private def updateItemSate(id: String, state: Int) = {
    val us = new UpdateItemSpec().
      withPrimaryKey(PKField, id).
      withUpdateExpression(s"set $StateField = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", state))
    table.updateItem(us)
  }

  private def updateItemsState(ids: List[String], progress: ProduceProgress): ProduceProgress = {
    ids.foreach(id => updateItemSate(id, progress.stateId))
    progress
  }

}
