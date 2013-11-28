import play.api.mvc._
import com.gu.mediaservice.syntax._
import lib.Config

object CorsFilter extends Filter {
  import scala.concurrent._
  import ExecutionContext.Implicits.global

  def apply(f: (RequestHeader) => Future[SimpleResult])(request: RequestHeader): Future[SimpleResult] = {

    val requestProtocol = request.forwardedProtocol.getOrElse("http")

    val corsAllowOrigin = s"$requestProtocol://${Config.corsAllowedDomain}"

    f(request).map { _.withHeaders(
      "Access-Control-Allow-Credentials" -> "true",
      "Access-Control-Allow-Origin" -> corsAllowOrigin
    ) }
  }

}
