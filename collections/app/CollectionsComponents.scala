import com.gu.mediaservice.lib.management.InnerServiceStatusCheckController
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{CollectionsController, ImageCollectionsController}
import lib.{CollectionsConfig, CollectionsMetrics, CustomHttpErrorHandler, Notifications}
import play.api.ApplicationLoader.Context
import play.api.http.{HttpErrorConfig, HttpErrorHandler}
import router.Routes
import store.CollectionsStore

class CollectionsComponents(context: Context) extends GridComponents(context, new CollectionsConfig(_)) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val store = new CollectionsStore(config)
  val metrics = new CollectionsMetrics(config)
  val notifications = new Notifications(config)

  val collections = new CollectionsController(auth, config, store, controllerComponents)
  val imageCollections = new ImageCollectionsController(auth, config, notifications, controllerComponents)
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)

  override val router = new Routes(httpErrorHandler, collections, imageCollections, management, InnerServiceStatusCheckController)

  val customHttpErrorHandler = new CustomHttpErrorHandler(HttpErrorConfig(), devContext.map(_.sourceMapper), Some(router))
  override lazy val httpErrorHandler: HttpErrorHandler = customHttpErrorHandler
}
