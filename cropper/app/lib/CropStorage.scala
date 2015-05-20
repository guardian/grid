package lib

import java.io.File
import java.net.{URI,URL}
import java.util.concurrent.Executors

import scala.concurrent.{ExecutionContext, Future}

import com.gu.mediaservice.lib.S3ImageStorage
import com.gu.mediaservice.model.{Dimensions, Asset, Crop, CropSource, Bounds}

object CropStore extends S3ImageStorage(Config.imgPublishingCredentials) {
  import com.gu.mediaservice.lib.formatting._

  def getSecureCropUri(uri: URI): Option[URL] =
    Config.imgPublishingSecureHost.map((new URI("https",_, uri.getPath, uri.getFragment).toURL))

  def storeCropSizing(file: File, filename: String, mimeType: String, crop: Crop, dimensions: Dimensions): Future[Asset] = {
    val CropSource(sourceUri, Bounds(x, y, w, h), r) = crop.specification
    val metadata = Map("source" -> sourceUri,
                       "bounds_x" -> x,
                       "bounds_y" -> y,
                       "bounds_w" -> w,
                       "bounds_h" -> h,
                       "author" -> crop.author,
                       "date" -> crop.date.map(printDateTime),
                       "width" -> dimensions.width,
                       "height" -> dimensions.height
                   ) ++ r.map("aspect_ratio" -> _)

    val filteredMetadata = metadata.collect {
      case (key, Some(value)) => key -> value
      case (key, value)       => key -> value
    }.mapValues(_.toString)

    storeImage(Config.imgPublishingBucket, filename, file, Some(mimeType), filteredMetadata) map { s3Object=>
      Asset(
        translateImgHost(s3Object.uri),
        s3Object.size,
        s3Object.metadata.objectMetadata.contentType,
        Some(dimensions),
        getSecureCropUri(s3Object.uri)
      )
    }
  }

  def listCrops(id: String): Future[List[Crop]] = {
    list(Config.imgPublishingBucket, id).map { crops =>
      crops.foldLeft(Map[String, Crop]()) {
        case (map, (s3Object)) => {
          val filename::containingFolder::_ = s3Object.uri.getPath.split("/").reverse.toList
          var isMaster       = containingFolder == "master"
          val userMetadata   = s3Object.metadata.userMetadata
          val objectMetadata = s3Object.metadata.objectMetadata

          val updatedCrop = for {
            // Note: if any is missing, the entry won't be registered
            source <- userMetadata.get("source")
            x      <- userMetadata.get("bounds_x").map(_.toInt)
            y      <- userMetadata.get("bounds_y").map(_.toInt)
            w      <- userMetadata.get("bounds_w").map(_.toInt)
            h      <- userMetadata.get("bounds_h").map(_.toInt)
            width  <- userMetadata.get("width").map(_.toInt)
            height <- userMetadata.get("height").map(_.toInt)

            cid            = s"$id-$x-$y-$w-$h"
            ratio          = userMetadata.get("aspect_ratio")
            author         = userMetadata.get("author")
            date           = userMetadata.get("date").flatMap(parseDateTime(_))
            cropSource     = CropSource(source, Bounds(x, y, w, h), ratio)
            dimensions     = Dimensions(width, height)

            sizing         =
              Asset(
                translateImgHost(s3Object.uri),
                s3Object.size,
                objectMetadata.contentType,
                Some(dimensions),
                getSecureCropUri(s3Object.uri)
              )
            lastCrop       = map.getOrElse(cid, Crop(author, date, cropSource))
            lastSizings    = lastCrop.assets

            currentSizings = if (isMaster) lastSizings else lastSizings :+ sizing
            masterSizing   = if (isMaster) Some(sizing) else lastCrop.master
          } yield cid -> Crop(author, date, cropSource, masterSizing, currentSizings)

          map ++ updatedCrop
        }
      }.collect { case (cid, s) => s }.toList
    }
  }

  // FIXME: this doesn't really belong here
  def translateImgHost(uri: URI): URI =
    new URI(uri.getScheme, Config.imgPublishingHost, uri.getPath, uri.getFragment)
}
