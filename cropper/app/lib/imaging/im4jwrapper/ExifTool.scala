package lib.imaging.im4jwrapper

import java.util.concurrent.Executors
import lib.Config

import java.io.File
import scala.concurrent.{Future, ExecutionContext}
import org.im4java.core.{ETOperation, ExiftoolCmd}
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
