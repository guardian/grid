package com.gu.mediaservice.lib.aws

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch}
import com.gu.mediaservice.model._
import org.joda.time.{DateTime, DateTimeZone}
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{GetObjectRequest, GetObjectResponse, HeadObjectRequest, HeadObjectResponse, ListObjectsRequest, ListObjectsV2Request, NoSuchKeyException, PutObjectRequest}
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest

import java.io.File
import java.net.URI
import java.nio.charset.StandardCharsets
import java.time.Duration
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
  def apply(meta: HeadObjectResponse): S3Metadata = {
    S3Metadata(
      meta.metadata().asScala.toMap,
      S3ObjectMetadata(
        contentType = Option(meta.contentType()).filterNot(_.toLowerCase == "application/octet-stream").map(MimeType.apply),
        cacheControl = Option(meta.cacheControl()),
        lastModified = Option(meta.lastModified()).map(l => new DateTime(l.toEpochMilli).withZone(DateTimeZone.UTC))
      )
    )
  }
}

case class S3ObjectMetadata(contentType: Option[MimeType], cacheControl: Option[String], lastModified: Option[DateTime])

class S3(config: CommonConfig) extends GridLogging with ContentDisposition with RoundedExpiration {
  type Bucket = String
  type Key = String
  type UserMetadata = Map[String, String]

  lazy val client: S3Client = S3Ops.buildS3ClientV2(config)

  def signUrl(bucket: Bucket, url: URI, image: Image, imageType: ImageFileType = Source): String = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)

    val contentDisposition = getContentDisposition(image, imageType, config.shortenDownloadFilename)

    val presigner = S3Presigner.create()

    val getObjectRequest = GetObjectRequest.builder.bucket(bucket).key(key)
                            .responseContentDisposition(contentDisposition).build()
    val getObjectPresignRequest =
      GetObjectPresignRequest.builder()
        .getObjectRequest(getObjectRequest)
        .signatureDuration(Duration.ofMinutes(30))
        .build();

    val req = presigner.presignGetObject(getObjectPresignRequest)
    req.url().toExternalForm
  }

  def getObject(bucket: Bucket, url: URI): ResponseInputStream[GetObjectResponse] = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)
    client.getObject(GetObjectRequest.builder().key(key).bucket(bucket).build())
  }
  def getObject(bucket: Bucket, key: String): ResponseInputStream[GetObjectResponse] = {
    client.getObject(GetObjectRequest.builder().key(key).bucket(bucket).build())
  }

  def doesObjectExist(bucket: Bucket, key: String) = {
    try {
      client.headObject(
        HeadObjectRequest.builder().key(key).bucket(bucket).build()
      )
      true
    } catch {
      case _: NoSuchKeyException => false
    }
  }

  def getObjectAsString(bucket: Bucket, key: String): Option[String] = {
    try {
      val stream = client.getObject(GetObjectRequest.builder().key(key).bucket(bucket).build());
      Some(new String(stream.readAllBytes(), StandardCharsets.UTF_8))
    } catch {
      case e: NoSuchKeyException =>
        logger.warn(s"Cannot find key: $key in bucket: $bucket")
        None
    }
  }

  def store(bucket: Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None)
           (implicit ex: ExecutionContext, logMarker: LogMarker): Future[S3Object] =
    Future {

      val fileMarkers = Map(
        "bucket" -> bucket,
        "fileName" -> id,
        "mimeType" -> mimeType.getOrElse("none"),
      )
      val markers = logMarker ++ fileMarkers

      val reqBuilder = PutObjectRequest.builder().key(id).bucket(bucket)
      cacheControl.foreach(c => reqBuilder.cacheControl(c))
      mimeType.foreach(m => reqBuilder.contentType(m.name))
      reqBuilder.metadata(meta.asJava)
      val req = reqBuilder.build()

      Stopwatch(s"S3 client.putObject ($req)"){
        client.putObject(req, RequestBody.fromFile(file))
        // once we've completed the PUT read back to ensure that we are returning reality
        val metadata = client.headObject(
          HeadObjectRequest.builder().key(id).bucket(bucket).build()
        )

        S3Object(bucket, id, metadata.contentLength(), S3Metadata(metadata))
      }(markers)
    }

  def storeIfNotPresent(bucket: Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None)
                       (implicit ex: ExecutionContext, logMarker: LogMarker): Future[S3Object] = {
    Future{
      Some(client.headObject(
        HeadObjectRequest.builder().key(id).bucket(bucket).build()
      ))
    }.recover {
      // translate this exception into the object not existing
      case _: NoSuchKeyException => None
    }.flatMap {
      case Some(metadata) =>
        logger.info(logMarker, s"Skipping storing of S3 file $id as key is already present in bucket $bucket")
        Future.successful(S3Object(bucket, id, metadata.contentLength(), S3Metadata(metadata)))
      case None =>
        store(bucket, id, file, mimeType, meta, cacheControl)
    }
  }

  def list(bucket: Bucket, prefixDir: String)
          (implicit ex: ExecutionContext): Future[List[S3Object]] =
    Future {
      val req = ListObjectsV2Request.builder().bucket(bucket).prefix(s"$prefixDir/").build()
      val listing = client.listObjectsV2(req)
      val s3Objects = listing.contents().asScala.toList
      s3Objects.map(s3Object => {
        S3Object(bucket, s3Object.key(), size = s3Object.size(), metadata = getMetadata(bucket, s3Object.key()))
      })
    }

  def getMetadata(bucket: Bucket, key: Key): S3Metadata = {
    val meta = client.headObject(HeadObjectRequest.builder().key(key).bucket(bucket).build())
    S3Metadata(meta)
  }

  def getUserMetadata(bucket: Bucket, key: Key): Map[Bucket, Bucket] = {
    val meta = client.headObject(HeadObjectRequest.builder().key(key).bucket(bucket).build())
    meta.metadata().asScala.toMap
  }

  def syncFindKey(bucket: Bucket, prefixName: String): Option[Key] = {
    val req = ListObjectsV2Request.builder().bucket(bucket).prefix(s"$prefixName-").build()
    val objects = client.listObjectsV2(req).contents().asScala.toList
    objects.headOption.map(_.key())
  }

}

object S3Ops {
  // TODO make this localstack friendly
  // TODO: Make this region aware - i.e. RegionUtils.getRegion(region).getServiceEndpoint(AmazonS3.ENDPOINT_PREFIX)
  val s3Endpoint = "s3.amazonaws.com"

  def buildS3ClientV2(config: CommonConfig, localstackAware: Boolean = true, maybeRegionOverride: Option[Region] = None): S3Client = {
    val builder = config.awsLocalEndpoint match {
      case Some(_) if config.isDev =>
        S3Client.builder().forcePathStyle(true)
      case _ => S3Client.builder()
    }

    config.withAWSCredentialsV2(builder, localstackAware, maybeRegionOverride).build()
  }
}
