package com.gu.thrall

import com.gu.mediaservice.lib.ImageIngestOperations
import com.gu.mediaservice.model.{Supplier, SyndicationRights}
import com.gu.thrall.clients.{DynamoNotifications, ElasticSearch}
import com.gu.thrall.config._
import com.typesafe.scalalogging.StrictLogging
import org.joda.time.DateTime
import play.api.libs.json.{JsString, JsValue}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class Consumer(
  val elasticSearch: ElasticSearch,
  val thrallStore: ImageIngestOperations,
  val notifications: DynamoNotifications,
  val esActionsFlag: Boolean,
  val s3ActionsFlag: Boolean,
  val dynamoActionsFlag: Boolean) extends StrictLogging {

  if (!esActionsFlag) logger.debug("Note that the lambda is configured NOT to update elasticsearch")
  if (!s3ActionsFlag) logger.debug("Note that the lambda is configured NOT to update s3")
  if (!dynamoActionsFlag) logger.debug("Note that the lambda is configured NOT to update dynamo")

  def process(sns: Sns): Future[Either[String, String]] = sns match {
    case Sns("image", Image(id, None, _, _, Some(data)))                             => indexImage(id, data)
    case Sns("delete-image", Image(id, None, _, _, _))                               => deleteImage(id)
    case Sns("update-image", Image(id, None, _, _, Some(data)))                      => indexImage(id, data)
    case Sns("delete-image-exports", Image(id, None, _, _, _))                       => deleteImageExports(id)
    case Sns("update-image-exports", Image(id, Some(data), _, _, _))                 => updateImageExports(id, data)
    case Sns("update-image-user-metadata", Image(id, Some(data), _, Some(lastModified), _))
                                                                                  => updateImageUserMetadata(id, data, lastModified)
    case Sns("update-image-usages", Image(id, Some(data), _, Some(lastModified), _)) => updateImageUsages(id, data, lastModified)
    case Sns("update-image-leases", Image(id, Some(data), _, Some(lastModified), _)) => updateImageLeases(id, data, lastModified)
    case Sns("set-image-collections", Image(id, Some(data), _, _, _))                => setImageCollections(id, data)
    case Sns("heartbeat", Image(_, None, _, None, _))                                => heartbeat()
    case Sns("delete-usages", Image(id, None, _, _, _))                              => deleteAllUsages(id)
    case Sns("update-rcs-rights", Image(id, Some(data), _, _, _))                    => updateRcsRights(id, data)
    case Sns("update-image-photoshoot", Image(id, Some(data), _, _, _))              => updateImagePhotoshoot(id, data)
    case Sns("refresh-inferred-rights", Image(id, Some(data), _, _, _))              => upsertSyndicationRights(id, data)
    case Sns("delete-inferred-rights", Image(id, Some(data), _, _, _))               => deleteInferredRights(id, data)
    case a => noMatch(a)
  }

  private def noMatch(a: Sns) = {
    Future.successful(Left(s"No match for message $a"))
  }

  private def deleteInferredRights(id: String, data: JsValue) = {
    if (esActionsFlag) elasticSearch.deleteInferredRights(id)
    else Future.successful(Right(s"Not deleting inferred rights for $id"))
  }

  // Needs to:
  //   do the actual operations
  private def upsertSyndicationRights(id: String, data: JsValue): Future[Either[String, String]] = {
    if (esActionsFlag) {
      Future {
        for {
          syndicationRights <- JsonParsing.syndicationRightsDetails(data)
          image <- elasticSearch.getImage(id)
          _ <- syndicationRightsOps.refreshInferredRights(image, syndicationRights) if (!syndicationRights.isInferred)
        } yield elasticSearch.updateImageSyndicationRights(id, data)
      }
    } else {
      Future.successful(Right(s"Not upserting syndication rights for $id"))
    }
  }

  // Needs to:
  //   do the actual operations
  private def updateImagePhotoshoot(id: String, data: JsValue): Future[Either[String, String]] = {
    if (esActionsFlag) {
      Future {
        for {
          upcomingEdits <- JsonParsing.editDetails(data)
          image <- elasticSearch.getImage(id)
          inferredRights = (image.syndicationRights getOrElse SyndicationRights(None, Seq.empty[Supplier], Seq.empty[com.gu.mediaservice.model.Right], false)).isInferred
          _ <- syndicationRightsOps.moveInferredRightsToPhotoshoot(image, upcomingEdits.photoshoot) if (inferredRights)
          _ <- syndicationRightsOps.moveExplicitRightsToPhotoshoot(image, upcomingEdits.photoshoot) if (!inferredRights)
        } yield updateImageUserMetadata(id, data, DateTime.now())
      }
    } else {
      Future.successful(Right(s"Not updating image photoshoot for $id"))
    }
  }



  private def updateRcsRights(id: String, data: JsValue) = {
    if (esActionsFlag) elasticSearch.updateRcsRights(id, data, DateTime.now())
    else Future.successful(Right(s"Not updating RCS rights for $id"))
  }

  private def deleteAllUsages(id: String) = {
    if (esActionsFlag) elasticSearch.deleteAllUsages(id)
    else Future.successful(Right(s"Not deleting all usages for $id"))
  }

  private def setImageCollections(id: String, data: JsValue) = {
    if (esActionsFlag) elasticSearch.setImageCollections(id, data)
    else Future.successful(Right(s"Not setting image collections for $id"))
  }

  private def updateImageLeases(id: String, data: JsValue, lastModified: DateTime) = {
    if (esActionsFlag) elasticSearch.updateImageLeases(id, data, lastModified)
    else Future.successful(Right(s"Not updating image leases for $id"))
  }

  private def updateImageUsages(id: String, data: JsValue, lastModified: DateTime) = {
    if (esActionsFlag) elasticSearch.updateImageUsages(id, data, lastModified)
    else Future.successful(Right(s"Not updating images usages for $id"))
  }

  private def updateImageUserMetadata(id: String, data: JsValue, lastModified: DateTime) = {
    if (esActionsFlag) elasticSearch.updateImageUserMetadata(id, data, lastModified)
    else Future.successful(Right(s"Not updating image user metadata for $id"))
  }

  private def updateImageExports(id: String, data: JsValue) = {
    if (esActionsFlag) elasticSearch.updateImageExports(id, data, DateTime.now())
    else Future.successful(Right(s"Not updating image exports for $id"))
  }

  private def deleteImageExports(id: String) = {
    if (esActionsFlag) elasticSearch.deleteImageExports(id)
    else Future.successful(Right(s"Not deleting image exports for $id"))
  }

  private def indexImage(id: String, data: String) = {
    if (esActionsFlag) elasticSearch.indexImage(id, data)
    else Future.successful(Right(s"Not indexing image for $id"))
  }

  private def heartbeat() = Future.successful(Right("Heart beat"))

  private def deleteImage(id: String): Future[Either[String, String]] = {
    if (esActionsFlag) {
      elasticSearch.deleteImage(id).map {
        case Right(_) =>
          if (s3ActionsFlag) {
            thrallStore.deleteOriginal(id)
            thrallStore.deleteThumbnail(id)
            thrallStore.deletePng(id)
          }
          if (dynamoActionsFlag)
            notifications.publish(JsString(id), "image-deleted")
          Right(s"Image deleted: $id")
        case Left("Image not deletable") =>
          Right(s"Image cannot be deleted: $id")
        case Left(s) =>
          Left(s"Image not deleted: $s")
      }
    }
    else Future.successful(Right(s"Not deleting image for $id"))
  }


}
