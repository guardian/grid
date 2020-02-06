package com.gu.mediaservice

import java.util.UUID

import software.amazon.awssdk.auth.credentials.{InstanceProfileCredentialsProvider, ProfileCredentialsProvider}
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.kinesis.KinesisAsyncClient
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.PutObjectRequest

import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

object BatchIndexHandler {
  def apply(apiKey: String, domainRoot: String, batchIndexBucket: String): BatchIndexHandler =
    new BatchIndexHandler(apiKey, domainRoot, batchIndexBucket, "")
}

class BatchIndexHandler(
                         apiKey: String,
                         domainRoot: String,
                         batchIndexBucket: String,
                         streamName: String
                       ) {

  private val ImagesBatchProjector = ImagesBatchProjection(apiKey, domainRoot)

  import ImagesBatchProjector.prepareImageItemsBlobs

  private val AwsRegion = Region.EU_WEST_1
  private val AwsProfile = "media-service"

  def processImages(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    val blobsFuture: Future[List[String]] = prepareImageItemsBlobs(mediaIds)
    val images: List[String] = Await.result(blobsFuture, Duration.Inf)
    println(s"prepared json blobs list of size: ${images.size}")
    println("attempting to store blob to s3")
    val fileContent = images.mkString("\n")
    val putObjReq = PutObjectRequest.builder()
      .bucket(batchIndexBucket)
      .key(s"batch-index/${UUID.randomUUID().toString}.json")
      .contentType("application/json").build()
    s3client.putObject(putObjReq, RequestBody.fromString(fileContent))
  }

  private val awsProfileCredentials = ProfileCredentialsProvider.builder().profileName(AwsProfile).build()

  private val awsInstanceCredentials = InstanceProfileCredentialsProvider.create()

  private val s3client =
    S3Client.builder()
      .credentialsProvider(awsProfileCredentials)
      .region(AwsRegion).build()


  private val kinesis =
    KinesisAsyncClient.builder()
      .credentialsProvider(awsProfileCredentials)
      .region(AwsRegion)
      .build()

}
