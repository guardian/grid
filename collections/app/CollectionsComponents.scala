import com.gu.mediaservice.lib.management.InnerServiceStatusCheckController
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{CollectionsController, ImageCollectionsController}
import lib.{CollectionsConfig, CollectionsMetrics, Notifications}
import play.api.ApplicationLoader.Context
import router.Routes
import store.{CollectionsStore, ImageCollectionsStore}

class CollectionsComponents(context: Context) extends GridComponents(context, new CollectionsConfig(_)) {
  final override val buildInfo = utils.buildinfo.BuildInfo

  val collectionsStore = new CollectionsStore(config)
  val imageCollectionsStore = new ImageCollectionsStore(config)
  val metrics = new CollectionsMetrics(config, actorSystem, applicationLifecycle)
  val notifications = new Notifications(config)

  val collections = new CollectionsController(auth, config, collectionsStore, controllerComponents)
  val imageCollections = new ImageCollectionsController(auth, config, notifications, imageCollectionsStore, controllerComponents)
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)


  override val router = new Routes(httpErrorHandler, collections, imageCollections, management, InnerServiceStatusCheckController)
}
