package lib

import com.gu.mediaservice.lib.aws.{ThrallMessageSender, UpdateMessage}
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.lib.usage.UsageBuilder
import com.gu.mediaservice.model.Instance
import com.gu.mediaservice.model.usage.{MediaUsage, UsageNotice}
import com.gu.mediaservice.syntax.MessageSubjects
import model.UsageTable
import org.joda.time.DateTime
import play.api.libs.json._
import rx.lang.scala.Observable

import scala.concurrent.ExecutionContext.Implicits.global

class UsageNotifier(config: UsageConfig, usageTable: UsageTable)
  extends ThrallMessageSender(config.thrallKinesisLowPriorityStreamConfig) with GridLogging with MessageSubjects {

  def build(mediaID: String, instance: Instance)(implicit logMarker: LogMarker): Observable[UsageNotice] = {
    implicit val logMarkerWithId: LogMarker = logMarker + ("image-id" -> mediaID)
    logger.info(logMarkerWithId, s"Building usage notice for $mediaID")

    Observable.from(
      usageTable.queryByImageId(mediaID)(logMarkerWithId, instance).map((dbUsages: List[MediaUsage]) =>
        UsageNotice(
          mediaID,
          Json.toJson(dbUsages.map(UsageBuilder.build)).as[JsArray],
          instance
        )
      )
    )
  }

  def send(usageNoticeWithContext: WithLogMarker[UsageNotice]): LogMarker = {
    val usageNotice = usageNoticeWithContext.value
    logger.info(usageNoticeWithContext.logMarker, s"Sending usage notice for ${usageNotice.mediaId}")
    publish(
      UpdateMessage(
        subject = UpdateImageUsages,
        id = Some(usageNotice.mediaId),
        usageNotice = Some(usageNotice),
        instance = usageNotice.instance
      )
    )
    usageNoticeWithContext.logMarker
  }
}
