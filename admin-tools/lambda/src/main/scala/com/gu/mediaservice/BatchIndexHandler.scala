package com.gu.mediaservice

import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import java.util.UUID

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.amazonaws.services.dynamodbv2.AmazonDynamoDBClient
import com.amazonaws.services.dynamodbv2.document.spec.{QuerySpec, ScanSpec}
import com.amazonaws.services.dynamodbv2.document.utils.ValueMap
import com.amazonaws.services.dynamodbv2.document.{DynamoDB => AwsDynamoDB, _}
import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.amazonaws.services.kinesis.{AmazonKinesis, AmazonKinesisClientBuilder}
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import play.api.libs.json.{JsValue, Json}

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

case class IndexItemState(fileId: String, fileState: Int)

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

  private implicit val IndexItemStateFormatter = Json.format[IndexItemState]

  import cfg._

  private val ImagesBatchProjector = ImagesBatchProjection(apiKey, domainRoot)

  import ImagesBatchProjector.prepareImageItemsBlobs

  private val AwsRegion = "eu-west-1"
  private val s3client = buildS3Client
  private val kinesis = buildKinesisClient
  private val dynamo = new AwsDynamoDB(buildDynamoClient)
  private val table: Table = dynamo.getTable(dynamoTableName)

  private def getMediaIdsBatch = {
    println("getMediaIdsBatch")
    val scanSpec = new ScanSpec().withFilterExpression("fileState = :sub")
      .withValueMap(new ValueMap().withNumber(":sub", 0)).withMaxResultSize(batchSize)

    val mediaIds = table.scan(scanSpec).asScala.toList.map(it => (Json.parse(it.toJSON) \ "fileId").as[Int])
    println(s"mediaIds to index: $mediaIds")
    mediaIds
  }

  def processImages(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    getMediaIdsBatch
//    val blobsFuture: Future[List[String]] = prepareImageItemsBlobs(mediaIds)
//    val images: List[String] = Await.result(blobsFuture, Duration.Inf)
//    println(s"prepared json blobs list of size: ${images.size}")
//    println("attempting to store blob to s3")
//    val fileContent = images.mkString("\n")
//    val path = putToS3(fileContent)
//    val executeBulkIndexMsg = Json.obj(
//      "subject" -> "batch-index",
//      "s3Path" -> path
//    )
//    putToKinensis(executeBulkIndexMsg)
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
