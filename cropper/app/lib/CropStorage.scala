package lib

import java.io.File
import java.net.URI
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import com.gu.mediaservice.lib.aws.S3
import model.{Dimensions, Bounds, CropSource, CropSizing}

object CropStorage extends S3(Config.imgPublishingCredentials) {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def storeCropSizing(file: File, filename: String, mimeType: String, source: CropSource, dimensions: Dimensions): Future[CropSizing] = {
    val CropSource(sourceUri, Bounds(x, y, w, h), r) = source
    val metadata = Map("source" -> sourceUri,
                       "bounds_x" -> x,
                       "bounds_y" -> y,
                       "bounds_w" -> w,
                       "bounds_h" -> h,
                       "width" -> dimensions.width,
                       "height" -> dimensions.height
                   ) ++ r.map( ("aspect_ratio" -> _) )
    store(Config.imgPublishingBucket, filename, file, Some(mimeType), metadata.mapValues(_.toString)) map { uri =>
      CropSizing(translateImgHost(uri).toString, dimensions)
    }
  }


  def listCrops(id: String): Future[Map[CropSource, List[CropSizing]]] = {
    list(Config.imgPublishingBucket, id) map { crops =>
      crops.foldLeft(Map[CropSource, List[CropSizing]]()) { case (map, (uri, metadata)) =>
        val updatedCrop = for {
          // Note: if any is missing, the entry won't be registered
          source <- metadata.get("source")
          x      <- metadata.get("bounds_x").map(_.toInt)
          y      <- metadata.get("bounds_y").map(_.toInt)
          w      <- metadata.get("bounds_w").map(_.toInt)
          h      <- metadata.get("bounds_h").map(_.toInt)
          ratio   = metadata.get("aspect_ratio")
          width  <- metadata.get("width").map(_.toInt)
          height <- metadata.get("height").map(_.toInt)
          cropSource = CropSource(source, Bounds(x, y, w, h), ratio)
          dimensions = Dimensions(width, height)
          cropSizing = CropSizing(translateImgHost(uri).toString, dimensions)
          currentSizings = map.getOrElse(cropSource, Nil)
        } yield (cropSource -> (currentSizings :+ cropSizing))

        map ++ updatedCrop
      }
    }
  }

  // FIXME: this doesn't really belong here
  def translateImgHost(uri: URI): URI =
    new URI(uri.getScheme, Config.imgPublishingHost, uri.getPath, uri.getFragment)
}
