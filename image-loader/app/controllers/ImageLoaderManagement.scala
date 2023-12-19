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
  maybeIngestQueueAndProcessor:Option[(SimpleSqsMessageConsumer, Future[Done])]
)
  extends Management(controllerComponents, buildInfo) {
  override def healthCheck: Action[AnyContent] = Action {
    maybeIngestQueueAndProcessor match {
      case Some((ingestQueue, ingestQueueProcessorFuture)) =>
        // healthcheck should fail if the processor completes - this would mean the application is no longer monitoring the queue
        val status = if (ingestQueueProcessorFuture.isCompleted) InternalServerError else Ok
        status(Json.obj(
          "status" -> (if (ingestQueueProcessorFuture.isCompleted) "ERROR" else "OK"),
          "hasIngestQueue" -> true,
          "ingestQueueStatus" -> ingestQueue.getStatus,
          "maybeIngestQueueProcessorFuture" -> ingestQueueProcessorFuture.toString
        ))
      case None => Ok(Json.obj(
        "status" -> "OK",
        "hasIngestQueue" -> false,
      ))
    }
  }

}
