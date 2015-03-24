package lib

import java.io.File
import java.net.URI
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import com.gu.mediaservice.lib.aws.S3
import model._

object CropStorage extends S3(Config.imgPublishingCredentials) {
  import com.gu.mediaservice.lib.formatting._

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def storeCropSizing(file: File, filename: String, mimeType: String, crop: Crop, dimensions: Dimensions): Future[CropSizing] = {

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

    store(Config.imgPublishingBucket, filename, file, Some(mimeType), filteredMetadata) map { uri =>
      CropSizing(translateImgHost(uri).toString, dimensions)
    }
  }

  def listCrops(id: String): Future[List[Crop]] = {
    list(Config.imgPublishingBucket, id).map { crops =>
      crops.foldLeft(Map[String, Crop]()) {
        case (map, (uri, metadata)) => {
          val updatedCrop = for {
            // Note: if any is missing, the entry won't be registered
            source <- metadata.get("source")
            x      <- metadata.get("bounds_x").map(_.toInt)
            y      <- metadata.get("bounds_y").map(_.toInt)
            w      <- metadata.get("bounds_w").map(_.toInt)
            h      <- metadata.get("bounds_h").map(_.toInt)
            width  <- metadata.get("width").map(_.toInt)
            height <- metadata.get("height").map(_.toInt)
            cid            = s"$id-$x-$y-$w-$h"
            ratio          = metadata.get("aspect_ratio")
            author         = metadata.get("author")
            date           = metadata.get("date").flatMap(parseDateTime(_))
            cropSource     = CropSource(source, Bounds(x, y, w, h), ratio)
            dimensions     = Dimensions(width, height)
            cropSizing     = CropSizing(translateImgHost(uri).toString, dimensions)
            currentSizings = map.getOrElse(cid, Crop(author, date, cropSource)).assets
          } yield cid -> Crop(author, date, cropSource, (currentSizings :+ cropSizing))

          map ++ updatedCrop
        }
      }.collect { case (cid, s) => s }.toList
    }
  }

  // FIXME: this doesn't really belong here
  def translateImgHost(uri: URI): URI =
    new URI(uri.getScheme, Config.imgPublishingHost, uri.getPath, uri.getFragment)
}
