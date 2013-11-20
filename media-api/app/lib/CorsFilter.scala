import play.api.mvc._
import lib.Config

object CorsFilter extends Filter {
  import scala.concurrent._
  import ExecutionContext.Implicits.global

  def apply(f: (RequestHeader) => Future[SimpleResult])(request: RequestHeader): Future[SimpleResult] = {

    val requestProtocol =
      request.headers.get("X-Forwarded-Proto").map(_.toLowerCase).getOrElse("http")

    val corsAllowOrigin = s"$requestProtocol://${Config.corsAllowedDomain}"

    f(request).map { _.withHeaders(
      "Access-Control-Allow-Origin" -> corsAllowOrigin
    ) }
  }

}
