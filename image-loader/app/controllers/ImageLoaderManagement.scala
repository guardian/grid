package controllers

import com.gu.mediaservice.lib.aws.SimpleSqsMessageConsumer
import com.gu.mediaservice.lib.management.{BuildInfo, Management}
import play.api.libs.json.Json
import play.api.mvc.{Action, AnyContent, ControllerComponents}

class ImageLoaderManagement(override val controllerComponents: ControllerComponents, override val buildInfo: BuildInfo, maybeIngestQueue:Option[SimpleSqsMessageConsumer])
  extends Management(controllerComponents, buildInfo) {
  override def healthCheck: Action[AnyContent] = Action {
    maybeIngestQueue match {
      case Some(ingestQueue) => Ok(Json.obj(
        "status" -> "OK",
        "hasIngestQueue" -> true,
        "ingestQueueStatus" -> ingestQueue.getStatus
      ))
      case None => Ok(Json.obj(
        "status" -> "OK",
        "hasIngestQueue" -> false,
      ))
    }
  }
}
