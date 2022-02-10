package lib

import com.gu.mediaservice.lib.aws.{ThrallMessageSender, UpdateMessage}
import com.gu.mediaservice.lib.logging.GridLogging
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

  def build(mediaUsage: MediaUsage) = Observable.from(
    usageTable.queryByImageId(mediaUsage.mediaId).map((potentialIncompleteUsages: Set[MediaUsage]) => {

      if(potentialIncompleteUsages.contains(mediaUsage)){
        logger.info(s"Accurate usages of ${mediaUsage.mediaId} retrieved from DynamoDB and sent to thrall/ElasticSearch")
      } else {
        logger.info(s"Inaccurate usages of ${mediaUsage.mediaId} retrieved from DynamoDB, so supplemented before being sent to thrall/ElasticSearch")
      }

      val definitelyCompleteUsages = potentialIncompleteUsages + mediaUsage

      val usageJson = Json.toJson(definitelyCompleteUsages.map(UsageBuilder.build)).as[JsArray]
      UsageNotice(mediaUsage.mediaId, usageJson)
    }))

  def send(usageNotice: UsageNotice) = {
    logger.info(s"Sending usage notice for ${usageNotice.mediaId}")
    val updateMessage = UpdateMessage(subject = UpdateImageUsages, id = Some(usageNotice.mediaId), usageNotice = Some(usageNotice))
    publish(updateMessage)
  }
}
