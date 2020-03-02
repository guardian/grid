package lib

import com.gu.mediaservice.lib.aws.SNS
import play.api.libs.json.Json

import scala.concurrent.ExecutionContext

class MetadataEditorNotifications(config: ThrallConfig) extends SNS(config, config.metadataTopicArn) {
  def publishImageDeletion(id: String)(implicit ec: ExecutionContext) = publish(Json.obj("id" -> id), "image-deleted")
}
