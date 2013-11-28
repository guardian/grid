package lib

import java.net.URI
import scala.concurrent.Future
import _root_.play.api.mvc.{Results, SimpleResult, RequestHeader, Filter}
import com.gu.mediaservice.syntax._

object ForceHTTPSFilter extends Filter {

  /** Uses the X-Forwarded-Proto header (added by Amazon's ELB) to determine whether
    * the client used HTTPS, and redirect if not.
    *
    * Assumes untrusted clients can only connect via the ELB!
    */
  def apply(f: (RequestHeader) => Future[SimpleResult])(request: RequestHeader): Future[SimpleResult] = {
    if (request.forwardedProtocol.exists(_ == "https")) {
      val queryString = Some(request.rawQueryString).filter(_.nonEmpty)
      val uri = new URI("https", request.host, request.path, queryString.orNull, null)
      Future.successful(Results.MovedPermanently(uri.toString))
    }
    else f(request)
  }

}
