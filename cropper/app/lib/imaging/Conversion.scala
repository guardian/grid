package lib.imaging

import java.util.concurrent.Executors
import java.io.File
import scala.concurrent.{Future, ExecutionContext}
import org.im4java.core.{IMOperation, ConvertCmd}
import lib.Config
import model.{Bounds, Dimensions}

object Conversion {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))
  
  def resize(source: File, dest: File, bounds: Bounds, dimensions: Dimensions): Future[Unit] = {
    val Bounds(x, y, w, h) = bounds
    val cmd = new ConvertCmd
    val op = new IMOperation
    op.addImage(source.getAbsolutePath)
      op.crop(w, h, x, y)
      op.resize(dimensions.width, dimensions.height)
      op.addImage(dest.getAbsolutePath)
    for {
      _ <- runOp(cmd, op)
    }
    yield ()
  }

  private def runOp(cmd: ConvertCmd, op: IMOperation): Future[Unit] =
    Future(cmd.run(op))
  
}
