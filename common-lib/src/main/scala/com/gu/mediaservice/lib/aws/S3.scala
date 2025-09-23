package com.gu.mediaservice.lib.aws

import com.amazonaws.auth.{AWSStaticCredentialsProvider, BasicAWSCredentials}
import com.amazonaws.client.builder.AwsClientBuilder.EndpointConfiguration
import com.amazonaws.services.s3.model._
import com.amazonaws.services.s3.{AmazonS3, AmazonS3ClientBuilder, model}
import com.amazonaws.util.IOUtils
import com.amazonaws.{AmazonServiceException, ClientConfiguration}
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch}
import com.gu.mediaservice.model._
import org.joda.time.DateTime

import java.io.File
import java.net.{URI, URL}
import scala.jdk.CollectionConverters._
import scala.concurrent.{ExecutionContext, Future}

case class S3Object(uri: URI, size: Long, metadata: S3Metadata)

object S3Object {

  def apply(bucket: S3Bucket, key: String, size: Long, metadata: S3Metadata): S3Object =
    apply(bucket.objectUrl(key), size, metadata)

  def apply(bucket: S3Bucket, key: String, file: File, mimeType: Option[MimeType], lastModified: Option[DateTime],
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
  type Key = String
  type UserMetadata = Map[String, String]

  val AmazonAwsS3Endpoint: String = S3.AmazonAwsS3Endpoint

  private val amazonS3: AmazonS3 = S3Ops.buildS3Client(config)
  private val googleS3: Option[AmazonS3] = S3Ops.buildGoogleS3Client(config)
  private val localS3: Option[AmazonS3] = S3Ops.buildLocalS3Client(config)

  private def clientFor(bucket: S3Bucket): AmazonS3 = {
    (bucket.endpoint match {
      case "storage.googleapis.com" =>
        googleS3
      case "minio.griddev.eelpieconsulting.co.uk" =>
        localS3
      case _ =>
        Some(amazonS3)
    }).getOrElse {
      amazonS3
    }
  }

  def signUrl(bucket: S3Bucket, key: String, image: Image, expiration: DateTime = cachableExpiration(), imageType: ImageFileType = Source): String = {
    val contentDisposition = getContentDisposition(image, imageType, config.shortenDownloadFilename)

    val headers = new ResponseHeaderOverrides().withContentDisposition(contentDisposition)

    val request = new GeneratePresignedUrlRequest(bucket.bucket, key).withExpiration(expiration.toDate).withResponseHeaders(headers)
    clientFor(bucket).generatePresignedUrl(request).toExternalForm
  }

  def signUrlTony(bucket: S3Bucket, key: String, expiration: DateTime = cachableExpiration()): URL = {
    val request = new GeneratePresignedUrlRequest(bucket.bucket, key).withExpiration(expiration.toDate)
    clientFor(bucket).generatePresignedUrl(request)
  }

  def copyObject(sourceBucket: S3Bucket, destinationBucket: S3Bucket, key: String): CopyObjectResult = {
    clientFor(sourceBucket).copyObject(sourceBucket.bucket, key, destinationBucket.bucket, key)
  }

  def generatePresignedRequest(request: GeneratePresignedUrlRequest, bucket: S3Bucket): URL = {
    clientFor(bucket).generatePresignedUrl(request)
  }

  def deleteObject(bucket: S3Bucket, key: String): Unit = {
    clientFor(bucket).deleteObject(bucket.bucket, key)
  }

  def deleteObjects(bucket: S3Bucket, keys: Seq[String]): DeleteObjectsResult = {
    clientFor(bucket).deleteObjects(
      new DeleteObjectsRequest(bucket.bucket).withKeys(keys: _*)
    )
  }

  def deleteVersion(bucket: S3Bucket, id: String, objectVersion: String): Unit = {
    clientFor(bucket).deleteVersion(bucket.bucket, id, objectVersion)
  }

  def doesObjectExist(bucket: S3Bucket, key: String) = {
    clientFor(bucket).doesObjectExist(bucket.bucket, key)
  }

  def getObject(bucket: S3Bucket, key: String): model.S3Object = {
    clientFor(bucket).getObject(new GetObjectRequest(bucket.bucket, key))
  }

  def getObject(bucket: S3Bucket, obj: S3ObjectSummary): model.S3Object = {
    clientFor(bucket).getObject(bucket.bucket, obj.getKey)
  }

  def getObjectAsString(bucket: S3Bucket, key: String): Option[String] = {
    val content = clientFor(bucket).getObject(new GetObjectRequest(bucket.bucket, key))
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

  def getObjectMetadata(bucket: S3Bucket, id: String): ObjectMetadata = {
    clientFor(bucket).getObjectMetadata(bucket.bucket, id)
  }

  def listObjects(bucket: S3Bucket): ObjectListing = {
    clientFor(bucket).listObjects(bucket.bucket)
  }

  def listObjects(bucket: S3Bucket, prefix: String): ObjectListing = {
    clientFor(bucket).listObjects(bucket.bucket, prefix)
  }

  def listObjects(bucket: S3Bucket, request: ListObjectsRequest): ObjectListing = {
    clientFor(bucket).listObjects(request)
  }

  def listObjectKeys(bucket: S3Bucket): Seq[String] = {
    clientFor(bucket).listObjects(bucket.bucket).getObjectSummaries.asScala.map(_.getKey).toSeq
  }

  def putObject(bucket: S3Bucket, key: String, content: String): Unit = {
    clientFor(bucket).putObject(bucket.bucket, key, content)
  }

  def store(bucket: S3Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None)
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

      val req = new PutObjectRequest(bucket.bucket, id, file).withMetadata(metadata)
      Stopwatch(s"S3 client.putObject ($req)"){
        val client = clientFor(bucket)
        client.putObject(req)
        // once we've completed the PUT read back to ensure that we are returning reality
        val metadata = client.getObjectMetadata(bucket.bucket, id)
        S3Object(bucket, id, metadata.getContentLength, S3Metadata(metadata))
      }(markers)
    }

  def storeIfNotPresent(bucket: S3Bucket, id: Key, file: File, mimeType: Option[MimeType], meta: UserMetadata = Map.empty, cacheControl: Option[String] = None)
                       (implicit ex: ExecutionContext, logMarker: LogMarker): Future[S3Object] = {
    Future{
      Some(clientFor(bucket).getObjectMetadata(bucket.bucket, id))
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

  def list(bucket: S3Bucket, prefixDir: String)
          (implicit ex: ExecutionContext): Future[List[S3Object]] =
    Future {
      val req = new ListObjectsRequest().withBucketName(bucket.bucket).withPrefix(s"$prefixDir/")
      val listing = clientFor(bucket).listObjects(req)
      val summaries = listing.getObjectSummaries.asScala
      summaries.map(summary => (summary.getKey, summary)).foldLeft(List[S3Object]()) {
        case (memo: List[S3Object], (key: String, summary: S3ObjectSummary)) =>
          S3Object(bucket, key, summary.getSize, getMetadata(bucket, key)) :: memo
      }
    }

  def getMetadata(bucket: S3Bucket, key: Key): S3Metadata = {
    val meta = clientFor(bucket).getObjectMetadata(bucket.bucket, key)
    S3Metadata(meta)
  }

  def getUserMetadata(bucket: S3Bucket, key: Key): Map[String, String] =
    clientFor(bucket).getObjectMetadata(bucket.bucket, key).getUserMetadata.asScala.toMap

  def syncFindKey(bucket: S3Bucket, prefixName: String): Option[Key] = {
    val req = new ListObjectsRequest().withBucketName(bucket.bucket).withPrefix(s"$prefixName-")
    val listing = clientFor(bucket).listObjects(req)
    val summaries = listing.getObjectSummaries.asScala
    summaries.headOption.map(_.getKey)
  }

}

object S3Ops {
  def buildGoogleS3Client(config: CommonConfig): Option[AmazonS3] = {
    config.googleS3AccessKey.flatMap { accessKey =>
      config.googleS3SecretKey.map { secretKey =>
        val endpointConfig = new EndpointConfiguration("https://storage.googleapis.com", null)
        // create credentials provider
        val credentials = new BasicAWSCredentials(accessKey, secretKey)
        val credentialsProvider = new AWSStaticCredentialsProvider(credentials)
        // create a client config
        val clientConfig = new ClientConfiguration()

        val clientBuilder = AmazonS3ClientBuilder.standard()
        clientBuilder.setEndpointConfiguration(endpointConfig)
        clientBuilder.withCredentials(credentialsProvider)
        clientBuilder.withClientConfiguration(clientConfig)
        clientBuilder.build()
      }
    }
  }

  def buildLocalS3Client(config: CommonConfig): Option[AmazonS3] = {
    config.googleS3AccessKey.flatMap { accessKey =>
      config.googleS3SecretKey.map { secretKey =>
        val endpointConfig = new EndpointConfiguration("https://minio.griddev.eelpieconsulting.co.uk", null)
        // create credentials provider
        val credentials = new BasicAWSCredentials(accessKey, secretKey)
        val credentialsProvider = new AWSStaticCredentialsProvider(credentials)
        // create a client config
        val clientConfig = new ClientConfiguration()

        val clientBuilder = AmazonS3ClientBuilder.standard()
        clientBuilder.setEndpointConfiguration(endpointConfig)
        clientBuilder.withCredentials(credentialsProvider)
        clientBuilder.withClientConfiguration(clientConfig)
        clientBuilder.withPathStyleAccessEnabled(true)
        clientBuilder.build()
      }
    }
  }

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

object S3 {
  val AmazonAwsS3Endpoint: String = "s3.amazonaws.com"
}
