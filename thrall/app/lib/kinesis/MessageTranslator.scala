package lib.kinesis

import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.model.{AddImageLeaseMessage, DeleteImageExportsMessage, DeleteImageMessage, DeleteUsagesMessage, ImageMessage, RemoveImageLeaseMessage, ReplaceImageLeasesMessage, SetImageCollectionsMessage, ThrallMessage, UpdateImageExportsMessage, UpdateImagePhotoshootMetadataMessage, UpdateImageSyndicationMetadataMessage, UpdateImageUsagesMessage, UpdateImageUserMetadataMessage}
import com.gu.mediaservice.syntax.MessageSubjects._

object MessageTranslator {
  def process(updateMessage: UpdateMessage): Option[ThrallMessage] = {
    updateMessage.subject match {
      case Image | ReingestImage | UpdateImage =>
        (updateMessage.id, updateMessage.image) match {
          case (Some(id), Some(image)) => Some(ImageMessage(id, image))
          case _ => None
        }
      case DeleteImage => (updateMessage.id) match {
        case (Some(id)) => Some(DeleteImageMessage(id))
        case _ => None
      }
      case DeleteImageExports => (updateMessage.id) match {
        case (Some(id)) => Some(DeleteImageExportsMessage(id))
        case _ => None
      }
      case UpdateImageExports => (updateMessage.id, updateMessage.crops) match {
        case (Some(id), Some(crops)) => Some(UpdateImageExportsMessage(id, crops))
        case _ => None
      }
      case UpdateImageUserMetadata => (updateMessage.id, updateMessage.edits) match {
        case (Some(id), Some(edits)) => Some(UpdateImageUserMetadataMessage(id, edits))
        case _ => None
      }
      case UpdateImageUsages => (updateMessage.id, updateMessage.usageNotice) match {
        case (Some(id), Some(usageNotice)) => Some(UpdateImageUsagesMessage(id, usageNotice))
        case _ => None
      }
      case ReplaceImageLeases => (updateMessage.id, updateMessage.leases) match {
        case (Some(id), Some(leases)) => Some(ReplaceImageLeasesMessage(id, leases))
        case _ => None
      }
      case AddImageLease => (updateMessage.id, updateMessage.mediaLease) match {
        case (Some(id), Some(mediaLease)) => Some(AddImageLeaseMessage(id, mediaLease))
        case _ => None
      }
      case RemoveImageLease => (updateMessage.id, updateMessage.leaseId) match {
        case (Some(id), Some(leaseId)) => Some(RemoveImageLeaseMessage(id, leaseId))
        case _ => None
      }
      case SetImageCollections => (updateMessage.id, updateMessage.collections) match {
        case (Some(id), Some(collections)) => Some(SetImageCollectionsMessage(id, collections))
        case _ => None
      }
      case DeleteUsages => (updateMessage.id) match {
        case Some(id) => Some(DeleteUsagesMessage(id))
      }

      case UpdateImageSyndicationMetadata => (updateMessage.id, updateMessage.syndicationRights) match {
        case (Some(id), Some(syndicationMetadata)) => UpdateImageSyndicationMetadataMessage(id, syndicationMetadata)
      }
      case UpdateImagePhotoshootMetadata => (updateMessage.id, updateMessage.edits) match {
        case (Some(id), Some(edits)) => Some(UpdateImagePhotoshootMetadataMessage(id, edits))
      }
      case _ => None

    }
  }
}
