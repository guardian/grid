package lib

import com.gu.mediaservice.lib.aws.{ThrallMessageSender, UpdateMessage}
import com.gu.mediaservice.model.leases.MediaLease
import org.joda.time.DateTime

class LeaseNotifier(config: LeasesConfig, store: LeaseStore) extends ThrallMessageSender(config.thrallKinesisStreamConfig) {
  def sendReindexLeases(mediaId: String) = {
    val replaceImageLeases = "replace-image-leases"
    val leases = store.getForMedia(mediaId)
    val updateMessage = UpdateMessage(subject = replaceImageLeases, leases = Some(leases), id = Some(mediaId) )
    publish(updateMessage)
  }

  def sendAddLease(mediaLease: MediaLease) = {
    val addImageLease = "add-image-lease"
    val updateMessage = UpdateMessage(subject = addImageLease, mediaLease = Some(mediaLease), id = Some(mediaLease.mediaId))
    publish(updateMessage)
  }

  def sendAddLeases(mediaLeases: List[MediaLease], mediaId: String) = {
    val replaceImageLeases = "replace-image-leases"
    val updateMessage = UpdateMessage(subject = replaceImageLeases, leases = Some(mediaLeases), id = Some(mediaId))
    publish(updateMessage)
  }

  def sendRemoveLease(mediaId: String, leaseId: String) = {
    val removeImageLease = "remove-image-lease"

    val updateMessage = UpdateMessage(subject = removeImageLease, id = Some(mediaId),
      leaseId = Some(leaseId)
    )
    publish(updateMessage)
  }
}
