package com.gu.mediaservice.lib.aws

import com.amazonaws.services.s3.model._
import com.amazonaws.services.s3.{AmazonS3, AmazonS3ClientBuilder, model}
import com.amazonaws.util.IOUtils
import com.amazonaws.{AmazonServiceException, ClientConfiguration}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch}
import com.gu.mediaservice.model._
import org.joda.time.{DateTime, Duration}

import java.io.File
import java.net.URI
import scala.jdk.CollectionConverters._
import scala.concurrent.{ExecutionContext, Future}

case class S3Object(uri: URI, size: Long, metadata: S3Metadata)

object S3Object {
  def objectUrl(bucket: String, key: String): URI = {
    val bucketUrl = s"$bucket.${S3Ops.s3Endpoint}"
    new URI("http", bucketUrl, s"/$key", null)
  }

  def apply(bucket: String, key: String, size: Long, metadata: S3Metadata): S3Object =
    apply(objectUrl(bucket, key), size, metadata)

  def apply(bucket: String, key: String, file: File, mimeType: Option[MimeType], lastModified: Option[DateTime],
            meta: Map[String, String] = Map.empty, cacheControl: Option[String] = None): S3Object = {
    S3Object(
      bucket,
      key,
      file.length,
      S3Metadata(
        meta,
        S3ObjectMetadata(
          mimeType,
          cacheControl,
          lastModified
        )
      )
    )
  }
}

case class S3Metadata(userMetadata: Map[String, String], objectMetadata: S3ObjectMetadata)

object S3Metadata {
  def apply(meta: ObjectMetadata): S3Metadata = {
    S3Metadata(
      meta.getUserMetadata.asScala.toMap,
      S3ObjectMetadata(
        contentType = Option(meta.getContentType).map(MimeType.apply),
        cacheControl = Option(meta.getCacheControl),
        lastModified = Option(meta.getLastModified).map(new DateTime(_))
      )
    )
  }
}

case class S3ObjectMetadata(contentType: Option[MimeType], cacheControl: Option[String], lastModified: Option[DateTime])

class S3(config: CommonConfig) extends GridLogging with ContentDisposition with RoundedExpiration {
  type Bucket = String
  type Key = String
  type UserMetadata = Map[String, String]

  lazy val client: AmazonS3 = S3Ops.buildS3Client(config)
  // also create a legacy client that uses v2 signatures for URL signing
  private lazy val legacySigningClient: AmazonS3 = S3Ops.buildS3Client(config, forceV2Sigs = true)

  def signUrl(bucket: Bucket, url: URI, image: Image, expiration: DateTime = cachableExpiration(), imageType: ImageFileType = Source): String = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)

    val contentDisposition = getContentDisposition(image, imageType, config.shortenDownloadFilename)

    val headers = new ResponseHeaderOverrides().withContentDisposition(contentDisposition)

    val request = new GeneratePresignedUrlRequest(bucket, key).withExpiration(expiration.toDate).withResponseHeaders(headers)
    legacySigningClient.generatePresignedUrl(request).toExternalForm
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
        logger.warn(s"Cannot find key: $key in bucket: $bucket")
        None
    }
    finally {
      stream.close()
    }
  }

  def store(bucket: Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None)
           (implicit ex: ExecutionContext, logMarker: LogMarker): Future[S3Object] =
    Future {
      val metadata = new ObjectMetadata
      mimeType.foreach(m => metadata.setContentType(m.name))
      cacheControl.foreach(metadata.setCacheControl)
      metadata.setUserMetadata(meta.asJava)

      val fileMarkers = Map(
        "bucket" -> bucket,
        "fileName" -> id,
        "mimeType" -> mimeType.getOrElse("none"),
      )
      val markers = logMarker ++ fileMarkers

      val req = new PutObjectRequest(bucket, id, file).withMetadata(metadata)
      Stopwatch(s"S3 client.putObject ($req)"){
        client.putObject(req)
        // once we've completed the PUT read back to ensure that we are returning reality
        val metadata = client.getObjectMetadata(bucket, id)
        S3Object(bucket, id, metadata.getContentLength, S3Metadata(metadata))
      }(markers)
    }

  def storeIfNotPresent(bucket: Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None)
                       (implicit ex: ExecutionContext, logMarker: LogMarker): Future[S3Object] = {
    Future{
      Some(client.getObjectMetadata(bucket, id))
    }.recover {
      // translate this exception into the object not existing
      case as3e:AmazonS3Exception if as3e.getStatusCode == 404 => None
    }.flatMap {
      case Some(objectMetadata) =>
        logger.info(logMarker, s"Skipping storing of S3 file $id as key is already present in bucket $bucket")
        Future.successful(S3Object(bucket, id, objectMetadata.getContentLength, S3Metadata(objectMetadata)))
      case None =>
        store(bucket, id, file, mimeType, meta, cacheControl)
    }
  }

  def list(bucket: Bucket, prefixDir: String)
          (implicit ex: ExecutionContext): Future[List[S3Object]] =
    Future {
      val req = new ListObjectsRequest().withBucketName(bucket).withPrefix(s"$prefixDir/")
      val listing = client.listObjects(req)
      val summaries = listing.getObjectSummaries.asScala
      summaries.map(summary => (summary.getKey, summary)).foldLeft(List[S3Object]()) {
        case (memo: List[S3Object], (key: String, summary: S3ObjectSummary)) =>
          S3Object(bucket, key, summary.getSize, getMetadata(bucket, key)) :: memo
      }
    }

  def getMetadata(bucket: Bucket, key: Key): S3Metadata = {
    val meta = client.getObjectMetadata(bucket, key)
    S3Metadata(meta)
  }

  def getUserMetadata(bucket: Bucket, key: Key): Map[Bucket, Bucket] =
    client.getObjectMetadata(bucket, key).getUserMetadata.asScala.toMap

  def syncFindKey(bucket: Bucket, prefixName: String): Option[Key] = {
    val req = new ListObjectsRequest().withBucketName(bucket).withPrefix(s"$prefixName-")
    val listing = client.listObjects(req)
    val summaries = listing.getObjectSummaries.asScala
    summaries.headOption.map(_.getKey)
  }

}

object S3Ops {
  // TODO make this localstack friendly
  // TODO: Make this region aware - i.e. RegionUtils.getRegion(region).getServiceEndpoint(AmazonS3.ENDPOINT_PREFIX)
  val s3Endpoint = "s3.amazonaws.com"

  def buildS3Client(config: CommonConfig, forceV2Sigs: Boolean = false, localstackAware: Boolean = true, maybeRegionOverride: Option[String] = None): AmazonS3 = {

    val clientConfig = new ClientConfiguration()
    // Option to disable v4 signatures (https://github.com/aws/aws-sdk-java/issues/372) which is required by imgops
    // which proxies direct to S3, passing the AWS security signature as query parameters. This does not work with
    // AWS v4 signatures, presumably because the signature includes the host
    if (forceV2Sigs) clientConfig.setSignerOverride("S3SignerType")

    val builder = config.awsLocalEndpoint match {
      case Some(_) if config.isDev => {
        // TODO revise closer to the time of deprecation https://aws.amazon.com/blogs/aws/amazon-s3-path-deprecation-plan-the-rest-of-the-story/
        //  `withPathStyleAccessEnabled` for localstack
        //  see https://github.com/localstack/localstack/issues/1512
        AmazonS3ClientBuilder.standard().withPathStyleAccessEnabled(true)
      }
      case _ => AmazonS3ClientBuilder.standard().withClientConfiguration(clientConfig)
    }

    config.withAWSCredentials(builder, localstackAware, maybeRegionOverride).build()
  }
}
