import com.gu.mediaservice.lib.config.{MetadataStore, UsageRightsStore}
import com.gu.mediaservice.lib.imaging.ImageOperations
import com.gu.mediaservice.lib.play.GridComponents
import controllers.{EditsApi, EditsController}
import lib._
import play.api.ApplicationLoader.Context
import router.Routes

class MetadataEditorComponents(context: Context) extends GridComponents(context) {
  final override lazy val config = new EditsConfig(configuration)

  final override val buildInfo = utils.buildinfo.BuildInfo

  val store = new EditsStore(config)
  val notifications = new Notifications(config)
  val imageOperations = new ImageOperations(context.environment.rootPath.getAbsolutePath)

  val metrics = new MetadataEditorMetrics(config)
  val messageConsumer = new MetadataSqsMessageConsumer(config, metrics, store)

  messageConsumer.startSchedule()
  context.lifecycle.addStopHook {
    () => messageConsumer.actorSystem.terminate()
  }

  val usageRightsConfigStore = UsageRightsStore(config.configBucket, config)
  usageRightsConfigStore.scheduleUpdates(actorSystem.scheduler)

  val metaDataConfigStore = MetadataStore(config.configBucket, config)
  metaDataConfigStore.scheduleUpdates(actorSystem.scheduler)

  val editsController = new EditsController(auth, store, notifications, config, controllerComponents)
  val controller = new EditsApi(auth, config, controllerComponents, metaDataConfigStore, usageRightsConfigStore)

  override val router = new Routes(httpErrorHandler, controller, editsController, management)
}
