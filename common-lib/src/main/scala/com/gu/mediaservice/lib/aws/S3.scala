package com.gu.mediaservice.lib.aws

import java.io.File
import java.net.{URLEncoder, URI}

import com.amazonaws.auth.AWSCredentials
import com.amazonaws.services.s3.model._
import com.amazonaws.services.s3.{AmazonS3, AmazonS3Client}
import com.gu.mediaservice.model.Image
import org.joda.time.DateTime

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}
import scalaz.CharSet
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

  private def removeExtension(filename: String): String = {
    val regex = """\.[a-zA-Z]{3,4}$""".r
    regex.replaceAllIn(filename, "")
  }

  private def getContentDispositionFilename(image: Image, charset: CharSet): String = {

    val extension = image.source.mimeType match {
      case Some("image/jpeg") => "jpg"
      case Some("image/png")  => "png"
      case _ => throw new Exception("Unsupported mime type")
    }

    val baseFilename: String = image.uploadInfo.filename match {
      case Some(f)  => s"${removeExtension(f)} (${image.id}).${extension}"
      case _        => s"${image.id}.${extension}"
    }

    charset match {
      case CharSet.UTF8 => {
        // URLEncoder converts ` ` to `+`, replace it with `%20`
        // See http://docs.oracle.com/javase/6/docs/api/java/net/URLEncoder.html
        URLEncoder.encode(baseFilename, CharSet.UTF8).replace("+", "%20")
      }
      case characterSet => baseFilename.getBytes(characterSet).toString
    }
  }


  def signUrl(bucket: Bucket, url: URI, image: Image, expiration: DateTime): String = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)


    // use both `filename` and `filename*` parameters for compatibility with user agents not implementing RFC 5987
    // they'll fallback to `filename`, which will be a UTF-8 string decoded as Latin-1 - this is a rubbish string, but only rubbish browsers don't support RFC 5987 (IE8 back)
    // See http://tools.ietf.org/html/rfc6266#section-5
    val contentDisposition = s"""attachment; filename="${getContentDispositionFilename(image, CharSet.ISO8859)}"; filename*=UTF-8''${getContentDispositionFilename(image, CharSet.UTF8)}"""

    val headers = new ResponseHeaderOverrides().withContentDisposition(contentDisposition)

    val request = new GeneratePresignedUrlRequest(bucket, key).withExpiration(expiration.toDate).withResponseHeaders(headers)
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
