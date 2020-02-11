package com.gu.mediaservice

import java.util.concurrent.TimeUnit

import com.amazonaws.services.dynamodbv2.document._
import com.amazonaws.services.dynamodbv2.document.spec.{ScanSpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.gu.mediaservice.indexing.IndexInputCreation._
import com.gu.mediaservice.indexing.ProduceProgress
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.model.Image
import play.api.libs.json.{JsObject, Json}

import scala.collection.JavaConverters._
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration.{FiniteDuration, TimeUnit}
import scala.util.{Failure, Success, Try}

case class BatchIndexHandlerConfig(
                                    apiKey: String,
                                    domainRoot: String,
                                    batchIndexBucket: String,
                                    kinesisStreamName: String,
                                    dynamoTableName: String,
                                    batchSize: Int,
                                    kinesisEndpoint: Option[String] = None
                                  )

object BatchIndexHandler {

  def apply(cfg: BatchIndexHandlerConfig): BatchIndexHandler = new BatchIndexHandler(cfg)

}

class BatchIndexHandler(cfg: BatchIndexHandlerConfig) {

  import cfg._

  private val ProjectionTimoutInMins = 11
  private val GetIdsTimoutInMins = 1
  private val OthersTimoutInMins = 1
  private val GlobalTimoutInMins = ProjectionTimoutInMins + GetIdsTimoutInMins + OthersTimoutInMins

  private val GetIdsTimeout =  new FiniteDuration(GetIdsTimoutInMins, TimeUnit.MINUTES)
  private val GlobalTimeout =  new FiniteDuration(GlobalTimoutInMins, TimeUnit.MINUTES)
  private val ImagesProjectionTimeout = new FiniteDuration(ProjectionTimoutInMins, TimeUnit.MINUTES)

  private val ImagesBatchProjector = new ImagesBatchProjection(apiKey, domainRoot, ImagesProjectionTimeout)
  private val AwsFunctions = new BatchIndexHandlerAwsFunctions(cfg)
  private val InputIdsStore = new InputIdsStore(AwsFunctions.buildDynamoTableClient, batchSize)

  import AwsFunctions._
  import ImagesBatchProjector._
  import InputIdsStore._

  private implicit val ec: ExecutionContext = scala.concurrent.ExecutionContext.Implicits.global

  def processImages(): List[String] = {
    val stateProgress = scala.collection.mutable.ArrayBuffer[ProduceProgress]()
    stateProgress += NotStarted
    val mediaIdsFuture = getUnprocessedMediaIdsBatch
    val mediaIds = Await.result(mediaIdsFuture, GetIdsTimeout)
    Try {
      val processImagesFuture: Future[List[String]] = Future {
        println(s"number of mediaIDs to index ${mediaIds.length}, $mediaIds")
        stateProgress += updateStateToItemsInProgress(mediaIds)
        val maybeBlobsFuture: List[Either[Image, String]] = getImagesProjection(mediaIds)
        val (foundImages, notFoundImagesIds) = partitionToSuccessAndNotFound(maybeBlobsFuture)

        updateStateToNotFoundImages(notFoundImagesIds).map(stateProgress += _)
        println(s"prepared json blobs list of size: ${foundImages.size}")
        if (foundImages.isEmpty) {
          println("all was empty terminating current batch")
          return stateProgress.map(_.name).toList
        }
        println("attempting to store blob to s3")
        val bulkIndexRequest = putToS3(foundImages)
        val indexMessage = UpdateMessage(
          subject = "batch-index",
          bulkIndexRequest = Some(bulkIndexRequest)
        )
        putToKinensis(indexMessage)
        stateProgress += updateStateToFinished(foundImages.map(_.id))
        stateProgress.map(_.name).toList
      }
      Await.result(processImagesFuture, GlobalTimeout)
    } match {
      case Success(progressList) =>
        println(s"processImages function execution state progress: $progressList")
        progressList
      case Failure(exp) =>
        exp.printStackTrace()
        println(s"there was a failure, exception: ${exp.getMessage}")
        stateProgress += resetItemsState(mediaIds)
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

class InputIdsStore(table: Table, batchSize: Int) {

  private val PKField: String = "id"
  private val StateField: String = "progress_state"

  def getUnprocessedMediaIdsBatch(implicit ec: ExecutionContext): Future[List[String]] = Future {
    println("attempt to get mediaIds batch from dynamo")
    val scanSpec = new ScanSpec().withFilterExpression(s"$StateField = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", 0)).withMaxResultSize(batchSize)
    val mediaIds = table.scan(scanSpec).asScala.toList.map(it => {
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
    println(s"updating items state to in progress")
    updateItemsState(ids, InProgress)
  }

  // used to track images that were not projected successfully
  def updateStateToNotFoundImages(notFoundIds: List[String]): Option[ProduceProgress] = {
    if (notFoundIds.isEmpty) None else {
      println(s"not found images ids: $notFoundIds")
      Some(updateItemsState(notFoundIds, NotFound))
    }
  }

  def updateStateToFinished(ids: List[String]): ProduceProgress = {
    println(s"updating items state to in progress")
    updateItemsState(ids, Finished)
  }

  // used in situation if something failed
  def resetItemsState(ids: List[String]): ProduceProgress = {
    println("resetting items state")
    updateItemsState(ids, Reset)
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
