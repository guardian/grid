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
import java.net.{URI, URL}
import scala.jdk.CollectionConverters._
import scala.concurrent.{ExecutionContext, Future}

case class S3Object(uri: URI, size: Long, metadata: S3Metadata)

object S3Object {
  private def objectUrl(bucket: String, key: String, s3Endpoint: String): URI = {
    val bucketUrl = s"$bucket.$s3Endpoint"
    new URI("http", bucketUrl, s"/$key", null)
  }

  def apply(bucket: String, key: String, size: Long, metadata: S3Metadata, s3Endpoint: String): S3Object =
    apply(objectUrl(bucket, key, s3Endpoint), size, metadata)

  def apply(bucket: String, key: String, file: File, mimeType: Option[MimeType], lastModified: Option[DateTime],
            meta: Map[String, String] = Map.empty, cacheControl: Option[String] = None, s3Endpoint: String): S3Object = {
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
      ),
      s3Endpoint
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

  private lazy val client: AmazonS3 = S3Ops.buildS3Client(config)
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

  def signUrlTony(bucket: Bucket, url: URI, expiration: DateTime = cachableExpiration()): URL = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)

    val request = new GeneratePresignedUrlRequest(bucket, key).withExpiration(expiration.toDate)
    legacySigningClient.generatePresignedUrl(request)
  }

  def copyObject(sourceBucket: Bucket, destinationBucket: Bucket, key: String): CopyObjectResult = {
    client.copyObject(sourceBucket, key, destinationBucket, key)
  }

  def generatePresignedRequest(request: GeneratePresignedUrlRequest): URL = {
    client.generatePresignedUrl(request)
  }

  def deleteObject(bucket: Bucket, key: String): Unit = {
    client.deleteObject(bucket, key)
  }

  def deleteObjects(bucket: Bucket, keys: Seq[Bucket]): DeleteObjectsResult = {
    client.deleteObjects(
      new DeleteObjectsRequest(bucket).withKeys(keys: _*)
    )
  }

  def deleteVersion(bucket: Bucket, id: Bucket, objectVersion: Bucket): Unit = {
    client.deleteVersion(bucket, id, objectVersion)
  }

  def doesObjectExist(bucket: Bucket, key: String) = {
    client.doesObjectExist(bucket, key)
  }

  def getObject(bucket: Bucket, url: URI): model.S3Object = { // TODO why can't this just be by bucket + key to remove end point knowledge
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)
    client.getObject(new GetObjectRequest(bucket, key))
  }

  def getObject(bucket: Bucket, key: String): model.S3Object = {
    client.getObject(new GetObjectRequest(bucket, key))
  }

  def getObject(bucket: Bucket, obj: S3ObjectSummary): model.S3Object = {
    client.getObject(bucket, obj.getKey)
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

  def getObjectMetadata(bucket: Bucket, id: Bucket): ObjectMetadata = {
    client.getObjectMetadata(bucket, id)
  }

  def listObjects(bucket: String): ObjectListing = {
    client.listObjects(bucket)
  }

  def listObjects(bucket: String, prefix: String): ObjectListing = {
    client.listObjects(bucket, prefix)
  }

  def listObjectKeys(bucket: String): Seq[String] = {
    client.listObjects(bucket).getObjectSummaries.asScala.map(_.getKey).toSeq
  }

  def putObject(bucket: String, key: String, content: String): Unit = {
    client.putObject(bucket, key, content)
  }

  def store(bucket: Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None, s3Endpoint: String)
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
        S3Object(bucket, id, metadata.getContentLength, S3Metadata(metadata), s3Endpoint)
      }(markers)
    }

  def storeIfNotPresent(bucket: Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None, s3Endpoint: String)
                       (implicit ex: ExecutionContext, logMarker: LogMarker): Future[S3Object] = {
    Future{
      Some(client.getObjectMetadata(bucket, id))
    }.recover {
      // translate this exception into the object not existing
      case as3e:AmazonS3Exception if as3e.getStatusCode == 404 => None
    }.flatMap {
      case Some(objectMetadata) =>
        logger.info(logMarker, s"Skipping storing of S3 file $id as key is already present in bucket $bucket")
        Future.successful(S3Object(bucket, id, objectMetadata.getContentLength, S3Metadata(objectMetadata), s3Endpoint))
      case None =>
        store(bucket, id, file, mimeType, meta, cacheControl, s3Endpoint)
    }
  }

  def list(bucket: Bucket, prefixDir: String, s3Endpoint: String)
          (implicit ex: ExecutionContext): Future[List[S3Object]] =
    Future {
      val req = new ListObjectsRequest().withBucketName(bucket).withPrefix(s"$prefixDir/")
      val listing = client.listObjects(req)
      val summaries = listing.getObjectSummaries.asScala
      summaries.map(summary => (summary.getKey, summary)).foldLeft(List[S3Object]()) {
        case (memo: List[S3Object], (key: String, summary: S3ObjectSummary)) =>
          S3Object(bucket, key, summary.getSize, getMetadata(bucket, key), s3Endpoint) :: memo
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
