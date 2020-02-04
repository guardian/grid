package com.gu.mediaservice.lib.aws

import java.io.File
import java.net.{URI, URLEncoder}
import java.nio.charset.{Charset, StandardCharsets}

import com.amazonaws.{AmazonServiceException, ClientConfiguration}
import com.amazonaws.services.s3.model._
import com.amazonaws.services.s3.{AmazonS3, AmazonS3ClientBuilder, model}
import com.amazonaws.util.IOUtils
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model._
import org.joda.time.{DateTime, Duration}
import org.slf4j.LoggerFactory
import play.api.Logger

import scala.collection.JavaConverters._
import scala.concurrent.{ExecutionContext, Future}

case class S3Object(uri: URI, size: Long, metadata: S3Metadata)

case class S3Metadata(userMetadata: Map[String, String], objectMetadata: S3ObjectMetadata)

case class S3ObjectMetadata(contentType: Option[MimeType], cacheControl: Option[String], lastModified: Option[DateTime] = None)

class S3(config: CommonConfig) {
  type Bucket = String
  type Key = String
  type UserMetadata = Map[String, String]

  import S3Ops.objectUrl

  lazy val client: AmazonS3 = S3Ops.buildS3Client(config)
  private val log = LoggerFactory.getLogger(getClass)

  private def removeExtension(filename: String): String = {
    val regex = """\.[a-zA-Z]{3,4}$""".r
    regex.replaceAllIn(filename, "")
  }

  private def getContentDispositionFilename(image: Image, imageType: ImageType, charset: Charset): String = {

    val asset = imageType match {
      case Source => image.source
      case Thumbnail => image.thumbnail.getOrElse(image.source)
      case OptimisedPng => image.optimisedPng.getOrElse(image.source)
    }

    val extension: String = asset.mimeType.getOrElse(throw new Exception("Unsupported mime type")).fileExtension

    val baseFilename: String = image.uploadInfo.filename match {
      case Some(f) => s"${removeExtension(f)} (${image.id})$extension"
      case _ => s"${image.id}$extension"
    }

    charset.displayName() match {
      case "UTF-8" =>
        // URLEncoder converts ` ` to `+`, replace it with `%20`
        // See http://docs.oracle.com/javase/6/docs/api/java/net/URLEncoder.html
        URLEncoder.encode(baseFilename, "UTF-8").replace("+", "%20")
      case characterSet => baseFilename.getBytes(characterSet).toString
    }
  }

  def getContentDisposition(image: Image, imageType: ImageType): String = {
    // use both `filename` and `filename*` parameters for compatibility with user agents not implementing RFC 5987
    // they'll fallback to `filename`, which will be a UTF-8 string decoded as Latin-1 - this is a rubbish string, but only rubbish browsers don't support RFC 5987 (IE8 back)
    // See http://tools.ietf.org/html/rfc6266#section-5
    s"""attachment; filename="${getContentDispositionFilename(image, imageType, StandardCharsets.ISO_8859_1)}"; filename*=UTF-8''${getContentDispositionFilename(image, imageType, StandardCharsets.UTF_8)}"""
  }

  private def roundDateTime(t: DateTime, d: Duration): DateTime = t minus (t.getMillis - (t.getMillis.toDouble / d.getMillis).round * d.getMillis)

  // Round expiration time to try and hit the cache as much as possible
  // TODO: do we really need these expiration tokens? they kill our ability to cache...
  private def defaultExpiration: DateTime = roundDateTime(DateTime.now, Duration.standardMinutes(10)).plusMinutes(20)

  def signUrl(bucket: Bucket, url: URI, image: Image, expiration: DateTime = defaultExpiration, imageType: ImageType = Source): String = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)

    val contentDisposition = getContentDisposition(image, imageType)

    val headers = new ResponseHeaderOverrides().withContentDisposition(contentDisposition)

    val request = new GeneratePresignedUrlRequest(bucket, key).withExpiration(expiration.toDate).withResponseHeaders(headers)
    client.generatePresignedUrl(request).toExternalForm
  }

  def getObject(bucket: Bucket, url: URI): model.S3Object = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)
    client.getObject(new GetObjectRequest(bucket, key))
  }

  def getObjectAsString(bucket: Bucket, key: String): Option[String] = {
    val content = client.getObject(new GetObjectRequest(bucket, key))
    val stream = content.getObjectContent
    try {
      Some(IOUtils.toString(stream).trim)
    } catch {
      case e: AmazonServiceException if e.getErrorCode == "NoSuchKey" =>
        log.warn(s"Cannot find key: $key in bucket: $bucket")
        None
    }
    finally {
      stream.close()
    }
  }

  def store(bucket: Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None)
           (implicit ex: ExecutionContext): Future[S3Object] =
    Future {
      val metadata = new ObjectMetadata
      mimeType.foreach(m => metadata.setContentType(m.name))
      cacheControl.foreach(metadata.setCacheControl)
      metadata.setUserMetadata(meta.asJava)

      val req = new PutObjectRequest(bucket, id, file).withMetadata(metadata)
      client.putObject(req)

      S3Ops.projectFileAsS3Object(bucket, id, file, mimeType, meta, cacheControl)
    }

  def list(bucket: Bucket, prefixDir: String)
          (implicit ex: ExecutionContext): Future[List[S3Object]] =
    Future {
      val req = new ListObjectsRequest().withBucketName(bucket).withPrefix(s"$prefixDir/")
      val listing = client.listObjects(req)
      val summaries = listing.getObjectSummaries.asScala
      summaries.map(summary => (summary.getKey, summary)).foldLeft(List[S3Object]()) {
        case (memo: List[S3Object], (key: String, summary: S3ObjectSummary)) =>
          S3Object(objectUrl(bucket, key), summary.getSize(), getMetadata(bucket, key)) :: memo
      }
    }

  def getMetadata(bucket: Bucket, key: Key) = {
    val meta = client.getObjectMetadata(bucket, key)

    S3Metadata(
      meta.getUserMetadata.asScala.toMap,
      S3ObjectMetadata(
        contentType = Option(MimeType(meta.getContentType)),
        cacheControl = Option(meta.getCacheControl),
        lastModified = Option(meta.getLastModified).map(new DateTime(_))
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

}

object S3Ops {
  private val s3Endpoint = "s3.amazonaws.com"

  def buildS3Client(config: CommonConfig): AmazonS3 = {
    // Force v2 signatures: https://github.com/aws/aws-sdk-java/issues/372
    // imgops proxies direct to S3, passing the AWS security signature as query parameters
    // This does not work with AWS v4 signatures, presumably because the signature includes the host
    val clientConfig = new ClientConfiguration()
    clientConfig.setSignerOverride("S3SignerType")

    val builder = AmazonS3ClientBuilder.standard().withClientConfiguration(clientConfig)

    config.withAWSCredentials(builder).build()
  }

  def objectUrl(bucket: String, key: String): URI = {
    val bucketUrl = s"$bucket.$s3Endpoint"
    new URI("http", bucketUrl, s"/$key", null)
  }

  def projectFileAsS3Object(bucket: String, key: String, file: File, mimeType: Option[MimeType], meta: Map[String, String] = Map.empty, cacheControl: Option[String] = None): S3Object = {
    S3Object(
      objectUrl(bucket, key),
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
}
