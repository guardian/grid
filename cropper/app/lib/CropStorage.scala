package lib

import java.io.File
import java.net.URL
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import com.gu.mediaservice.lib.aws.S3
import model.{Dimensions, Bounds, Crop}

object CropStorage extends S3(Config.awsCredentials) {

  protected final implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(8))

  def storeCropSizing(file: File, filename: String, crop: Crop, dimensions: Dimensions): Future[URL] = {
    val Crop(source, Bounds(x, y, w, h)) = crop
    val metadata = Map("source" -> source,
                       "bounds_x" -> x,
                       "bounds_y" -> y,
                       "bounds_w" -> w,
                       "bounds_h" -> h,
                       "width" -> dimensions.width,
                       "height" -> dimensions.height)
    store(Config.cropBucket, filename, file, metadata.mapValues(_.toString))
  }

}
