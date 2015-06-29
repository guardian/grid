import java.net.URI

import scala.util.Try

import play.api.mvc._
import lib.Config

// TODO: share with the copy in other services...

object CorsFilter extends Filter {
  import scala.concurrent._
  import ExecutionContext.Implicits.global

  def isLocal(uri: String): Boolean =
    Try(URI.create(uri)).toOption.exists(_.getHost == "localhost")

  def isAllowed(origin: String) =
    Config.corsAllAllowedOrigins.contains(origin) || isLocal(origin)

  def apply(f: (RequestHeader) => Future[Result])(request: RequestHeader): Future[Result] = {

    // Add CORS headers iff allowed origin
    request.headers.get("Origin") match {
      case Some(origin) if isAllowed(origin) =>
        f(request).map { _.withHeaders(
          "Access-Control-Allow-Credentials" -> "true",
          "Access-Control-Allow-Origin" -> origin
        ) }
      case _ =>
        f(request)
    }
  }

}
