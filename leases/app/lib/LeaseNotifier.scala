package lib

import com.gu.mediaservice.lib.aws.SNS
import com.gu.mediaservice.lib.formatting._
import com.gu.mediaservice.model.LeaseByMedia
import org.joda.time.DateTime
import play.api.libs.json._

case class LeaseNotice(mediaId: String, leaseByMedia: JsValue) {
  def toJson = Json.obj(
    "id" -> mediaId,
    "data" -> leaseByMedia,
    "lastModified" -> printDateTime(DateTime.now())
  )
}

object LeaseNotice {
  import JodaWrites._

  implicit val writer = new Writes[LeaseByMedia] {
    def writes(leaseByMedia: LeaseByMedia) = {
      LeaseByMedia.toJson(
        Json.toJson(leaseByMedia.leases),
        Json.toJson(leaseByMedia.current),
        Json.toJson(leaseByMedia.lastModified.map(lm => Json.toJson(lm)))
      )
    }
  }
}

class LeaseNotifier(config: LeasesConfig, store: LeaseStore) extends SNS(config, config.topicArn) {
  private def build(mediaId: String): LeaseNotice = {
    val leases = store.getForMedia(mediaId)
    LeaseNotice(mediaId, Json.toJson(LeaseByMedia.build(leases)))
  }

  def send(mediaId: String) = {
    publish(build(mediaId).toJson, "update-image-leases")
  }
}
