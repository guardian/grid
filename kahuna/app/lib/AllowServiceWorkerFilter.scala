package lib

import java.net.{URLDecoder, URI}
import scala.concurrent.Future
import _root_.play.api.mvc._
import com.gu.mediaservice.syntax._

import scala.concurrent.ExecutionContext.Implicits.global

object AllowServiceWorkerFilter extends EssentialFilter {

  def apply(next: EssentialAction) = new EssentialAction {
    def apply(request: RequestHeader) = {
      // FIXME: if requesting sw file
      next(request).map(_.withHeaders(
        "Service-Worker-Allowed" -> "/"
      ))
    }
  }
}
