package lib.imaging

import org.im4java.core.Info
import scala.concurrent.Future
import com.gu.mediaservice.model.ColorModel

import play.api.Logger

import scala.util.{Try, Success, Failure}

object ColorModelDetection {
  import scala.concurrent.ExecutionContext.Implicits.global

  // im4java Info is generally unreliable as it relies on "identify -verbose"
  // however Colorspace is not read from a tag here but calculated via a heuristic
  // so we can rely upon it to be consistent

  // This is distinct from reading the ICC Profile Colorspace which may be missing
  // while this property is still inferrable from other sources

  def getColorModel(fileLocation: String): Option[ColorModel] = {
    Try {
      ColorModel((new Info(fileLocation)).getProperty("Colorspace"))
    } match {
      case Success(colorModel) => Some(colorModel)
      case Failure(e) => {
        Logger.error(s"Failed to get ColorModel: ${e.getMessage}")

        None
      }
    }
  }
}


