package lib

import play.api.libs.json._
import com.gu.mediaservice.lib.aws.SNS
import model.UsageGroup


object UsageNotifications extends SNS(Config.awsCredentials, Config.topicArn) {
  val messageType = "update-image-usage"
  def publishUsage(id: String) =
    publish(buildMessage(id), messageType)

  def publishFromUsageGroup(usageGroup: UsageGroup) = {
    usageGroup.usages
      .map(_.mediaId)
      .toList.distinct
      .map(publishUsage)
  }

  def buildMessage(mediaId: String) = Json.obj(
    "id" -> mediaId,
    "uri" -> s"http://www.example.com/usages/media/$mediaId"
  )

}
