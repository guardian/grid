package lib.kinesis

import com.gu.mediaservice.lib.aws.UpdateMessage
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{AddImageLeaseMessage, DeleteImageExportsMessage, DeleteImageMessage, DeleteUsagesMessage, ImageMessage, RemoveImageLeaseMessage, ReplaceImageLeasesMessage, SetImageCollectionsMessage, ThrallMessage, UpdateImageExportsMessage, UpdateImagePhotoshootMetadataMessage, UpdateImageSyndicationMetadataMessage, UpdateImageUsagesMessage, UpdateImageUserMetadataMessage}
import com.gu.mediaservice.syntax.MessageSubjects._

object MessageTranslator extends GridLogging {
  def translate(updateMessage: UpdateMessage): Either[Throwable, ThrallMessage] = {
    updateMessage.subject match {
      case Image | ReingestImage | UpdateImage =>
        updateMessage.image match {
          case  Some(image) => Right(ImageMessage(updateMessage.lastModified, image))
          case _ => Left(MissingFieldsException(updateMessage.subject))
        }
      case DeleteImage => (updateMessage.id) match {
        case (Some(id)) => Right(DeleteImageMessage(id, updateMessage.lastModified))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case DeleteImageExports => (updateMessage.id) match {
        case (Some(id)) => Right(DeleteImageExportsMessage(id, updateMessage.lastModified))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case UpdateImageExports => (updateMessage.id, updateMessage.crops) match {
        case (Some(id), Some(crops)) => Right(UpdateImageExportsMessage(id, updateMessage.lastModified, crops))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case UpdateImageUserMetadata => (updateMessage.id, updateMessage.edits) match {
        case (Some(id), Some(edits)) => Right(UpdateImageUserMetadataMessage(id, updateMessage.lastModified, edits))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case UpdateImageUsages => (updateMessage.id, updateMessage.usageNotice) match {
        case (Some(id), Some(usageNotice)) => Right(UpdateImageUsagesMessage(id, updateMessage.lastModified, usageNotice))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case ReplaceImageLeases => (updateMessage.id, updateMessage.leases) match {
        case (Some(id), Some(leases)) => Right(ReplaceImageLeasesMessage(id, updateMessage.lastModified, leases))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case AddImageLease => (updateMessage.id, updateMessage.mediaLease) match {
        case (Some(id), Some(mediaLease)) => Right(AddImageLeaseMessage(id, updateMessage.lastModified, mediaLease))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case RemoveImageLease => (updateMessage.id, updateMessage.leaseId) match {
        case (Some(id), Some(leaseId)) => Right(RemoveImageLeaseMessage(id, updateMessage.lastModified, leaseId))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case SetImageCollections => (updateMessage.id, updateMessage.collections) match {
        case (Some(id), Some(collections)) => Right(SetImageCollectionsMessage(id, updateMessage.lastModified, collections))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case DeleteUsages => (updateMessage.id) match {
        case Some(id) => Right(DeleteUsagesMessage(id, updateMessage.lastModified))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }

      case UpdateImageSyndicationMetadata => (updateMessage.id, updateMessage.syndicationRights) match {
        case (Some(id), maybeSyndicationMetadata) => Right(UpdateImageSyndicationMetadataMessage(id, updateMessage.lastModified, maybeSyndicationMetadata))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case UpdateImagePhotoshootMetadata => (updateMessage.id, updateMessage.edits) match {
        case (Some(id), Some(edits)) => Right(UpdateImagePhotoshootMetadataMessage(id, updateMessage.lastModified, edits))
        case _ => Left(MissingFieldsException(updateMessage.subject))
      }
      case _ => Left(ProcessorNotFoundException(updateMessage.subject))
    }
  }
}

case class ProcessorNotFoundException(unknownSubject: String) extends Exception(s"Could not find processor for $unknownSubject message")

case class MissingFieldsException(subject: String) extends Exception(s"Was unable to deserialise $subject")
