package lib.imaging.im4jwrapper

import java.util.concurrent.Executors
import lib.Config

import java.io.File
import scala.concurrent.{Future, ExecutionContext}
import org.im4java.core.{IMOperation, ConvertCmd}
import scalaz.syntax.id._

import com.gu.mediaservice.model.{Dimensions, Bounds}


object ImageMagick {
  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def addImage(source: File) = (new IMOperation()) <| { op => { op.addImage(source.getAbsolutePath) }}
  def quality(op: IMOperation)(qual: Double) = op <| (_.quality(qual))
  def stripMeta(op: IMOperation) = op <| (_.strip())
  def addDestImage(op: IMOperation)(dest: File) = op <| (_.addImage(dest.getAbsolutePath))
  def crop(op: IMOperation)(b: Bounds): IMOperation = op <| (_.crop(b.width, b.height, b.x, b.y))
  def profile(op: IMOperation)(profileFileLocation: String): IMOperation = op <| (_.profile(profileFileLocation))
  def scale(op: IMOperation)(dimensions: Dimensions): IMOperation = op <| (_.scale(dimensions.width, dimensions.height))
  def runConvertCmd(op: IMOperation): Future[Unit] = Future((new ConvertCmd).run(op))
}
