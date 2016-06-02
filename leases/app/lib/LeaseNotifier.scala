package lib

import com.gu.mediaservice.lib.argo.model.EntityReponse
import com.gu.mediaservice.model.{DateFormat, MediaLease, LeaseByMedia}
import play.api.libs.json._
import com.gu.mediaservice.lib.formatting._
import org.joda.time.DateTime
import com.gu.mediaservice.lib.aws.SNS

case class LeaseNotice(mediaId: String, leaseByMedia: JsValue) {
  def toJson = Json.obj(
    "id" -> mediaId,
    "data" -> leaseByMedia,
    "lastModified" -> printDateTime(DateTime.now())
  )
}


object LeaseNotice {
  implicit val dateTimeFormat = DateFormat
  implicit val writer = new Writes[LeaseByMedia] {
    def writes(leaseByMedia: LeaseByMedia) = {
      LeaseByMedia.toJson(
        Json.toJson(leaseByMedia.leases),
        Json.toJson(leaseByMedia.current),
        Json.toJson(leaseByMedia.lastModified.map(lm => Json.toJson(lm)))
      )
    }
  }

  def build(mediaId: String) : LeaseNotice = {
    val leases = LeaseStore.getForMedia(mediaId)
    LeaseNotice(mediaId, Json.toJson(LeaseByMedia(leases)))
  }
}

object LeaseNotifier extends SNS(Config.awsCredentials, Config.topicArn) {
  def send(leaseNotice: LeaseNotice) = {
    publish(leaseNotice.toJson, "update-image-leases")
  }
}
