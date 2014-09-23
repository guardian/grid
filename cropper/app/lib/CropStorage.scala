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

  def storeCropSizing(file: File, filename: String, mimeType: String, source: CropSource, dimensions: Dimensions): Future[URI] = {
    val CropSource(sourceUri, Bounds(x, y, w, h), r) = source
    val metadata = Map("source" -> sourceUri,
                       "bounds_x" -> x,
                       "bounds_y" -> y,
                       "bounds_w" -> w,
                       "bounds_h" -> h,
                       "width" -> dimensions.width,
                       "height" -> dimensions.height
                   ) ++ r.map( ("aspect_ratio" -> _) )
    store(Config.imgPublishingBucket, filename, file, Some(mimeType), metadata.mapValues(_.toString))
  }

}
