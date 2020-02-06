package com.gu.mediaservice

import java.net.URI
import java.util.UUID

import com.gu.mediaservice.lib.json.JsonByteArrayUtil
import play.api.libs.json.{JsValue, Json}
import software.amazon.awssdk.auth.credentials.ProfileCredentialsProvider
import software.amazon.awssdk.core.SdkBytes
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.kinesis.KinesisClient
import software.amazon.awssdk.services.kinesis.model.PutRecordRequest
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

object BatchIndexHandler {
  def apply(apiKey: String, domainRoot: String, batchIndexBucket: String, kinesisStreamName: String, kinesisEndpoint: Option[URI] = None): BatchIndexHandler =
    new BatchIndexHandler(apiKey, domainRoot, batchIndexBucket, kinesisStreamName, kinesisEndpoint)
}

class BatchIndexHandler(
                         apiKey: String,
                         domainRoot: String,
                         batchIndexBucket: String,
                         kinesisStreamName: String,
                         kinesisEndpoint: Option[URI]
                       ) {

  private val ImagesBatchProjector = ImagesBatchProjection(apiKey, domainRoot)

  import ImagesBatchProjector.prepareImageItemsBlobs

  private val AwsRegion = Region.EU_WEST_1
  private val AwsProfile = "media-service"
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


  //  private val awsInstanceCredentials = InstanceProfileCredentialsProvider.create()

  private def putToS3(fileContent: String) = {
    val key = s"batch-index/${UUID.randomUUID().toString}.json"
    val putObjReq = PutObjectRequest.builder()
      .bucket(batchIndexBucket)
      .key(key)
      .contentType("application/json").build()
    val res = s3client.putObject(putObjReq, RequestBody.fromString(fileContent))
    val path = s"s3://$batchIndexBucket/$key"
    println(s"PUT [$path] object to s3 response: $res")
    path
  }

  private def putToKinensis(message: JsValue) = {
    println("attempting to put message to kinesis")
    val payload = JsonByteArrayUtil.toByteArray(message)
    val partitionKey = UUID.randomUUID().toString
    val putReq = PutRecordRequest.builder()
      .partitionKey(partitionKey)
      .streamName(kinesisStreamName)
      .data(SdkBytes.fromByteArray(payload))
      .build()
    val res = kinesis.putRecord(putReq)
    println(s"PUT [$message] message to kinesis stream: $kinesisStreamName response: $res")
  }

  private lazy val awsProfileCredentials = ProfileCredentialsProvider.builder().profileName(AwsProfile).build()

  private def buildS3Client = S3Client.builder()
    .credentialsProvider(awsProfileCredentials)
    .region(AwsRegion).build()

  private def buildKinesisClient = {
    val builder = KinesisClient.builder()
      .credentialsProvider(awsProfileCredentials)
      .region(AwsRegion)
    kinesisEndpoint match {
      case Some(uri) =>
        println(s"building local kinesis client with $uri")
        println("disabling CBOR to be able to work with localstack kinesis")
        System.setProperty("aws.cborEnabled", "false")
        builder.endpointOverride(uri).build()
      case _ =>
        println("building remote kinesis client")
        builder.build()
    }
  }

}
