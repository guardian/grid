package com.gu.mediaservice.lib.aws

import java.util.Date
import java.io.{FileInputStream, File}
import java.net.URI
import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConverters._

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.s3.{AmazonS3Client, AmazonS3}
import com.amazonaws.services.s3.model.{S3ObjectSummary, ObjectMetadata, PutObjectRequest, GeneratePresignedUrlRequest, ListObjectsRequest}
import org.joda.time.DateTime
import scalaz.syntax.id._


case class S3Object(uri: URI, size: Long, metadata: S3Metadata)
case class S3Metadata(userMetadata: Map[String, String], objectMetadata: S3ObjectMetadata)
case class S3ObjectMetadata(contentType: Option[String], cacheControl: Option[String], lastModified: Option[DateTime] = None)

class S3(credentials: AWSCredentials) {

  val s3Endpoint = "s3.amazonaws.com"

  type Bucket = String
  type Key = String
  type UserMetadata = Map[String, String]


  lazy val client: AmazonS3 =
    new AmazonS3Client(credentials) <| (_ setEndpoint s3Endpoint)

  def signUrl(bucket: Bucket, url: URI, expiration: DateTime): String = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)
    val request = new GeneratePresignedUrlRequest(bucket, key).withExpiration(expiration.toDate)
    client.generatePresignedUrl(request).toExternalForm
  }

  def store(bucket: Bucket, id: Key, file: File, mimeType: Option[String] = None, meta: UserMetadata = Map.empty, cacheControl: Option[String] = None)
           (implicit ex: ExecutionContext): Future[S3Object] =
    Future {
      val metadata = new ObjectMetadata
      mimeType.foreach(metadata.setContentType)
      cacheControl.foreach(metadata.setCacheControl)
      metadata.setUserMetadata(meta.asJava)

      val req = new PutObjectRequest(bucket, id, file).withMetadata(metadata)
      client.putObject(req)

      S3Object(
        objectUrl(bucket, id),
        file.length,
        S3Metadata(
          meta,
          S3ObjectMetadata(
            mimeType,
            cacheControl
          )
        )
      )
    }

  def list(bucket: Bucket, prefixDir: String)
          (implicit ex: ExecutionContext): Future[List[S3Object]] =
    Future {
      val req = new ListObjectsRequest().withBucketName(bucket).withPrefix(s"$prefixDir/")
      val listing = client.listObjects(req)
      val summaries = listing.getObjectSummaries.asScala
      summaries.map(summary => (summary.getKey, summary)).foldLeft(List[S3Object]()) {
        case (memo: List[S3Object], (key: String, summary: S3ObjectSummary)) => {
          S3Object(objectUrl(bucket, key), summary.getSize(), getMetadata(bucket, key)) :: memo
        }
      }
    }

  def getMetadata(bucket: Bucket, key: Key) = {
    val meta = client.getObjectMetadata(bucket, key)

    S3Metadata(
      meta.getUserMetadata.asScala.toMap,
      S3ObjectMetadata(
        contentType  = Option(meta.getContentType()),
        cacheControl = Option(meta.getCacheControl()),
        lastModified = Option(meta.getLastModified()).map(new DateTime(_))
      )
    )
  }

  def getUserMetadata(bucket: Bucket, key: Key) =
    client.getObjectMetadata(bucket, key).getUserMetadata.asScala.toMap

  def syncFindKey(bucket: Bucket, prefixName: String): Option[Key] = {
    val req = new ListObjectsRequest().withBucketName(bucket).withPrefix(s"$prefixName-")
    val listing = client.listObjects(req)
    val summaries = listing.getObjectSummaries.asScala
    summaries.headOption.map(_.getKey)
  }

  private def objectUrl(bucket: Bucket, key: Key): URI = {
    val bucketUrl = s"$bucket.$s3Endpoint"
    new URI("http", bucketUrl, s"/$key", null)
  }

}
