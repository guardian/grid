package lib

import java.io.File
import java.net.URL
import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import com.gu.mediaservice.lib.aws.S3
import model.{Dimensions, CropMetadata}

object CropStorage extends S3(Config.awsCredentials) {

  protected final implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(8))

  def storeCrop(file: File, filename: String, meta: CropMetadata): Future[URL] = {
    val CropMetadata(source, x, y, Dimensions(w, h)) = meta
    val metadata = Map("source" -> source,
                       "x" -> x,
                       "y" -> y,
                       "width" -> w,
                       "height" -> h)
    store(Config.cropBucket, filename, file, metadata.mapValues(_.toString))
  }
  
}
