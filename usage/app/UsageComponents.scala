import com.gu.contentapi.client.ScheduledExecutor
import com.gu.mediaservice.lib.management.InnerServiceStatusCheckController
import com.gu.mediaservice.lib.play.GridComponents
import controllers.UsageApi
import lib._
import model._
import play.api.ApplicationLoader.Context
import router.Routes

import scala.concurrent.Future

class UsageComponents(context: Context) extends GridComponents(context, new UsageConfig(_)) {

  final override val buildInfo = utils.buildinfo.BuildInfo

  val usageMetadataBuilder = new UsageMetadataBuilder(config)
  val mediaWrapper = new MediaWrapperOps(usageMetadataBuilder)
  val liveContentApi = new LiveContentApi(config)(ScheduledExecutor())
  val usageGroupOps = new UsageGroupOps(config, mediaWrapper)
  val usageTable = new UsageTable(config)
  val usageMetrics = new UsageMetrics(config, actorSystem, applicationLifecycle)
  val usageNotifier = new UsageNotifier(config, usageTable)
  val usageRecorder = new UsageRecorder(usageMetrics, usageTable, usageNotifier, actorSystem.scheduler)(executionContext)
  val notifications = new Notifications(config)

  val crierReader = Option.when(!config.apiOnly) {
    val reader = new CrierStreamReader(config, usageGroupOps, usageRecorder, executionContext)
    reader.start()
    reader
  }

  context.lifecycle.addStopHook(() =>
    crierReader.fold(Future.unit)(_.stop()).flatMap(_ => usageRecorder.stop())
  )

  val controller = new UsageApi(auth, authorisation, usageTable, usageGroupOps, notifications, config, usageRecorder, liveContentApi, controllerComponents, playBodyParsers)
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)


  override lazy val router = new Routes(httpErrorHandler, controller, management, InnerServiceStatusCheckController)
}
