package lib

import com.gu.mediaservice.lib.aws.{MessageSender, UpdateMessage}
import com.gu.mediaservice.model.usage.UsageNotice
import model.{MediaUsage, UsageTable}
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._
import rx.lang.scala.Observable

import scala.concurrent.ExecutionContext.Implicits.global

class UsageNotifier(config: UsageConfig, usageTable: UsageTable) extends MessageSender(config, config.topicArn) {
  def build(mediaId: String) = Observable.from(
    usageTable.queryByImageId(mediaId).map((usages: Set[MediaUsage]) => {
      val usageJson = Json.toJson(usages.map(UsageBuilder.build)).as[JsArray]
      UsageNotice(mediaId, usageJson)
    }))

  def send(usageNotice: UsageNotice) = {
    Logger.info(s"Sending usage notice for ${usageNotice.mediaId}")
    val updateMessage = UpdateMessage(subject = "update-image-usages", id = Some(usageNotice.mediaId), usageNotice = Some(usageNotice), lastModified = Some(DateTime.now()))
    publish(usageNotice.toJson, "update-image-usages", updateMessage)
  }
}
