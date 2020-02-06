package com.gu.mediaservice

import java.util.UUID

import com.amazonaws.auth.{AWSCredentialsProviderChain, InstanceProfileCredentialsProvider}
import com.amazonaws.auth.profile.ProfileCredentialsProvider
import com.amazonaws.services.s3.AmazonS3ClientBuilder
import com.amazonaws.services.s3.model.{ObjectMetadata, Region}

import scala.concurrent.{Await, ExecutionContext, Future}
import scala.concurrent.duration.Duration

object BatchIndexHandler {
  def apply(apiKey: String, domainRoot: String, batchIndexBucket: String): BatchIndexHandler =
    new BatchIndexHandler(apiKey, domainRoot, batchIndexBucket)
}

class BatchIndexHandler(apiKey: String, domainRoot: String, batchIndexBucket: String) {

  private val ImagesBatchProjector = ImagesBatchProjection(apiKey, domainRoot)
  import ImagesBatchProjector.prepareImageItemsBlobs

  def storeImagesForBatchInsertAndNotify(mediaIds: List[String])(implicit ec: ExecutionContext) = {
    val blobsFuture: Future[List[String]] = prepareImageItemsBlobs(mediaIds)
    val images: List[String] = Await.result(blobsFuture, Duration.Inf)
    println(s"prepared json blobs list of size: ${images.size}")
    println("attempting to store blob to s3")
    val fileContent = images.mkString("\n")
    val meta = new ObjectMetadata()
    meta.setContentType("application/json")
    import java.io.ByteArrayInputStream
    val fileContentStream = new ByteArrayInputStream(fileContent.getBytes)
    s3client.putObject(batchIndexBucket, s"batch-index/${UUID.randomUUID().toString}.json", fileContentStream, meta)
    // send message to kinesis

  }

  private def s3client = {
    lazy val awsCredentials = new AWSCredentialsProviderChain(
      new ProfileCredentialsProvider("media-service"),
      InstanceProfileCredentialsProvider.getInstance()
    )
    AmazonS3ClientBuilder.standard()
      .withCredentials(awsCredentials)
      .withRegion(Region.EU_Ireland.toAWSRegion.getName)
      .build()
  }

}
