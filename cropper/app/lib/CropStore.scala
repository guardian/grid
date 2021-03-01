package lib

import java.io.File
import java.net.{URI, URL}

import scala.concurrent.Future
import com.gu.mediaservice.lib.S3ImageStorage
import com.gu.mediaservice.lib.logging.RequestLoggingContext
import com.gu.mediaservice.model._

import scala.util.Try

class CropStore(config: CropperConfig) extends S3ImageStorage(config) {
  import com.gu.mediaservice.lib.formatting._

  def getSecureCropUri(uri: URI): Option[URL] =
    config.imgPublishingSecureHost.map(new URI("https", _, uri.getPath, uri.getFragment).toURL)

  def storeCropSizing(file: File, filename: String, mimeType: MimeType, crop: Crop, dimensions: Dimensions)(implicit requestContext: RequestLoggingContext) : Future[Asset] = {
    val CropSpec(sourceUri, Bounds(x, y, w, h), r, t) = crop.specification
    val metadata = Map("source" -> sourceUri,
                       "bounds-x" -> x,
                       "bounds-y" -> y,
                       "bounds-width" -> w,
                       "bounds-height" -> h,
                       "type" -> t.name,
                       "author" -> crop.author,
                       "date" -> crop.date.map(printDateTime),
                       "width" -> dimensions.width,
                       "height" -> dimensions.height
                   ) ++ r.map("aspect-ratio" -> _)

    val filteredMetadata = metadata.collect {
      case (key, Some(value)) => key -> value
      case (key, value)       => key -> value
    }.mapValues(_.toString)

    storeImage(config.imgPublishingBucket, filename, file, Some(mimeType), filteredMetadata, overwrite = true) map { s3Object =>
      Asset(
        translateImgHost(s3Object.uri),
        Some(s3Object.size),
        s3Object.metadata.objectMetadata.contentType,
        Some(dimensions),
        getSecureCropUri(s3Object.uri)
      )
    }
  }

  private def getOrElseOrNone(theMap: Map[String, String], preferredKey: String, fallbackKey: String): Option[String] = {
    // Return the `preferredKey` value in `theMap` or the `fallbackKey` or `None`
    theMap.get(preferredKey).orElse(theMap.get(fallbackKey))
  }

  def listCrops(id: String): Future[List[Crop]] = {
    list(config.imgPublishingBucket, id).map { crops =>
      crops.foldLeft(Map[String, Crop]()) {
        case (map, (s3Object)) => {
          val filename::containingFolder::_ = s3Object.uri.getPath.split("/").reverse.toList
          var isMaster       = containingFolder == "master"
          val userMetadata   = s3Object.metadata.userMetadata
          val objectMetadata = s3Object.metadata.objectMetadata

          val updatedCrop = for {
            // Note: if any is missing, the entry won't be registered
            source <- userMetadata.get("source")

            // we've moved to kebab-case as localstack doesn't like `_`
            // fallback to reading old values for older crops
            // see https://github.com/localstack/localstack/issues/459
            x      <- getOrElseOrNone(userMetadata, "bounds-x", "bounds_x").map(_.toInt)
            y      <- getOrElseOrNone(userMetadata, "bounds-y", "bounds_y").map(_.toInt)
            w      <- getOrElseOrNone(userMetadata, "bounds-width", "bounds_w").map(_.toInt)
            h      <- getOrElseOrNone(userMetadata, "bounds-height", "bounds_h").map(_.toInt)
            width  <- userMetadata.get("width").map(_.toInt)
            height <- userMetadata.get("height").map(_.toInt)

            cid            = s"$id-$x-$y-$w-$h"
            ratio          = getOrElseOrNone(userMetadata, "aspect-ratio", "aspect_ratio")
            author         = userMetadata.get("author")
            date           = userMetadata.get("date").flatMap(parseDateTime)
            exportType     = userMetadata.get("type").map(ExportType.valueOf).getOrElse(ExportType.default)
            cropSource     = CropSpec(source, Bounds(x, y, w, h), ratio, exportType)
            dimensions     = Dimensions(width, height)

            sizing         =
              Asset(
                translateImgHost(s3Object.uri),
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

  def deleteCrops(id: String) = {
    deleteFolder(config.imgPublishingBucket, id)
  }

  // FIXME: this doesn't really belong here
  def translateImgHost(uri: URI): URI =
    new URI("https", config.imgPublishingHost, uri.getPath, uri.getFragment)
}
