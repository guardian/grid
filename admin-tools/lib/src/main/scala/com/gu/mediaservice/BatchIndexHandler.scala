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

  def partitionToSuccessAndNotFound(maybeBlobsFuture: Future[List[ImageIdMaybeBlobEntry]])
                                   (implicit ec: ExecutionContext): (List[ImageIdBlobEntry], List[String]) = {
    val allImages: List[ImageIdMaybeBlobEntry] = Await.result(maybeBlobsFuture, Duration.Inf)
    val foundImages = allImages.filter(_.blob.isDefined).map(i => ImageIdBlobEntry(i.id, i.blob.get))
    val notFoundImagesIds = allImages.filter(_.blob.isEmpty).map(_.id)
    (foundImages, notFoundImagesIds)
  }
}

class BatchIndexHandler(ImagesBatchProjector: ImagesBatchProjection,
                        InputIdsProvider: InputIdsProvider,
                        AwsFunctions: BatchIndexHandlerAwsFunctions) {

  import ImagesBatchProjector.getMaybeImagesProjectionBlobs
  import InputIdsProvider._
  import AwsFunctions._

  def processImages()(implicit ec: ExecutionContext): List[Int] = {
    val stateProgress = scala.collection.mutable.ArrayBuffer[Int]()
    stateProgress += 0
    val mediaIds = getMediaIdsBatch
    Try {
      println(s"number of mediaIDs to index ${mediaIds.length}, $mediaIds")
      stateProgress += updateStateToItemsInProgress(mediaIds)
      val maybeBlobsFuture: Future[List[ImageIdMaybeBlobEntry]] = getMaybeImagesProjectionBlobs(mediaIds)
      val (foundImageBlobsEntries, notFoundImagesIds) = BatchIndexHandler.partitionToSuccessAndNotFound(maybeBlobsFuture)
      val imageBlobs = foundImageBlobsEntries.map(_.blob)
      updateStateToNotFoundImages(notFoundImagesIds).map(stateProgress += _)
      println(s"prepared json blobs list of size: ${imageBlobs.size}")
      if (imageBlobs.isEmpty) {
        println("all was empty terminating current batch")
        return stateProgress.toList
      }
      println("attempting to store blob to s3")
      val path = putToS3(imageBlobs)
      val executeBulkIndexMsg = Json.obj(
        "subject" -> "batch-index",
        "s3Path" -> path
      )
      putToKinensis(executeBulkIndexMsg)
      stateProgress += updateStateToFinished(foundImageBlobsEntries.map(_.id))
    } match {
      case Success(_) =>
        val res = stateProgress.toList
        println(s"processImages function execution state progress: $res")
        res
      case Failure(exp) =>
        exp.printStackTrace()
        println(s"there was a failure, exception: ${exp.getMessage}")
        stateProgress += resetItemsState(mediaIds)
        // propagating exception
        throw exp
    }
  }

}

class InputIdsProvider(table: Table, batchSize: Int) {

  private val PKField: String = "id"
  private val StateField: String = "progress_state"

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
  def updateStateToItemsInProgress(ids: List[String]): Int = {
    val state = 1
    println(s"updating items state to in progress")
    updateItemsState(ids, state)
    state
  }

  // used to track images that were not projected successfully
  def updateStateToNotFoundImages(notFoundIds: List[String]): Option[Int] = {
    if (notFoundIds.isEmpty) None else {
      val state = 2
      println(s"not found images ids: $notFoundIds")
      updateItemsState(notFoundIds, state)
      Some(state)
    }
  }

  def updateStateToFinished(ids: List[String]): Int = {
    val state = 3
    println(s"updating items state to in progress")
    updateItemsState(ids, state)
    state
  }

  // used in situation if something failed
  def resetItemsState(ids: List[String]): Int = {
    val state = 0
    println("resetting items state")
    updateItemsState(ids, state)
    state
  }

  private def updateItemSate(id: String, state: Int) = {
    val us = new UpdateItemSpec().
      withPrimaryKey(PKField, id).
      withUpdateExpression(s"set $StateField = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", state))
    table.updateItem(us)
  }

  private def updateItemsState(ids: List[String], state: Int) =
    ids.foreach(id => updateItemSate(id, state))

}
