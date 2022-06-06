package lib

import com.gu.mediaservice.lib.aws.{ThrallMessageSender, UpdateMessage}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.lib.usage.UsageBuilder
import com.gu.mediaservice.model.usage.{MediaUsage, UsageNotice}
import com.gu.mediaservice.syntax.MessageSubjects
import model.UsageTable
import org.joda.time.DateTime
import play.api.libs.json._
import rx.lang.scala.Observable

import scala.concurrent.ExecutionContext.Implicits.global

class UsageNotifier(config: UsageConfig, usageTable: UsageTable)
  extends ThrallMessageSender(config.thrallKinesisLowPriorityStreamConfig) with GridLogging with MessageSubjects {

  def build(mediaID: String)(implicit logMarker: LogMarker): Observable[UsageNotice] = Observable.from(
    usageTable.queryByImageId(mediaID).map((dbUsages: List[MediaUsage]) =>
      UsageNotice(
        mediaID,
        Json.toJson(dbUsages.map(UsageBuilder.build)).as[JsArray]
      )
    )
  )

  def send(usageNoticeWithContext: WithContext[UsageNotice]): LogMarker = {
    val usageNotice = usageNoticeWithContext.value
    logger.info(usageNoticeWithContext.context, s"Sending usage notice for ${usageNotice.mediaId}")
    publish(
      UpdateMessage(
        subject = UpdateImageUsages,
        id = Some(usageNotice.mediaId),
        usageNotice = Some(usageNotice)
      )
    )
    usageNoticeWithContext.context
  }
}
