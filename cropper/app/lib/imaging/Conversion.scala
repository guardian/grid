package lib.imaging

import java.util.concurrent.Executors
import java.io.File
import scala.concurrent.{Future, ExecutionContext}
import org.im4java.core.{ETOperation, IMOperation, Operation, ConvertCmd, ExiftoolCmd}
import org.im4java.process.OutputConsumer
import lib.Config
import model.{Bounds, Dimensions}
import com.gu.mediaservice.syntax.{KestrelSyntax}
import java.io.InputStream
import java.util.Scanner


object ExifTool {
  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def tagSource(source: File) = (new ETOperation()) |< (_.addImage(source.getAbsolutePath))

  def setTags(ops: ETOperation)(tags: Map[String, String]): ETOperation =  {
    tags.foldLeft(ops) { case (ops, (key, value)) => ops |< (_.setTags(s"$key=$value")) }
  }

  def runExiftoolCmd(op: ETOperation): Future[Unit] = Future((new ExiftoolCmd).run(op))
}

object Convert {
  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def imageSource(source: File) = (new IMOperation()) |< (_.addImage(source.getAbsolutePath))

  def stripMeta(op: IMOperation) = op |< (_.strip())

  def addDestImage(op: IMOperation)(dest: File) = op |< (_.addImage(dest.getAbsolutePath))

  def cropResize(op: IMOperation)(bounds: Bounds, dimensions: Dimensions): IMOperation = op |< { o =>
    val Bounds(x, y, w, h) = bounds

    o.crop(w, h, x, y)
    o.scale(dimensions.width, dimensions.height)
    o.colorspace("RGB")
  }

  def runConvertCmd(op: IMOperation): Future[Unit] = Future((new ConvertCmd).run(op))
}
