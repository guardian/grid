package com.gu.mediaservice

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.services.dynamodbv2.document._
import com.amazonaws.services.dynamodbv2.document.spec.{ScanSpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import play.api.libs.json.{JsObject, Json}

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}
import scala.util.{Failure, Success, Try}

case class BatchIndexHandlerConfig(
                                    apiKey: String,
                                    domainRoot: String,
                                    batchIndexBucket: String,
                                    kinesisStreamName: String,
                                    dynamoTableName: String,
                                    batchSize: Int,
                                    kinesisEndpoint: Option[String] = None,
                                    awsCreds: Option[AWSCredentialsProvider] = None
                                  )

object BatchIndexHandler {
  def apply(cfg: BatchIndexHandlerConfig): BatchIndexHandler = new BatchIndexHandler(cfg)
}

class BatchIndexHandler(cfg: BatchIndexHandlerConfig) {

  import cfg._

  private val ImagesBatchProjector = ImagesBatchProjection(apiKey, domainRoot)

  import ImagesBatchProjector.prepareImageItemsBlobs

  private val AwsFunctions = new BatchIndexHandlerAwsFunctions(cfg)

  import AwsFunctions._

  private val InputIdsProvider = new InputIdsProvider(buildDynamoTableClient, batchSize)

  import InputIdsProvider._

  def processImages()(implicit ec: ExecutionContext): Unit = {
    val mediaIds = getMediaIdsBatch
    println(s"number of mediaIDs to index ${mediaIds.length}, $mediaIds")
    updateStateForItemsInProgress(mediaIds)
    Try {
      val (imageBlobsWrapper, notFoundImagesIds) = handleBlobsCreation(mediaIds)
      val imageBlobs = imageBlobsWrapper.blobs
      updateStateForNotFoundImages(notFoundImagesIds)
      println(s"prepared json blobs list of size: ${imageBlobs.size}")
      if (imageBlobs.isEmpty) {
        println("all was empty terminating current batch")
        return
      }
      println("attempting to store blob to s3")
      val path = putToS3(imageBlobs)
      val executeBulkIndexMsg = Json.obj(
        "subject" -> "batch-index",
        "s3Path" -> path
      )
      putToKinensis(executeBulkIndexMsg)
    } match {
      case Success(value) => println(s"all good $value")
      case Failure(exp) =>
        exp.printStackTrace()
        println(s"there was a failure, exception: ${exp.getMessage}")
        resetItemsState(mediaIds)
    }
  }

  // using wrapper for type safety
  case class ImageBlobsWrapper(blobs: List[String])

  private def handleBlobsCreation(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    val blobsFuture: Future[List[ImageBlobEntry]] = prepareImageItemsBlobs(mediaIds)
    val allImages: List[ImageBlobEntry] = Await.result(blobsFuture, Duration.Inf)
    val foundImages: List[String] = allImages.flatMap(_.blob)
    val notFoundImagesIds = allImages.filter(_.blob.isEmpty).map(_.id)
    (ImageBlobsWrapper(foundImages), notFoundImagesIds)
  }

}

class InputIdsProvider(table: Table, batchSize: Int) {

  def getMediaIdsBatch: List[String] = {
    println("attempt to get mediaIds batch from dynamo")
    val scanSpec = new ScanSpec().withFilterExpression("fileState = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", 0)).withMaxResultSize(batchSize)
    val mediaIds = table.scan(scanSpec).asScala.toList.map(it => {
      val json = Json.parse(it.toJSON).as[JsObject]
      (json \ "fileId").as[String]
    })
    mediaIds
  }

  // state is used to synchronise multiple overlapping lambda executions, track progress and avoiding repeated operations
  def updateStateForItemsInProgress(ids: List[String]): Unit = {
    println(s"updating items state to in progress")
    updateItemsState(ids, 1)
  }

  def updateStateForNotFoundImages(notFoundIds: List[String]): Unit = {
    println(s"not found images ids: $notFoundIds")
    updateItemsState(notFoundIds, 2)
  }

  def resetItemsState(ids: List[String]): Unit = {
    println("resetting items state")
    updateItemsState(ids, 0)
  }

  private def updateItemSate(id: String, state: Int) = {
    val us = new UpdateItemSpec().
      withPrimaryKey("fileId", id).
      withUpdateExpression("set fileState = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", state))
    table.updateItem(us)
  }

  private def updateItemsState(ids: List[String], state: Int) =
    ids.foreach(id => updateItemSate(id, state))

}
