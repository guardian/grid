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
  def apply(cfg: BatchIndexHandlerConfig): BatchIndexHandler = {
    import cfg._
    val ImagesBatchProjector = ImagesBatchProjection(apiKey, domainRoot)
    val AwsFunctions = new BatchIndexHandlerAwsFunctions(cfg)
    val InputIdsProvider = new InputIdsProvider(AwsFunctions.buildDynamoTableClient, batchSize)

    new BatchIndexHandler(ImagesBatchProjector, InputIdsProvider, AwsFunctions)
  }

  def handleBlobsCreation(mediaIds: List[String],
                          prepareImageItemsBlobsFunk: List[String] => Future[List[ImageMaybeBlobEntry]])(implicit ec: ExecutionContext) = {
    val blobsFuture: Future[List[ImageMaybeBlobEntry]] = prepareImageItemsBlobsFunk(mediaIds)
    val allImages: List[ImageMaybeBlobEntry] = Await.result(blobsFuture, Duration.Inf)
    val foundImages = allImages.filter(_.blob.isDefined).map(i => ImageBlobEntry(i.id, i.blob.get))
    val notFoundImagesIds = allImages.filter(_.blob.isEmpty).map(_.id)
    (foundImages, notFoundImagesIds)
  }
}

class BatchIndexHandler(ImagesBatchProjector: ImagesBatchProjection,
                        InputIdsProvider: InputIdsProvider,
                        AwsFunctions: BatchIndexHandlerAwsFunctions) {

  import AwsFunctions._
  import ImagesBatchProjector.prepareImageItemsBlobs
  import InputIdsProvider._

  def processImages()(implicit ec: ExecutionContext): Unit = {
    val mediaIds = getMediaIdsBatch
    println(s"number of mediaIDs to index ${mediaIds.length}, $mediaIds")
    updateStateToItemsInProgress(mediaIds)
    Try {
      val (foundImageBlobsEntries, notFoundImagesIds) = BatchIndexHandler.handleBlobsCreation(mediaIds, prepareImageItemsBlobs)
      val imageBlobs = foundImageBlobsEntries.map(_.blob)
      updateStateToNotFoundImages(notFoundImagesIds)
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
      updateStateToFinished(foundImageBlobsEntries.map(_.id))
    } match {
      case Success(value) => println(s"all good $value")
      case Failure(exp) =>
        exp.printStackTrace()
        println(s"there was a failure, exception: ${exp.getMessage}")
        resetItemsState(mediaIds)
        // propagating exception
        throw exp
    }
  }

}

class InputIdsProvider(table: Table, batchSize: Int) {

  private val PKField: String = "fileId"
  private val StateField: String = "fileState"

  def getMediaIdsBatch: List[String] = {
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
  def updateStateToItemsInProgress(ids: List[String]): Unit = {
    println(s"updating items state to in progress")
    updateItemsState(ids, 1)
  }

  // used to track images that were not projected successfully
  def updateStateToNotFoundImages(notFoundIds: List[String]): Unit = {
    println(s"not found images ids: $notFoundIds")
    updateItemsState(notFoundIds, 2)
  }

  def updateStateToFinished(ids: List[String]): Unit = {
    println(s"updating items state to in progress")
    updateItemsState(ids, 3)
  }

  // used in situation if something failed
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
