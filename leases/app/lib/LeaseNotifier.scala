package lib

import play.api.libs.json._
import com.gu.mediaservice.lib.formatting._
import org.joda.time.DateTime
import com.gu.mediaservice.lib.aws.SNS

case class LeaseNotice(mediaId: String, leaseArray: JsArray) {
  def toJson = Json.obj(
    "id" -> mediaId,
    "data" -> leaseArray,
    "lastModified" -> printDateTime(DateTime.now())
  )
}


object LeaseNotice {
  def build(mediaId: String) : LeaseNotice = {
    val leases : JsArray = Json.toJson(LeaseStore.getForMedia(mediaId).map(Json.toJson(_))).as[JsArray]
    LeaseNotice(mediaId, leases)
  }
}

object LeaseNotifier extends SNS(Config.awsCredentials, Config.topicArn) {
  def send(leaseNotice: LeaseNotice) = publish(leaseNotice.toJson, "update-image-leases")
}
