package model

import java.io.File

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.{StorableOptimisedImage, StorableOriginalImage, StorableThumbImage}
import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.cleanup.MetadataCleaners
import com.gu.mediaservice.lib.config.MetadataConfig
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import lib.{ImageLoaderConfig, Notifications}
import lib.storage.ImageLoaderStore
import model.upload.UploadRequest
import play.api.libs.json.{JsObject, Json}

import scala.concurrent.{ExecutionContext, Future}

case class ImageUpload(uploadRequest: UploadRequest, image: Image)

case object ImageUpload {
  val metadataCleaners = new MetadataCleaners(MetadataConfig.allPhotographersMap)

  def createImage(uploadRequest: UploadRequest, source: Asset, thumbnail: Asset, png: Option[Asset],
                  fileMetadata: FileMetadata, metadata: ImageMetadata): Image = {
    val usageRights = NoRights
    Image(
      uploadRequest.imageId,
      uploadRequest.uploadTime,
      uploadRequest.uploadedBy,
      Some(uploadRequest.uploadTime),
      uploadRequest.identifiers,
      uploadRequest.uploadInfo,
      source,
      Some(thumbnail),
      png,
      fileMetadata,
      None,
      metadata,
      metadata,
      usageRights,
      usageRights,
      List(),
      List()
    )
  }
}

case class ImageUploadOpsCfg(
  tempDir: File,
  thumbWidth: Int,
  thumbQuality: Double,
  transcodedMimeTypes: List[MimeType],
  originalFileBucket: String,
  thumbBucket: String
)

class Uploader(val store: ImageLoaderStore,
               val config: ImageLoaderConfig,
               val imageOps: ImageOperations,
               val notifications: Notifications)
              (implicit val ec: ExecutionContext) extends ArgoHelpers with ImageUploadProcessor {

  def name = "image-load"
  def fromUploadRequest(uploadRequest: UploadRequest)
                       (implicit logMarker: LogMarker): Future[ImageUpload] = {
    val sideEffectDependencies = ImageUploadOpsDependencies(
      toImageUploadOpsCfg(config),
      imageOps,
      storeSource,
      storeThumbnail,
      storeOptimisedImage,
      getInitialEmptyUsages,
      getInitialEmptyCollections,
      getInitialEmptyLeases,
      getInitialEmptyCrops)
    val finalImage = fromUploadRequestShared(uploadRequest, sideEffectDependencies, config.imageProcessor)
    finalImage.map(img => Stopwatch("finalImage"){ImageUpload(uploadRequest, img)})
  }

  private def getInitialEmptyUsages(s: String)
                                   (implicit logMarker: LogMarker):Future[List[Usage]] = Future.successful(Nil)

  private def getInitialEmptyCollections(s: String)
                                   (implicit logMarker: LogMarker):Future[List[Collection]] = Future.successful(Nil)

  private def getInitialEmptyCrops(s: String)
                                  (implicit logMarker: LogMarker):Future[List[Crop]] = Future.successful(Nil)

  private def getInitialEmptyLeases(s: String)
                                   (implicit logMarker: LogMarker):Future[LeasesByMedia] = Future.successful(LeasesByMedia.empty)

  private def storeSource(storableOriginalImage: StorableOriginalImage)
                         (implicit logMarker: LogMarker) = store.store(storableOriginalImage)

  private def storeThumbnail(storableThumbImage: StorableThumbImage)
                            (implicit logMarker: LogMarker) = store.store(storableThumbImage)

  private def storeOptimisedImage(storableOptimisedImage: StorableOptimisedImage)
                                 (implicit logMarker: LogMarker) = store.store(storableOptimisedImage)

  def storeFile(uploadRequest: UploadRequest)
               (implicit ec:ExecutionContext,
                logMarker: LogMarker): Future[JsObject] = {

    logger.info("Storing file")

    for {
      imageUpload <- fromUploadRequest(uploadRequest)
      updateMessage = UpdateMessage(subject = "image", image = Some(imageUpload.image))
      _ <- Future { notifications.publish(updateMessage) }
      // TODO: centralise where all these URLs are constructed
      uri = s"${config.apiUri}/images/${uploadRequest.imageId}"
    } yield {
      Json.obj("uri" -> uri)
    }

  }

}

