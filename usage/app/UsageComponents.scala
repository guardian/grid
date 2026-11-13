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
  val usageGroupStream = new UsageGroupStream()(executionContext)
  val usageRecorder = new UsageRecorder(usageMetrics, usageTable, usageNotifier, usageNotifier, usageGroupStream)
  val notifications = new Notifications(config)

  usageRecorder.start()

  val crierReader = if (!config.apiOnly) {
    val reader = new CrierStreamReader(config, usageGroupOps, usageGroupStream, executionContext)
    reader.start()
    Some(reader)
  } else None

  context.lifecycle.addStopHook(() => {
    crierReader.map(_.stop()).getOrElse(Future.successful(())).flatMap(_ => usageRecorder.stop()).map(_ => ())
  })

  val controller = new UsageApi(auth, authorisation, usageTable, usageGroupOps, notifications, config, usageGroupStream, liveContentApi, controllerComponents, playBodyParsers)
  val InnerServiceStatusCheckController = new InnerServiceStatusCheckController(auth, controllerComponents, config.services, wsClient)


  override lazy val router = new Routes(httpErrorHandler, controller, management, InnerServiceStatusCheckController)
}
