package com.gu.mediaservice

import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import java.util.UUID

import com.amazonaws.auth.AWSCredentialsProvider
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.amazonaws.services.kinesis.model.PutRecordRequest
import com.amazonaws.services.kinesis.{AmazonKinesis, AmazonKinesisClientBuilder}
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.ObjectMetadata
import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import play.api.libs.json.{JsValue, Json}

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

object BatchIndexHandler {
  def apply(apiKey: String, domainRoot: String, batchIndexBucket: String,
            kinesisStreamName: String,
            kinesisEndpoint: Option[String] = None,
            awsCreds: Option[AWSCredentialsProvider] = None): BatchIndexHandler =
    new BatchIndexHandler(apiKey, domainRoot, batchIndexBucket, kinesisStreamName, kinesisEndpoint, awsCreds)
}

class BatchIndexHandler(
                         apiKey: String,
                         domainRoot: String,
                         batchIndexBucket: String,
                         kinesisStreamName: String,
                         kinesisEndpoint: Option[String],
                         awsCreds: Option[AWSCredentialsProvider]
                       ) {

  private val ImagesBatchProjector = ImagesBatchProjection(apiKey, domainRoot)

  import ImagesBatchProjector.prepareImageItemsBlobs

  private val AwsRegion = "eu-west-1"
  private val s3client = buildS3Client
  private val kinesis = buildKinesisClient

  def processImages(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    val blobsFuture: Future[List[String]] = prepareImageItemsBlobs(mediaIds)
    val images: List[String] = Await.result(blobsFuture, Duration.Inf)
    println(s"prepared json blobs list of size: ${images.size}")
    println("attempting to store blob to s3")
    val fileContent = images.mkString("\n")
    val path = putToS3(fileContent)
    val executeBulkIndexMsg = Json.obj(
      "subject" -> "batch-index",
      "s3Path" -> path
    )
    putToKinensis(executeBulkIndexMsg)
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

  private def buildKinesisClient: AmazonKinesis = {
    val builder = AmazonKinesisClientBuilder.standard()
    (kinesisEndpoint, awsCreds) match {
      case (Some(uri), Some(creds)) =>
        println(s"building local kinesis client with $uri")
        builder.withEndpointConfiguration(new EndpointConfiguration(uri, AwsRegion))
          .withCredentials(creds).build()
      case _ =>
        println("building remote kinesis client")
        builder.withRegion(AwsRegion).build()
    }
  }
}
