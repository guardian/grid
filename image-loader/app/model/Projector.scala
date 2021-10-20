package model

import java.io.{File, FileOutputStream}
import java.util.UUID
import com.amazonaws.services.s3.AmazonS3
import com.gu.mediaservice.{GridClient, ImageDataMerger}
import com.gu.mediaservice.lib.auth.Authentication
import com.amazonaws.services.s3.model.{GetObjectRequest, ObjectMetadata, S3Object => AwsS3Object}
import com.gu.mediaservice.lib.ImageIngestOperations.{fileKeyFromId, optimisedPngKeyFromId}
import com.gu.mediaservice.lib.{ImageIngestOperations, ImageStorageProps, StorableOptimisedImage, StorableOriginalImage, StorableThumbImage}
import com.gu.mediaservice.lib.aws.S3Ops
import com.gu.mediaservice.lib.aws.S3Object
import com.gu.mediaservice.lib.cleanup.ImageProcessor
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker, Stopwatch}
import com.gu.mediaservice.lib.net.URI
import com.gu.mediaservice.model.{Image, MimeType, UploadInfo}
import lib.imaging.{MimeTypeDetection, NoSuchImageExistsInS3}
import lib.{DigestedFile, ImageLoaderConfig}
import model.upload.UploadRequest
import org.apache.tika.io.IOUtils
import org.joda.time.{DateTime, DateTimeZone}
import play.api.Logger
import play.api.libs.ws.WSRequest

import scala.collection.JavaConverters._
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, ExecutionContext, Future}

object Projector {

  import Uploader.toImageUploadOpsCfg

  def apply(config: ImageLoaderConfig, imageOps: ImageOperations, processor: ImageProcessor, auth: Authentication)(implicit ec: ExecutionContext): Projector
  = new Projector(toImageUploadOpsCfg(config), S3Ops.buildS3Client(config), imageOps, processor, auth)
}

case class S3FileExtractedMetadata(
  uploadedBy: String,
  uploadTime: DateTime,
  uploadFileName: Option[String],
  identifiers: Map[String, String]
)

object S3FileExtractedMetadata {
  def apply(s3ObjectMetadata: ObjectMetadata): S3FileExtractedMetadata = {
    val lastModified = new DateTime(s3ObjectMetadata.getLastModified)
    val userMetadata = s3ObjectMetadata.getUserMetadata.asScala.toMap
    apply(lastModified, userMetadata)
  }

  def apply(lastModified: DateTime, userMetadata: Map[String, String]): S3FileExtractedMetadata = {
    val fileUserMetadata = userMetadata.map { case (key, value) =>
      // Fix up the contents of the metadata.
      (
        // The keys used to be named with underscores instead of dashes but due to localstack being written in Python
        // this didn't work locally (see https://github.com/localstack/localstack/issues/459)
        key.replaceAll("_", "-"),
        // The values are now all URL encoded and it is assumed safe to decode historical values too (based on the tested corpus)
        URI.decode(value)
      )
    }

    val uploadedBy = fileUserMetadata.getOrElse(ImageStorageProps.uploadedByMetadataKey, "re-ingester")
    val uploadedTimeRaw = fileUserMetadata.get(ImageStorageProps.uploadTimeMetadataKey).map(new DateTime(_).withZone(DateTimeZone.UTC))
    val uploadTime = uploadedTimeRaw.getOrElse(lastModified)
    val identifiers = fileUserMetadata.filter{ case (key, _) =>
      key.startsWith(ImageStorageProps.identifierMetadataKeyPrefix)
    }.map{ case (key, value) =>
      key.stripPrefix(ImageStorageProps.identifierMetadataKeyPrefix) -> value
    }

    val uploadFileName = fileUserMetadata.get(ImageStorageProps.filenameMetadataKey)

    S3FileExtractedMetadata(
      uploadedBy = uploadedBy,
      uploadTime = uploadTime,
      uploadFileName = uploadFileName,
      identifiers = identifiers,
    )
  }
}

class Projector(config: ImageUploadOpsCfg,
                s3: AmazonS3,
                imageOps: ImageOperations,
                processor: ImageProcessor,
                auth: Authentication) extends GridLogging {

  private val imageUploadProjectionOps = new ImageUploadProjectionOps(config, imageOps, processor, s3)

  def projectS3ImageById(imageId: String, tempFile: File, requestId: UUID, gridClient: GridClient, onBehalfOfFn: WSRequest => WSRequest)
                        (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Option[Image]] = {
    Future {
      import ImageIngestOperations.fileKeyFromId
      val s3Key = fileKeyFromId(imageId)

      if (!s3.doesObjectExist(config.originalFileBucket, s3Key))
        throw new NoSuchImageExistsInS3(config.originalFileBucket, s3Key)

      val s3Source = Stopwatch(s"object exists, getting s3 object at s3://${config.originalFileBucket}/$s3Key to perform Image projection"){
        s3.getObject(config.originalFileBucket, s3Key)
      }(logMarker)

      try {
        val digestedFile = getSrcFileDigestForProjection(s3Source, imageId, tempFile)
        val extractedS3Meta = S3FileExtractedMetadata(s3Source.getObjectMetadata)

        val finalImageFuture = projectImage(digestedFile, extractedS3Meta, requestId, gridClient, onBehalfOfFn)
        val finalImage = Await.result(finalImageFuture, Duration.Inf)

        Some(finalImage)
      } finally {
        s3Source.close()
      }
    }
  }

  private def getSrcFileDigestForProjection(s3Src: AwsS3Object, imageId: String, tempFile: File) = {
    val fos = new FileOutputStream(tempFile)
    try {
      IOUtils.copy(s3Src.getObjectContent, fos)
      DigestedFile(tempFile, imageId)
    } finally {
      fos.close()
    }
  }

  def projectImage(srcFileDigest: DigestedFile,
                   extractedS3Meta: S3FileExtractedMetadata,
                   requestId: UUID,
                   gridClient: GridClient,
                   onBehalfOfFn: WSRequest => WSRequest)
                  (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Image] = {
    val DigestedFile(tempFile_, id_) = srcFileDigest

    val identifiers_ = extractedS3Meta.identifiers
    val uploadInfo_ = UploadInfo(filename = extractedS3Meta.uploadFileName)

    MimeTypeDetection.guessMimeType(tempFile_) match {
      case util.Left(unsupported) => Future.failed(unsupported)
      case util.Right(mimeType) =>
        val uploadRequest = UploadRequest(
          requestId = requestId,
          imageId = id_,
          tempFile = tempFile_,
          mimeType = Some(mimeType),
          uploadTime = extractedS3Meta.uploadTime,
          uploadedBy = extractedS3Meta.uploadedBy,
          identifiers = identifiers_,
          uploadInfo = uploadInfo_
        )

        imageUploadProjectionOps.projectImageFromUploadRequest(uploadRequest) flatMap (
          image => ImageDataMerger.aggregate(image, gridClient, onBehalfOfFn)
        )
    }
  }
}

class ImageUploadProjectionOps(config: ImageUploadOpsCfg,
                               imageOps: ImageOperations,
                               processor: ImageProcessor,
                               s3: AmazonS3
) extends GridLogging {

  import Uploader.{fromUploadRequestShared, toMetaMap}


  def projectImageFromUploadRequest(uploadRequest: UploadRequest)
                                   (implicit ec: ExecutionContext, logMarker: LogMarker): Future[Image] = {
    val dependenciesWithProjectionsOnly = ImageUploadOpsDependencies(
      config,
      imageOps,
      projectOriginalFileAsS3Model,
      projectThumbnailFileAsS3Model,
      projectOptimisedPNGFileAsS3Model,
      tryFetchThumbFile = fetchThumbFile,
      tryFetchOptimisedFile = fetchOptimisedFile,
    )

    fromUploadRequestShared(uploadRequest, dependenciesWithProjectionsOnly, processor)
  }

  private def projectOriginalFileAsS3Model(storableOriginalImage: StorableOriginalImage) =
    Future.successful(storableOriginalImage.toProjectedS3Object(config.originalFileBucket))

  private def projectThumbnailFileAsS3Model(storableThumbImage: StorableThumbImage) =
    Future.successful(storableThumbImage.toProjectedS3Object(config.thumbBucket))

  private def projectOptimisedPNGFileAsS3Model(storableOptimisedImage: StorableOptimisedImage) =
    Future.successful(storableOptimisedImage.toProjectedS3Object(config.originalFileBucket))

  private def fetchThumbFile(
    imageId: String, outFile: File
  )(implicit ec: ExecutionContext, logMarker: LogMarker): Future[Option[(File, MimeType)]] = {
    val key = fileKeyFromId(imageId)

    fetchFile(config.thumbBucket, key, outFile)
  }

  private def fetchOptimisedFile(
    imageId: String, outFile: File
  )(implicit ec: ExecutionContext, logMarker: LogMarker): Future[Option[(File, MimeType)]] = {
    val key = optimisedPngKeyFromId(imageId)

    fetchFile(config.originalFileBucket, key, outFile)
  }

  private def fetchFile(
    bucket: String, key: String, outFile: File
  )(implicit ec: ExecutionContext, logMarker: LogMarker): Future[Option[(File, MimeType)]] = {
    logger.info(logMarker, s"Trying fetch existing image from S3 bucket - $bucket at key $key")
    val doesFileExist = Future { s3.doesObjectExist(bucket, key) } recover { case _ => false }
    doesFileExist.flatMap {
      case false =>
        logger.warn(logMarker, s"image did not exist in bucket $bucket at key $key")
        Future.successful(None) // falls back to creating from original file
      case true =>
        val obj = s3.getObject(new GetObjectRequest(bucket, key))
        val fos = new FileOutputStream(outFile)
        try {
          IOUtils.copy(obj.getObjectContent, fos)
        } finally {
          fos.close()
          obj.close()
        }

        MimeTypeDetection.guessMimeType(outFile) match {
          case Right(mimeType) => Future.successful(Some((outFile, mimeType)))
          case Left(e) => Future.failed(e)
        }
    }
  }

}
