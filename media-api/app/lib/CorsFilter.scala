import play.api.mvc._
import lib.Config

object CorsFilter extends Filter {
  import scala.concurrent._
  import ExecutionContext.Implicits.global
  lazy val allowedDomain = Config.corsAllowedDomain

  def apply(f: (RequestHeader) => Future[SimpleResult])(request: RequestHeader): Future[SimpleResult] = {
    f(request).map { _.withHeaders(
      "Access-Control-Allow-Origin" -> allowedDomain
    ) }
  }

}
