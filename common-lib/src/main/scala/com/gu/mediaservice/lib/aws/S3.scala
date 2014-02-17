package com.gu.mediaservice.lib.aws

import java.io.{FileInputStream, File}
import java.net.URI
import scala.concurrent.{ExecutionContext, Future}
import scala.collection.JavaConverters._

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.s3.{AmazonS3Client, AmazonS3}
import com.amazonaws.services.s3.model.{ObjectMetadata, PutObjectRequest, GeneratePresignedUrlRequest}
import org.joda.time.DateTime
import scalaz.syntax.id._

class S3(credentials: AWSCredentials) {

  val s3Endpoint = "s3.amazonaws.com"

  lazy val client: AmazonS3 =
    new AmazonS3Client(credentials) <| (_ setEndpoint s3Endpoint)

  def signUrl(bucket: String, key: String, expiration: DateTime): String = {
    val request = new GeneratePresignedUrlRequest(bucket, key).withExpiration(expiration.toDate)
    client.generatePresignedUrl(request).toExternalForm
  }

  def store(bucket: String, id: String, file: File, meta: Map[String, String] = Map.empty)
           (implicit ex: ExecutionContext): Future[URI] =
    Future {
      val metadata = new ObjectMetadata <| (_.setUserMetadata(meta.asJava))
      val req = new PutObjectRequest(bucket, id, new FileInputStream(file), metadata)
      client.putObject(req)
      val bucketUrl = s"$bucket.$s3Endpoint"
      new URI("http", bucketUrl, s"/$id", null)
    }

}
