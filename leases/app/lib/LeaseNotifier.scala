package lib

import com.gu.mediaservice.lib.aws.{MessageSender, UpdateMessage}
import com.gu.mediaservice.lib.formatting._
import com.gu.mediaservice.model.{LeasesByMedia, MediaLease}
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

  implicit val writer = new Writes[LeasesByMedia] {
    def writes(leaseByMedia: LeasesByMedia) = {
      LeasesByMedia.toJson(
        Json.toJson(leaseByMedia.leases),
        Json.toJson(leaseByMedia.lastModified)
      )
    }
  }
  def apply(mediaLease: MediaLease): LeaseNotice = LeaseNotice(
    mediaLease.mediaId,
    Json.toJson(LeasesByMedia(List(mediaLease), Some(mediaLease.createdAt)))
  )
}

class LeaseNotifier(config: LeasesConfig, store: LeaseStore) extends MessageSender(config, config.topicArn) {
  private def build(mediaId: String, leases: List[MediaLease] ): LeaseNotice = {
    LeaseNotice(mediaId, Json.toJson(LeasesByMedia.build(leases)))
  }

  def sendReindexLeases(mediaId: String) = {
    val replaceImageLeases = "replace-image-leases"
    val leases = store.getForMedia(mediaId)
    val updateMessage = UpdateMessage(subject = replaceImageLeases, leases = Some(leases), id = mediaId)
    publish(build(mediaId, leases).toJson, replaceImageLeases, updateMessage)
  }

  def sendAddLease(mediaLease: MediaLease) = {
    val addImageLease = "add-image-lease"
    val updateMessage = UpdateMessage(subject = addImageLease, mediaLease = Some(mediaLease), id = mediaLease.mediaId, lastModified = Some(DateTime.now()))
    publish(MediaLease.toJson(mediaLease), addImageLease, updateMessage)
  }

  def sendRemoveLease(mediaId: String, leaseId: String) = {
    val removeImageLease = "remove-image-lease"

    val leaseInfo = Json.obj(
      "leaseId" -> leaseId,
      "id" -> mediaId,
      "lastModified" -> printDateTime(DateTime.now())
    )
    val updateMessage = UpdateMessage(subject = removeImageLease, id = mediaId,
      leaseId = Some(leaseId), lastModified = Some(DateTime.now())
    )
    publish(leaseInfo, removeImageLease, updateMessage)
  }
}
