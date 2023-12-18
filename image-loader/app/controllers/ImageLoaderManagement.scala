package controllers

import akka.Done
import com.gu.mediaservice.lib.aws.SimpleSqsMessageConsumer
import com.gu.mediaservice.lib.management.{BuildInfo, Management}
import play.api.libs.json.Json
import play.api.mvc.{Action, AnyContent, ControllerComponents}

import scala.concurrent.Future

class ImageLoaderManagement(
  override val controllerComponents: ControllerComponents,
  override val buildInfo: BuildInfo,
  maybeIngestQueue:Option[SimpleSqsMessageConsumer],
  maybeIngestQueueProcessorFuture: Option[Future[Done]]
)
  extends Management(controllerComponents, buildInfo) {
  override def healthCheck: Action[AnyContent] = Action {
    maybeIngestQueue match {
      case Some(ingestQueue) =>
        if (hasProcessorFutureEnded) {
          // healthcheck should fail if the processor completes - this would mean the application is no longet monitoring the queue
          InternalServerError(buildDataWithQueue(ingestQueue, processorHasStopped = true))
        } else {
          Ok(buildDataWithQueue(ingestQueue, processorHasStopped = false))
        }
      case None => Ok(Json.obj(
        "status" -> "OK",
        "hasIngestQueue" -> false,
      ))
    }
  }

  private def hasProcessorFutureEnded = {
    maybeIngestQueueProcessorFuture match {
      case Some(processorFuture) => processorFuture.isCompleted
      case None => false
    }
  }
  private def buildDataWithQueue(ingestQueue:SimpleSqsMessageConsumer, processorHasStopped: Boolean) = {
    Json.obj(
      "status" -> (if (processorHasStopped) {"ERROR"} else {"OK"}),
      "hasIngestQueue" -> true,
      "ingestQueueStatus" -> ingestQueue.getStatus,
      "maybeIngestQueueProcessorFuture" -> maybeIngestQueueProcessorFuture.toString // TODO format this better
    )
  }
}
