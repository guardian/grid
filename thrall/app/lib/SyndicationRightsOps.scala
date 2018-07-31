package lib

import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.SyndicationRights
import org.joda.time.DateTime
import play.api.libs.json.{JsNull, JsValue, Json}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future
import scala.util.Try


class SyndicationRightsOps(es: ElasticSearch, notifications: ThrallNotifications) {

  private implicit val jodaDateTimeOrdering: Ordering[DateTime] = Ordering.fromLessThan(_ isBefore _)

  def inferRightsForAlbum(id: String, rcsSyndicationRights: Option[SyndicationRights] = None): Future[Unit] = rcsSyndicationRights match {
    case Some(rcsRights) => for {
      album <- es.getAlbumForId(id)
      imagesInAlbum <- es.getAlbumImages(album)
    } yield {
      val imagesToUpdate: List[JsValue] = imagesInAlbum.filter(img => (img \ "id").as[String] != id)

      val rightsUpdates = processRightsUpdates(imagesToUpdate, Some(rcsRights))

      println(s"Copying rights to ${rightsUpdates.length} other image(s) from album $album.\n")
      rightsUpdates.foreach {
        case NewRights(imgId, syndicationRights) =>
          val rightsJson = Json.obj("id" -> id, "data" ->
            Json.obj("suppliers" -> syndicationRights.suppliers, "rights" -> syndicationRights.rights)).as[JsValue]

          println(s"Updating rights for id $imgId. New rights $rightsJson")
          notifications.publish(rightsJson, "apply-rcs-rights")
        case _ =>
      }
    }
    case None => for {
      image <- es.getImageById(id)
      album <- es.getAlbumForId(id)
      imagesInAlbum <- es.getAlbumImages(album)
    } yield {
      val imageToUpdate: List[JsValue] = image.toList
      val otherImages: List[JsValue] = imagesInAlbum.filter(img => (img \ "id").as[String] != id)

      val mostRecentSyndRights: Option[NewRights] = mostRecentSyndicationRights(otherImages)
      println(s"most recent synd rights $mostRecentSyndRights\n\n")
      println(s"images to update $imageToUpdate\n\n")

      val rightsUpdates = processRightsUpdates(imageToUpdate, mostRecentSyndRights.map(_.syndicationRights))
      println(s"rights updates $rightsUpdates")
      println(s"Updating rights of image with id $id based on the $album album.")
      rightsUpdates.foreach {
        case NewRights(imgId, syndicationRights) =>
          val rightsJson = Json.obj("id" -> id, "data" ->
            Json.obj("suppliers" -> syndicationRights.suppliers, "rights" -> syndicationRights.rights)).as[JsValue]

          println(s"Updating rights for id $imgId. New rights $syndicationRights")
          notifications.publish(rightsJson, "apply-rcs-rights")

        case RemoveRights =>
          val rightsJson = Json.obj("id" -> id, "data" -> "").as[JsValue]

          println(s"Updating rights for id $id. New rights $rightsJson")
          notifications.publish(rightsJson, "apply-rcs-rights")
        case _ =>
      }
    }
  }

  private def mostRecentSyndicationRights(images: List[JsValue]): Option[NewRights] = Try {
    images.flatMap { img =>
      (img \ "syndicationRights")
        .asOpt[SyndicationRights]
        .map(NewRights((img \ "id").as[String], _))
    }.maxBy { _.syndicationRights.published }
  }.toOption

  private def processRightsUpdates(images: List[JsValue], syndicationRights: Option[SyndicationRights]): List[SyndicationRightsUpdate] =
    images.map(processImage(_, syndicationRights))

  private def processImage(image: JsValue, syndicationRightsOpt: Option[SyndicationRights]): SyndicationRightsUpdate = {
    (syndicationRightsOpt, (image \ "syndicationRights").asOpt[SyndicationRights]) match {
      case (None, None) | (None, Some(SyndicationRights(None, _ , _))) => RemoveRights
      case (_, Some(SyndicationRights(Some(_), _, _))) => NoUpdate
      case (Some(_), None) | (Some(_), Some(SyndicationRights(None, _ , _))) =>
        NewRights((image \ "id").as[String], syndicationRightsOpt.get.copy(published = None))
    }
  }
}

sealed trait SyndicationRightsUpdate
case object NoUpdate extends SyndicationRightsUpdate
case object RemoveRights extends SyndicationRightsUpdate
case class NewRights(id: String, syndicationRights: SyndicationRights) extends SyndicationRightsUpdate