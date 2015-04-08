package lib.imaging.im4jwrapper

import java.util.concurrent.Executors
import lib.Config

import java.io.File
import scala.concurrent.{Future, ExecutionContext}
import org.im4java.core.{IMOperation, ConvertCmd}
import scalaz.syntax.id._

import model.{Bounds, Dimensions}


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
