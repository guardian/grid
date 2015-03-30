package lib.imaging

import java.util.concurrent.Executors
import java.io.File
import scala.concurrent.{Future, ExecutionContext}
import org.im4java.core.{IMOperation, Operation, ConvertCmd}
import lib.Config
import model.{Bounds, Dimensions}


object Conversion {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def stripMeta(op: IMOperation) = {
    op.strip()

    op
  }

  def imageSource(source: File): IMOperation = {
    val op = new IMOperation()
    op.addImage(source.getAbsolutePath)

    op
  }

  def addDestImage(op: IMOperation, dest: File) = {
    op.addImage(dest.getAbsolutePath)

    op
  }

  def cropResize(op: IMOperation, bounds: Bounds, dimensions: Dimensions): IMOperation = {
    val Bounds(x, y, w, h) = bounds

    op.crop(w, h, x, y)
    op.scale(dimensions.width, dimensions.height)
    op.colorspace("RGB")

    op
  }

  def runOp(op: IMOperation): Future[Unit] = Future((new ConvertCmd).run(op))

}
