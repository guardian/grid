import play.api.mvc._
import com.gu.mediaservice.syntax._
import lib.Config

// TODO: share with the copy in cropper...

object CorsFilter extends Filter {
  import scala.concurrent._
  import ExecutionContext.Implicits.global

  def isAllowed(origin: String) = Config.corsAllAllowedOrigins.contains(origin)

  def apply(f: (RequestHeader) => Future[Result])(request: RequestHeader): Future[Result] = {

    // Add CORS headers iff allowed origin
    val origin = request.headers.get("Origin") getOrElse ""
    if (isAllowed(origin)) {
      f(request).map { _.withHeaders(
        "Access-Control-Allow-Credentials" -> "true",
        "Access-Control-Allow-Origin" -> origin
      ) }
    } else {
      f(request)
    }
  }

}
