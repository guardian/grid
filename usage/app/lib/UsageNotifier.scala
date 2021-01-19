package lib

import com.gu.mediaservice.lib.aws.{ThrallMessageSender, UpdateMessage}
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.lib.usage.UsageBuilder
import com.gu.mediaservice.model.usage.{MediaUsage, UsageNotice}
import model.UsageTable
import org.joda.time.DateTime
import play.api.libs.json._
import rx.lang.scala.Observable

import scala.concurrent.ExecutionContext.Implicits.global

class UsageNotifier(config: UsageConfig, usageTable: UsageTable)
  extends ThrallMessageSender(config.thrallKinesisLowPriorityStreamConfig) with GridLogging {

  def build(mediaId: String) = Observable.from(
    usageTable.queryByImageId(mediaId).map((usages: Set[MediaUsage]) => {
      val usageJson = Json.toJson(usages.map(UsageBuilder.build)).as[JsArray]
      UsageNotice(mediaId, usageJson)
    }))

  def send(usageNotice: UsageNotice) = {
    logger.info(s"Sending usage notice for ${usageNotice.mediaId}")
    val updateMessage = UpdateMessage(subject = "update-image-usages", id = Some(usageNotice.mediaId), usageNotice = Some(usageNotice))
    publish(updateMessage)
  }
}
