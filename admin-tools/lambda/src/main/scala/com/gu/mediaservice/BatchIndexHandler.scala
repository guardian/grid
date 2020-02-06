package com.gu.mediaservice

import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import java.util.UUID

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient
import com.amazonaws.services.dynamodbv2.document.spec.{ScanSpec, UpdateItemSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.amazonaws.services.dynamodbv2.document.{DynamoDB => AwsDynamoDB, _}
import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.amazonaws.services.kinesis.{AmazonKinesis, AmazonKinesisClientBuilder}
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import play.api.libs.json.{JsObject, JsValue, Json}

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

  // have state for images that were 404
  // nothing was processed => because of 404 2
  // processed => 1
  // not touched or rollback because of failure => 0

  import cfg._

  private val ImagesBatchProjector = ImagesBatchProjection(apiKey, domainRoot)

  import ImagesBatchProjector.prepareImageItemsBlobs

  private val AwsRegion = "eu-west-1"
  private val s3client = buildS3Client
  private val kinesis = buildKinesisClient
  private val dynamo = new AwsDynamoDB(buildDynamoClient)
  private val table: Table = dynamo.getTable(dynamoTableName)

  private def getMediaIdsBatch = {
    println("attempt to ge mediaIds batch from dynamo")
    val scanSpec = new ScanSpec().withFilterExpression("fileState = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", 0)).withMaxResultSize(batchSize)
    val mediaIds = table.scan(scanSpec).asScala.toList.map(it => {
      val json = Json.parse(it.toJSON).as[JsObject]
      (json \ "fileId").as[String]
    })
    mediaIds
  }

  private def updateItemSate(id: String, state: Int) = {
    val us = new UpdateItemSpec().
      withPrimaryKey("fileId", id).
      withUpdateExpression("set fileState = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", state))
    table.updateItem(us)
  }

  private def updateItemsState(ids: List[String], state: Int) = {
    ids.foreach(id => updateItemSate(id, state))
  }

  def processImages()(implicit ec: ExecutionContext): Unit = {
    val mediaIds = getMediaIdsBatch
    println(s"number of mediaIDs to index ${mediaIds.length}, $mediaIds")
    updateItemsState(mediaIds, 1)
    Try {
      val blobsFuture: Future[List[String]] = prepareImageItemsBlobs(mediaIds)
      val images: List[String] = Await.result(blobsFuture, Duration.Inf)
      println(s"prepared json blobs list of size: ${images.size}")
      if (images.isEmpty) {
        println("all was empty terminating current batch")
        updateItemsState(mediaIds, 2)
        return
      }
      println("attempting to store blob to s3")
      val fileContent = images.mkString("\n")
      val path = putToS3(fileContent)
      val executeBulkIndexMsg = Json.obj(
        "subject" -> "batch-index",
        "s3Path" -> path
      )
      putToKinensis(executeBulkIndexMsg)
    } match {
      case Success(value) => println(s"all good $value")
      case Failure(exp) =>
        exp.printStackTrace()
        println(s"there was a failure, resetting items state, exception: ${exp.getMessage}")
        updateItemsState(mediaIds, 0)
    }
  }

  private def putToS3(fileContent: String) = {
    val key = s"batch-index/${UUID.randomUUID().toString}.json"
    val metadata = new ObjectMetadata
    metadata.setContentType("application/json")
    val res = s3client.putObject(batchIndexBucket, key, new ByteArrayInputStream(fileContent.getBytes), metadata)
    val path = s"s3://$batchIndexBucket/$key"
    println(s"PUT [$path] object to s3 response: $res")
    path
  }

  private def putToKinensis(message: JsValue) = {
    println("attempting to put message to kinesis")
    val payload = JsonByteArrayUtil.toByteArray(message)
    val partitionKey = UUID.randomUUID().toString
    val data = ByteBuffer.wrap(payload)
    val putReq = new PutRecordRequest()
      .withStreamName(kinesisStreamName)
      .withPartitionKey(partitionKey)
      .withData(data)

    val res = kinesis.putRecord(putReq)
    println(s"PUT [$message] message to kinesis stream: $kinesisStreamName response: $res")
  }

  private def buildS3Client = {
    val builder = AmazonS3ClientBuilder.standard().withRegion(AwsRegion)
    awsCreds match {
      case Some(creds) =>
        println(s"building local s3 client")
        builder.withCredentials(creds).build()
      case _ =>
        println("building remote s3 client")
        builder.build()
    }
  }

  private def buildDynamoClient = {
    val builder = AmazonDynamoDBClient.builder().withRegion(AwsRegion)
    awsCreds match {
      case Some(creds) =>
        println(s"building local dynamoDB client")
        builder.withCredentials(creds).build()
      case _ =>
        println("building remote dynamoDB client")
        builder.build()
    }
  }

  private def buildKinesisClient: AmazonKinesis = {
    val builder = AmazonKinesisClientBuilder.standard()
    kinesisEndpoint match {
      case Some(uri) =>
        println(s"building local kinesis client with $uri")
        builder.withEndpointConfiguration(new EndpointConfiguration(uri, AwsRegion)).build()
      case _ =>
        println("building remote kinesis client")
        builder.withRegion(AwsRegion).build()
    }
  }
}
