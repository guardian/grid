package lib.imaging

import java.util.concurrent.Executors
import java.io.File
import scala.concurrent.{Future, ExecutionContext}
import org.im4java.core.{IMOperation, Operation, ConvertCmd}
import lib.Config
import model.{Bounds, Dimensions}
import com.gu.mediaservice.syntax.{KestrelSyntax}


object Conversion {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def stripMeta(op: IMOperation) = op |< (_.strip())

  def imageSource(source: File): IMOperation = (new IMOperation()) |< (_.addImage(source.getAbsolutePath))

  def addDestImage(op: IMOperation, dest: File) = op |< (_.addImage(dest.getAbsolutePath))

  def cropResize(op: IMOperation, bounds: Bounds, dimensions: Dimensions): IMOperation = op |< { o =>
    val Bounds(x, y, w, h) = bounds

    o.crop(w, h, x, y)
    o.scale(dimensions.width, dimensions.height)
    o.colorspace("RGB")
  }

  def runOp(op: IMOperation): Future[Unit] = Future((new ConvertCmd).run(op))
}
