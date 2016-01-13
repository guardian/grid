package lib

import com.gu.mediaservice.lib.formatting._
import org.joda.time.DateTime
import play.api.libs.json._
import com.gu.mediaservice.lib.aws.SNS
import com.gu.mediaservice.model.Usage

import model.{UsageTable, MediaUsage}

import scala.concurrent.Future
import scala.concurrent.ExecutionContext.Implicits.global

import _root_.rx.lang.scala.{Observable, Subscriber}

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

object UsageNotice {
  def build(mediaId: String) = Observable.from(
    UsageTable.queryByImageId(mediaId).map((usages: Set[MediaUsage]) => {
      val usageJson = Json.toJson(usages.map(UsageBuilder.build)).as[JsArray]
      UsageNotice(mediaId, usageJson)
    }))
}

object UsageNotifier extends SNS(Config.awsCredentials, Config.topicArn) {
  def send(usageNotice: UsageNotice) = publish(usageNotice.toJson, "update-image-usages")
}
