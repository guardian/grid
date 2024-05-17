import com.gu.contentapi.client.ScheduledExecutor
import com.gu.mediaservice.lib.play.GridComponents
import controllers.UsageApi
import lib._
import model._
import play.api.ApplicationLoader.Context
import router.Routes

import scala.concurrent.Future

class UsageComponents(context: Context) extends GridComponents(context, new UsageConfig(_)) {

  final override val buildInfo = utils.buildinfo.BuildInfo

  val usageGroupOps = new UsageGroupOps(config)
  val usageTable = new UsageTable(config)
  val usageMetrics = new UsageMetrics(config, actorSystem, applicationLifecycle)
  val usageNotifier = new UsageNotifier(config, usageTable)
  val usageRecorder = new UsageRecorder(usageMetrics, usageTable, usageNotifier, usageNotifier)
  val notifications = new Notifications(config)

  usageRecorder.start()
  context.lifecycle.addStopHook(() => {
    usageRecorder.stop()
    Future.successful(())
  })

  val controller = new UsageApi(auth, authorisation, usageTable, usageGroupOps, notifications, config, usageRecorder.usageApiSubject, controllerComponents, playBodyParsers)


  override lazy val router = new Routes(httpErrorHandler, controller, management)
}
