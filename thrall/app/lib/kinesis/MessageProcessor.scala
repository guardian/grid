package lib.kinesis

import com.gu.mediaservice.lib.aws.{EsResponse, UpdateMessage}
import com.gu.mediaservice.lib.elasticsearch.ElasticNotFoundException
import com.gu.mediaservice.lib.logging.{GridLogging, LogMarker}
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.MediaLease
import com.gu.mediaservice.model.usage.{Usage, UsageNotice}
import com.gu.mediaservice.syntax.MessageSubjects
import lib._
import lib.elasticsearch._
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}


class MessageProcessor(es: ElasticSearch,
                       store: ThrallStore,
                       metadataEditorNotifications: MetadataEditorNotifications,
                      ) extends GridLogging with MessageSubjects {

  def process(updateMessage: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[Any] = {
    updateMessage.subject match {
      case Image => indexImage(updateMessage, logMarker)
      case ReingestImage => indexImage(updateMessage, logMarker)
      case DeleteImage => deleteImage(updateMessage, logMarker)
      case UpdateImage => indexImage(updateMessage, logMarker)
      case DeleteImageExports => deleteImageExports(updateMessage, logMarker)
      case UpdateImageExports => updateImageExports(updateMessage, logMarker)
      case UpdateImageUserMetadata => updateImageUserMetadata(updateMessage, logMarker)
      case UpdateImageUsages => updateImageUsages(updateMessage, logMarker)
      case ReplaceImageLeases => replaceImageLeases(updateMessage, logMarker)
      case AddImageLease => addImageLease(updateMessage, logMarker)
      case RemoveImageLease => removeImageLease(updateMessage, logMarker)
      case SetImageCollections => setImageCollections(updateMessage, logMarker)
      case DeleteUsages => deleteAllUsages(updateMessage, logMarker)
      case UpdateImageSyndicationMetadata => upsertSyndicationRightsOnly(updateMessage, logMarker)
      case UpdateImagePhotoshootMetadata => updateImagePhotoshoot(updateMessage, logMarker)
      case unknownSubject => Future.failed(ProcessorNotFoundException(unknownSubject))
     }
  }

  def updateImageUsages(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[List[ElasticSearchUpdateResponse]] = {
    implicit val unw: OWrites[UsageNotice] = Json.writes[UsageNotice]
    implicit val lm: LogMarker = logMarker
    withId(message) { id =>
      withUsageNotice(message) { usageNotice =>
        val usages = usageNotice.usageJson.as[Seq[Usage]]
        Future.traverse(es.updateImageUsages(id, usages, message.lastModified))(_.recoverWith {
          case ElasticNotFoundException => Future.successful(ElasticSearchUpdateResponse())
        })
      }
    }
  }

  private def reindexImage(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) = {
    logger.info(logMarker, s"Reindexing image: ${message.image.map(_.id).getOrElse("image not found")}")
    indexImage(message, logMarker)
  }

  private def indexImage(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    withImage(message)(i =>
      Future.sequence(
        es.indexImage(i.id, i, message.lastModified)(ec,logMarker)
      )
    )

  private def updateImageExports(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    withId(message)(id =>
      withCrops(message)(crops =>
        Future.sequence(
          es.updateImageExports(id, crops, message.lastModified)(ec,logMarker))))

  private def deleteImageExports(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    withId(message)(id =>
      Future.sequence(
        es.deleteImageExports(id, message.lastModified)(ec, logMarker)))

  private def updateImageUserMetadata(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    withEdits(message)( edits =>
      withId(message)(id =>
        Future.sequence(es.applyImageMetadataOverride(id, edits, message.lastModified)(ec,logMarker))))

  private def replaceImageLeases(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    withId(message)(id =>
      withLeases(message)(leases =>
        Future.sequence(es.replaceImageLeases(id, leases, message.lastModified)(ec, logMarker))))

  private def addImageLease(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    withId(message)(id =>
      withLease(message)( mediaLease =>
        Future.sequence(es.addImageLease(id, mediaLease, message.lastModified)(ec, logMarker))))

  private def removeImageLease(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[List[ElasticSearchUpdateResponse]] =
    withId(message)(id =>
      withLeaseId(message)( leaseId =>
        Future.sequence(es.removeImageLease(id, Some(leaseId), message.lastModified)(ec, logMarker))))

  private def setImageCollections(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    withId(message)(id =>
      withCollections(message)(collections =>
        Future.sequence(es.setImageCollections(id, collections, message.lastModified)(ec, logMarker))))

  private def deleteImage(updateMessage: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) = {
    Future.sequence(
      withId(updateMessage) { id =>
        implicit val marker: LogMarker = logMarker ++ logger.imageIdMarker(ImageId(id))
        // if we cannot delete the image as it's "protected", succeed and delete
        // the message anyway.
        logger.info(marker, "ES6 Deleting image: " + id)
        es.deleteImage(id).map { requests =>
          requests.map {
            _: ElasticSearchDeleteResponse =>
              store.deleteOriginal(id)
              store.deleteThumbnail(id)
              store.deletePng(id)
              metadataEditorNotifications.publishImageDeletion(id)
              EsResponse(s"Image deleted: $id")
          } recoverWith {
            case ImageNotDeletable =>
              logger.info(marker, "Could not delete image")
              Future.successful(EsResponse(s"Image cannot be deleted: $id"))
          }
        }
      }
    )
  }

  private def deleteAllUsages(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext) =
    withId(message)(id =>
      Future.sequence(es.deleteAllImageUsages(id, message.lastModified)(ec, logMarker)))

  def upsertSyndicationRightsOnly(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[Any] =
    withId(message){ id =>
      implicit val marker: LogMarker = logMarker ++ logger.imageIdMarker(ImageId(id))
        es.getImage(id) map {
          case Some(image) =>
            val photoshoot = image.userMetadata.flatMap(_.photoshoot)
            logger.info(marker, s"Upserting syndication rights for image $id in photoshoot $photoshoot with rights ${Json.toJson(message.syndicationRights)}")
            es.updateImageSyndicationRights(id, message.syndicationRights, message.lastModified)
          case _ => logger.info(marker, s"Image $id not found")
        }
    }

  def updateImagePhotoshoot(message: UpdateMessage, logMarker: LogMarker)(implicit ec: ExecutionContext): Future[Unit] = {
    withId(message) { id =>
      implicit val marker: LogMarker = logMarker ++ logger.imageIdMarker(ImageId(id))
      withEdits(message) { upcomingEdits =>
        for {
          imageOpt <- es.getImage(id)
          prevPhotoshootOpt = imageOpt.flatMap(_.userMetadata.flatMap(_.photoshoot))
          _ <- updateImageUserMetadata(message, logMarker)
        } yield logger.info(marker, s"Moved image $id from $prevPhotoshootOpt to ${upcomingEdits.photoshoot}")
      }
    }
  }

  private def withId[A](message: UpdateMessage)(f: String => A): A = {
    message.id.map(f).getOrElse {
      sys.error(s"No id present in message: $message")
    }
  }

  private def withImage[A](message: UpdateMessage)(f: Image => A): A = {
    message.image.map(f).getOrElse {
      sys.error(s"No image present in message: $message")
    }
  }

  private def withCollections[A](message: UpdateMessage)(f: Seq[Collection] => A): A = {
    message.collections.map(f).getOrElse {
      sys.error(s"No edits present in message: $message")
    }
  }

  private def withCrops[A](message: UpdateMessage)(f: Seq[Crop] => A): A = {
    message.crops.map(f).getOrElse {
      sys.error(s"No crops present in message: $message")
    }
  }

  private def withEdits[A](message: UpdateMessage)(f: Edits => A): A = {
    message.edits.map(f).getOrElse {
      sys.error(s"No edits present in message: $message")
    }
  }

  private def withLease[A](message: UpdateMessage)(f: MediaLease => A): A = {
    message.mediaLease.map(f).getOrElse {
      sys.error(s"No media lease present in message: $message")
    }
  }

  private def withLeases[A](message: UpdateMessage)(f: Seq[MediaLease] => A): A = {
    message.leases.map(f).getOrElse {
      sys.error(s"No media leases present in message: $message")
    }
  }

  private def withLeaseId[A](message: UpdateMessage)(f: String => A): A = {
    message.leaseId.map(f).getOrElse {
      sys.error(s"No lease id present in message: $message")
    }
  }

  private def withSyndicationRights[A](message: UpdateMessage)(f: SyndicationRights => A): A = {
    message.syndicationRights.map(f).getOrElse {
      sys.error(s"No syndication rights present on data field message: $message")
    }
  }

  private def withUsageNotice[A](message: UpdateMessage)(f: UsageNotice => A): A = {
    message.usageNotice.map(f).getOrElse {
      sys.error(s"No usage notice present in message: $message")
    }
  }

}

case class ProcessorNotFoundException(unknownSubject: String) extends Exception(s"Could not find processor for $unknownSubject message")
