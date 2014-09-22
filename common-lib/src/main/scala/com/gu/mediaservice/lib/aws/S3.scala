package com.gu.mediaservice.lib.aws

import java.io.{FileInputStream, File}
import java.net.URI
import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConverters._

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.s3.{AmazonS3Client, AmazonS3}
import com.amazonaws.services.s3.model.{ObjectMetadata, PutObjectRequest, GeneratePresignedUrlRequest, ListObjectsRequest}
import org.joda.time.DateTime
import scalaz.syntax.id._

class S3(credentials: AWSCredentials) {

  val s3Endpoint = "s3.amazonaws.com"

  type Bucket = String
  type Key = String
  type Metadata = Map[String, String]

  lazy val client: AmazonS3 =
    new AmazonS3Client(credentials) <| (_ setEndpoint s3Endpoint)

  def signUrl(bucket: Bucket, key: Key, expiration: DateTime): String = {
    val request = new GeneratePresignedUrlRequest(bucket, key).withExpiration(expiration.toDate)
    client.generatePresignedUrl(request).toExternalForm
  }

  def store(bucket: Bucket, id: Key, file: File, mimeType: Option[String] = None, meta: Metadata = Map.empty)
           (implicit ex: ExecutionContext): Future[URI] =
    Future {
      val metadata = new ObjectMetadata
      mimeType.foreach(metadata.setContentType)
      metadata.setUserMetadata(meta.asJava)
      val req = new PutObjectRequest(bucket, id, new FileInputStream(file), metadata)
      client.putObject(req)
      objectUrl(bucket, id)
    }

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
