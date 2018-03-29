package auth

import com.gu.mediaservice.lib.play.{GridComponents, RequestLoggingFilter}
import play.api.ApplicationLoader.Context
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSComponents
import play.filters.gzip.GzipFilterComponents
import router.Routes

class AuthComponents(context: Context) extends GridComponents(context)
  with HttpFiltersComponents
  with CORSComponents
  with GzipFilterComponents {

  final override lazy val config = new AuthConfig(configuration)

  val controller = new AuthController(auth, config, controllerComponents)

  // TODO MRB: how to abstract this out to common?
  final override def httpFilters: Seq[EssentialFilter] = super.httpFilters ++ Seq(
    corsFilter, new RequestLoggingFilter(materializer), gzipFilter
  )

  override val router = new Routes(httpErrorHandler, controller, management)
}