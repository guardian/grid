package lib.imaging

import org.im4java.core.Info
import scala.concurrent.Future

object ImageMagick {
  import scala.concurrent.ExecutionContext.Implicits.global

  def getColorspace(fileLocation: String): Future[Colorspace] = Future {
    val colorspace = (new Info(fileLocation)).getProperty("Colorspace")
    Colorspace(colorspace)
  }
}

case class Colorspace(id: String)
