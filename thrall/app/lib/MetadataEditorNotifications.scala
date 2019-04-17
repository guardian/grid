package lib

import com.gu.mediaservice.lib.aws.SNS
import play.api.libs.json.Json

class MetadataEditorNotifications(config: ThrallConfig) extends SNS(config, config.metadataTopicArn) {
  def publishImageDeletion(id: String) = publish(Json.obj("id" -> id), "image-deleted")
}
