package lib

import com.gu.mediaservice.lib.aws.SNS
import com.gu.mediaservice.lib.formatting._
import model.{MediaUsage, UsageTable}
import org.joda.time.DateTime
import play.api.Logger
import play.api.libs.json._
import rx.lang.scala.Observable

import scala.concurrent.ExecutionContext.Implicits.global

case class UsageNotice(mediaId: String, usageJson: JsArray) {
  def toJson = Json.obj(
    "id" -> mediaId,
    "data" -> usageJson,
    "lastModified" -> printDateTime(DateTime.now())
  )

  override def equals(o: Any) = o match {
    case that: UsageNotice => that.hashCode == this.hashCode
    case _ => false
  }

  override def hashCode =  {
    val result = Json.toJson(
      usageJson.as[List[JsObject]]
        .map(_ - "lastModified")
        .map(_ - "dateAdded")
      ).as[JsArray].toString

    result.hashCode
  }
}

class UsageNotifier(config: UsageConfig, usageTable: UsageTable) extends SNS(config, config.topicArn) {
  def build(mediaId: String) = Observable.from(
    usageTable.queryByImageId(mediaId).map((usages: Set[MediaUsage]) => {
      val usageJson = Json.toJson(usages.map(UsageBuilder.build)).as[JsArray]
      UsageNotice(mediaId, usageJson)
    }))

  def send(usageNotice: UsageNotice) = {
    Logger.info(s"Sending usage notice for ${usageNotice.mediaId}")
    publish(usageNotice.toJson, "update-image-usages")
  }
}
