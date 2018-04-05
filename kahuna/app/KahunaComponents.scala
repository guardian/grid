import com.gu.mediaservice.lib.play.{GridComponents, RequestLoggingFilter}
import controllers.{AssetsComponents, KahunaController}
import lib.KahunaConfig
import play.api.ApplicationLoader.Context
import play.api.mvc.EssentialFilter
import play.filters.HttpFiltersComponents
import play.filters.cors.CORSComponents
import play.filters.gzip.GzipFilterComponents
import router.Routes

class KahunaComponents(context: Context) extends GridComponents(context)
  with HttpFiltersComponents
  with CORSComponents
  with AssetsComponents
  with GzipFilterComponents {

  final override lazy val config = new KahunaConfig(configuration)

  val controller = new KahunaController(config, controllerComponents, assets)

  // TODO MRB: how to abstract this out to common?
  final override def httpFilters: Seq[EssentialFilter] = super.httpFilters ++ Seq(
    corsFilter, new RequestLoggingFilter(materializer), gzipFilter
  )

  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
