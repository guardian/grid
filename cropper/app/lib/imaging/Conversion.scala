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
  class ExifToolOutputConsumer extends OutputConsumer{
    import scala.concurrent.ExecutionContext.Implicits.global
    import akka.agent.Agent

    val stringAgent: Agent[String] = Agent("")
    def consumeOutput(is: InputStream) = {
      stringAgent send convertStreamToString(is)
    }

    def get(): String = {
      stringAgent.get()
    }

    private def convertStreamToString(is: InputStream): String = {
      val s = new Scanner(is).useDelimiter("\\A");
      if(s.hasNext()) s.next() else ""
    }
  }
  case class StreamableExifToolCmd(cmd: ExiftoolCmd, consumer: ExifToolOutputConsumer)
  object StreamableExifToolCmd {
    def create(): StreamableExifToolCmd = {
      val consumer = new ExifToolOutputConsumer()
      val cmd = (new ExiftoolCmd()) |< (_.setOutputConsumer(consumer))

      StreamableExifToolCmd(cmd, consumer)
    }
  }

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def tagSource(source: File) = (new ETOperation()) |< (_.addImage(source.getAbsolutePath))
  def getTags(op: ETOperation)(tags: String) = op |< (_.getTags(tags))

  def runOp(op: ETOperation): Future[String] = {
    val exifTool = StreamableExifToolCmd.create
    exifTool.cmd.run(op)

    exifTool.consumer.stringAgent.future
  }
}

object Convert {
  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.imagingThreadPoolSize))

  def imageSource(source: File) = (new IMOperation()) |< (_.addImage(source.getAbsolutePath))

  def stripMeta(op: IMOperation) = op |< (_.strip())

  def addDestImage(op: IMOperation, dest: File) = op |< (_.addImage(dest.getAbsolutePath))

  def cropResize(op: IMOperation, bounds: Bounds, dimensions: Dimensions): IMOperation = op |< { o =>
    val Bounds(x, y, w, h) = bounds

    o.crop(w, h, x, y)
    o.scale(dimensions.width, dimensions.height)
    o.colorspace("RGB")
  }

  def runOp(op: IMOperation): Future[Unit] = Future((new ConvertCmd).run(op))
}
