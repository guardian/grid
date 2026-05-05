package com.gu.mediaservice.lib.aws

import com.amazonaws.AmazonServiceException
import com.amazonaws.util.IOUtils
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch}
import com.gu.mediaservice.model._
import software.amazon.awssdk.core.ResponseInputStream
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.{S3Object => S3ObjectSummary, _}
import software.amazon.awssdk.services.s3.presigner.S3Presigner
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest

import java.io.File
import java.net.URI
import java.time.Instant
import scala.concurrent.duration.DurationInt
import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters._
import scala.jdk.DurationConverters.ScalaDurationOps
import scala.language.implicitConversions

case class S3Object(uri: URI, size: Long, metadata: S3Metadata)

object S3Object {
  def objectUrl(bucket: String, key: String): URI = {
    val bucketUrl = s"$bucket.${S3Ops.s3Endpoint}"
    new URI("http", bucketUrl, s"/$key", null)
  }

  def apply(bucket: String, key: String, size: Long, metadata: S3Metadata): S3Object =
    apply(objectUrl(bucket, key), size, metadata)

  def apply(bucket: String, key: String, file: File, mimeType: Option[MimeType], lastModified: Option[Instant],
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
  def fromHeadObjectResponse(hor: HeadObjectResponse): S3Metadata = {
    S3Metadata(
      hor.metadata().asScala.toMap,
      S3ObjectMetadata(
        contentType = Option(hor.contentType()).filterNot(_.toLowerCase == "application/octet-stream").map(MimeType.apply),
        cacheControl = Option(hor.cacheControl()),
        lastModified = Option(hor.lastModified())
      )
    )
  }
}

case class S3ObjectMetadata(contentType: Option[MimeType], cacheControl: Option[String], lastModified: Option[Instant])

class S3(config: CommonConfig) extends GridLogging with ContentDisposition with RoundedExpiration with S3Ops {
  type Bucket = String
  type Key = String
  type UserMetadata = Map[String, String]

  lazy val client: S3Client = S3Ops.buildS3Client(config)
  lazy val presigner = S3Presigner.create()

  def signUrl(bucket: Bucket, url: URI, image: Image, imageType: ImageFileType = Source): String = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)

    val contentDisposition = getContentDisposition(image, imageType, config.shortenDownloadFilename)

    val objReq = GetObjectRequest.builder().bucket(bucket).key(key).responseContentDisposition(contentDisposition).build()
    val requestt = GetObjectPresignRequest.builder().getObjectRequest(objReq).signatureDuration(10.minutes.toJava).build()

    presigner.presignGetObject(requestt).url().toExternalForm
  }

  def getObject(bucket: Bucket, url: URI): ResponseInputStream[GetObjectResponse] = {
    // get path and remove leading `/`
    val key: Key = url.getPath.drop(1)
    client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())
  }

  def getObjectAsString(bucket: Bucket, key: String): Option[String] = {

    val content = client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())
    try {
      Some(IOUtils.toString(content).trim)
    } catch {
      case e: AmazonServiceException if e.getErrorCode == "NoSuchKey" =>
        logger.warn(s"Cannot find key: $key in bucket: $bucket")
        None
    }
    finally {
      content.close()
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

      val req = {
        val builder = PutObjectRequest.builder().bucket(bucket).key(id).metadata(meta.asJava)
        mimeType.foreach(mime => builder.contentType(mime.name))
        cacheControl.foreach(builder.cacheControl)
        builder.build()
      }

      Stopwatch(s"S3 client.putObject ($req)"){
        client.putObject(req, RequestBody.fromFile(file))
        // once we've completed the PUT read back to ensure that we are returning reality
        val response = client.headObject(HeadObjectRequest.builder().bucket(bucket).key(id).build())
        S3Object(bucket, id, response.contentLength(), S3Metadata.fromHeadObjectResponse(response))
      }(markers)
    }

  def storeIfNotPresent(bucket: Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None)
                       (implicit ex: ExecutionContext, logMarker: LogMarker): Future[S3Object] = {
    Future {
      Some(client.headObject(HeadObjectRequest.builder().bucket(bucket).key(id).build()))
    }.recover {
      // translate this exception into the object not existing
      case as3e: S3Exception if as3e.statusCode() == 404 => None
    }.flatMap {
      case Some(objectMetadata) =>
        logger.info(logMarker, s"Skipping storing of S3 file $id as key is already present in bucket $bucket")
        Future.successful(S3Object(bucket, id, objectMetadata.contentLength(), S3Metadata.fromHeadObjectResponse(objectMetadata)))
      case None =>
        store(bucket, id, file, mimeType, meta, cacheControl)
    }
  }

  def list(bucket: Bucket, prefixDir: String)
          (implicit ex: ExecutionContext): Future[List[S3Object]] =
    Future {
      val req = ListObjectsRequest.builder().bucket(bucket).prefix(s"$prefixDir/").build()
      val listing = client.listObjects(req)
      val summaries = listing.contents().asScala
      summaries.map(summary => (summary.key(), summary)).foldLeft(List[S3Object]()) {
        case (memo: List[S3Object], (key: String, summary: S3ObjectSummary)) =>
          S3Object(bucket, key, summary.size(), getMetadata(bucket, key)) :: memo
      }
    }

  def getMetadata(bucket: Bucket, key: Key): S3Metadata = {
    val resp = client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
    S3Metadata.fromHeadObjectResponse(resp)
  }

  def getUserMetadata(bucket: Bucket, key: Key): Map[Bucket, Bucket] =
    client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build()).metadata().asScala.toMap
}

trait S3Ops {
  val client: S3Client

  def doesObjectExist(bucket: String, key: String): Boolean =
    try {
      client.headObject(HeadObjectRequest.builder().bucket(bucket).key(key).build())
      true
    } catch {
      case _: NoSuchKeyException => false
    }

  def getObject(bucket: String, key: String): ResponseInputStream[GetObjectResponse] = {
    client.getObject(GetObjectRequest.builder().bucket(bucket).key(key).build())
  }

  def copyObject(fromBucket: String, fromKey: String, toBucket: String, toKey: String): CopyObjectResponse = {
    client.copyObject(CopyObjectRequest.builder()
      .sourceBucket(fromBucket).sourceKey(fromKey)
      .destinationBucket(toBucket).destinationKey(toKey)
      .build()
    )
  }

  def listObjects(bucket: String): Seq[S3ObjectSummary] = {
    client.listObjectsV2(
      ListObjectsV2Request.builder().bucket(bucket).build()
    ).contents().asScala.toList
  }

  def listObjects(bucket: String, prefix: String): Seq[S3ObjectSummary] = {
    client.listObjectsV2(
      ListObjectsV2Request.builder().bucket(bucket).prefix(prefix).build()
    ).contents().asScala.toList
  }

  def deleteObject(bucket: String, key: String): DeleteObjectResponse = {
    client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build())
  }

  def putObject(bucket: String, key: String, contents: String): PutObjectResponse = {
    client.putObject(
      PutObjectRequest.builder().bucket(bucket).key(key).build(),
      RequestBody.fromString(contents)
    )
  }
}

object S3Ops {
  // TODO make this localstack friendly
  // TODO: Make this region aware - i.e. RegionUtils.getRegion(region).getServiceEndpoint(AmazonS3.ENDPOINT_PREFIX)
  val s3Endpoint = "s3.amazonaws.com"

  def apply(_client: S3Client): S3Ops = {
    new S3Ops {
      override val client: S3Client = _client
    }
  }
  def buildS3Client(
    config: CommonConfig,
    localstackAware: Boolean = true,
    maybeRegionOverride: Option[Region] = None
  ): S3Client = {
    val builder = config.awsLocalEndpoint match {
      case Some(_) if config.isDev =>
        // TODO revise closer to the time of deprecation https://aws.amazon.com/blogs/aws/amazon-s3-path-deprecation-plan-the-rest-of-the-story/
        //  `withPathStyleAccessEnabled` for localstack
        //  see https://github.com/localstack/localstack/issues/1512
        S3Client.builder().forcePathStyle(true)
      case _ => S3Client.builder()
    }

    config.withAWSCredentialsV2(builder, localstackAware, maybeRegionOverride).build()
  }
}
