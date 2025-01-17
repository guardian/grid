package lib

import java.io.File
import java.net.{URI, URL}
import scala.concurrent.Future
import com.gu.mediaservice.lib.S3ImageStorage
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model._

class CropStore(config: CropperConfig) extends S3ImageStorage(config) with CropSpecMetadata {
  import com.gu.mediaservice.lib.formatting._

  def getSecureCropUri(uri: URI): Option[URL] =
    config.imgPublishingSecureHost.map(new URI("https", _, uri.getPath, uri.getFragment).toURL)

  def storeCropSizing(file: File, filename: String, mimeType: MimeType, crop: Crop, dimensions: Dimensions)(implicit logMarker: LogMarker): Future[Asset] = {
    val metadata = metadataForCrop(crop, dimensions)
    storeImage(config.imgPublishingBucket, filename, file, Some(mimeType), metadata, overwrite = true) map { s3Object =>
      Asset(
        translateImgHost(s3Object.uri),
        Some(s3Object.size),
        s3Object.metadata.objectMetadata.contentType,
        Some(dimensions),
        getSecureCropUri(s3Object.uri)
      )
    }
  }

  def listCrops(id: String, instance: Instance): Future[List[Crop]] = {
    list(config.imgPublishingBucket, folderForImagesCrops(id, instance)).map { crops => // TODO crops layout want to be pull up
      crops.foldLeft(Map[String, Crop]()) {
        case (map, (s3Object)) => {
          val filename::containingFolder::_ = s3Object.uri.getPath.split("/").reverse.toList
          val isMaster = containingFolder == "master"
          val userMetadata   = s3Object.metadata.userMetadata
          val objectMetadata = s3Object.metadata.objectMetadata

          val updatedCrop = for {
            cropSource <- cropSpecFromMetadata(userMetadata)
            x = cropSource.bounds.x
            y = cropSource.bounds.y
            w = cropSource.bounds.width
            h = cropSource.bounds.height
            width <- userMetadata.get("width").map(_.toInt)
            height <- userMetadata.get("height").map(_.toInt)

            cid            = s"$id-$x-$y-$w-$h"
            author         = userMetadata.get("author")
            date           = userMetadata.get("date").flatMap(parseDateTime)
            dimensions     = Dimensions(width, height)

            sizing         =
              Asset(
                signedCropAssetUrl(s3Object.uri),
                Some(s3Object.size),
                objectMetadata.contentType,
                Some(dimensions),
                getSecureCropUri(s3Object.uri)
              )
            lastCrop       = map.getOrElse(cid, Crop.createFromCropSource(author, date, cropSource))
            lastSizings    = lastCrop.assets

            currentSizings = if (isMaster) lastSizings else lastSizings :+ sizing
            masterSizing   = if (isMaster) Some(sizing) else lastCrop.master
          } yield cid -> Crop.createFromCropSource(author, date, cropSource, masterSizing, currentSizings)

          map ++ updatedCrop
        }
      }.collect { case (cid, s) => s }.toList
    }
  }

  def deleteCrops(id: String)(implicit logMarker: LogMarker, instance: Instance) = {
    deleteFolder(config.imgPublishingBucket, folderForImagesCrops(id, instance))
  }

  // FIXME: this doesn't really belong here
  def translateImgHost(uri: URI): URI =
    new URI("https", config.imgPublishingHost, uri.getPath, uri.getFragment)

  private def folderForImagesCrops(id: Bucket, instance: Instance) = {
    instance.id + "/" + id
  }

  private def signedCropAssetUrl(uri: URI): URI = {
    signUrlTony(config.imgPublishingBucket, uri).toURI
  }

}
