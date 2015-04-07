package lib.imaging

import java.util.concurrent.Executors
import java.io.File
import scala.concurrent.{Future, ExecutionContext}
import org.im4java.core.{ETOperation, IMOperation, Operation, ConvertCmd, ExiftoolCmd}
import org.im4java.process.OutputConsumer
import lib.Config
import model.{Bounds, Dimensions}
import java.io.InputStream
import java.util.Scanner
import scalaz.syntax.id._


object ExifTool {
  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def tagSource(source: File) = (new ETOperation()) <| (_.addImage(source.getAbsolutePath))

  def setTags(ops: ETOperation)(tags: Map[String, String]): ETOperation =  {
    tags.foldLeft(ops) { case (ops, (key, value)) => ops <| (_.setTags(s"$key=$value")) }
  }

  def runExiftoolCmd(op: ETOperation): Future[Unit] = Future((new ExiftoolCmd).run(op))
}

object Convert {
  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def imageSource(source: File)(qual: Double) = (new IMOperation()) <| { op => {
    op.quality(qual)
    op.addImage(source.getAbsolutePath)
  }}

  def stripMeta(op: IMOperation) = op <| (_.strip())

  def addDestImage(op: IMOperation)(dest: File) = op <| (_.addImage(dest.getAbsolutePath))

  def crop(op: IMOperation)(b: Bounds): IMOperation = op <| (_.crop(b.width, b.height, b.x, b.y))

  def scale(op: IMOperation)(dimensions: Dimensions): IMOperation = op <| (_.scale(dimensions.width, dimensions.height))

  def normalizeColorspace(op: IMOperation): IMOperation = op <| (_.colorspace("RGB"))

  def runConvertCmd(op: IMOperation): Future[Unit] = Future((new ConvertCmd).run(op))
}
