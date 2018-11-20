
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{CollectionsController, ImageCollectionsController}
import lib.{CollectionsConfig, CollectionsMetrics, Notifications}
import play.api.ApplicationLoader.Context
import router.Routes
import store.CollectionsStore

class CollectionsComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new CollectionsConfig()

  val store = new CollectionsStore(config)
  val metrics = new CollectionsMetrics(config)
  val notifications = new Notifications(config)

  val collections = new CollectionsController(auth, config, store, controllerComponents)
  val imageCollections = new ImageCollectionsController(auth, config, notifications, controllerComponents)

  override val router = new Routes(httpErrorHandler, collections, imageCollections, management)
}
