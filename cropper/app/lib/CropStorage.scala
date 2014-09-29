package lib

import java.io.File
import java.net.URI
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import com.gu.mediaservice.lib.aws.S3
import model.{Dimensions, Bounds, CropSource}

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
        val cropSource = CropSource(
          metadata("source"),
          Bounds(
            metadata("bounds_x").toInt,
            metadata("bounds_y").toInt,
            metadata("bounds_w").toInt,
            metadata("bounds_h").toInt
          ),
          metadata.get("aspect_ratio")
        )
        val dimensions = Dimensions(metadata("width").toInt, metadata("height").toInt)
        val cropSizing = CropSizing(translateImgHost(uri).toString, dimensions)
        val currentSizings = map.getOrElse(cropSource, Nil)
        map + (cropSource -> (currentSizings :+ cropSizing))
      }
    }
  }

  // FIXME: this doesn't really belong here
  def translateImgHost(uri: URI): URI =
    new URI(uri.getScheme, Config.imgPublishingHost, uri.getPath, uri.getFragment)
}
