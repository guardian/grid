package lib

import play.api.libs.json._
import com.gu.mediaservice.lib.aws.SNS
import com.gu.mediaservice.model.Usage

import model.{UsageTable, MediaUsage}

import scala.concurrent.ExecutionContext.Implicits.global

import rx.lang.scala.{Observable, Subscriber}


object UsageNotifier extends SNS(Config.awsCredentials, Config.topicArn) {
  def forMedia(mediaId: String): Observable[JsObject] = {
    val notification = UsageTable.queryByImageId(mediaId).map((usages: Set[MediaUsage]) => {
      val usageJson = Json.toJson(usages.map(UsageBuilder.build)).as[JsArray]

      val jsonUsages = Json.obj(
        "id" -> mediaId,
        "data" -> usageJson
      )

      publish(jsonUsages, "update-image-usages")

      jsonUsages
    })

    Observable.from(notification)
  }
}
