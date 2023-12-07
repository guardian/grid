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
      // FIXME add another case for when the maybeIngestQueueProcessorFuture is defined but has exited and return non-OK to fail the healthcheck
      case Some(ingestQueue) => Ok(Json.obj(
        "status" -> "OK",
        "hasIngestQueue" -> true,
        "ingestQueueStatus" -> ingestQueue.getStatus,
        "maybeIngestQueueProcessorFuture" -> maybeIngestQueueProcessorFuture.toString // TODO format this better
      ))
      case None => Ok(Json.obj(
        "status" -> "OK",
        "hasIngestQueue" -> false,
      ))
    }
  }
}
