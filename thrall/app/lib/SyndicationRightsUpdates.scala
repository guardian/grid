package lib

import com.gu.mediaservice.model.SyndicationRights
import play.api.libs.json.{JsValue, Json}

case class SyndicationRightsUpdates(id: String, rights: JsValue) {
  def toJson = Json.obj("id" -> id, "data" -> rights).as[JsValue]
}
object SyndicationRightsUpdates {
  private def processImage(image: JsValue, rcsSyndicationRights: SyndicationRights): Option[SyndicationRightsUpdates] = {
    val imageRights = (image \ "syndicationRights").asOpt[SyndicationRights]

    if (rcsSyndicationRights.rightsAcquired) {
      if(imageRights.isEmpty)
        Some(SyndicationRightsUpdates((image \ "id").as[String], Json.toJson(rcsSyndicationRights.copy(published = None))))
      else if(imageRights.exists(_.rightsAcquired))
        Some(SyndicationRightsUpdates((image \ "id").as[String], Json.toJson(rcsSyndicationRights.copy(published = imageRights.flatMap(_.published)))))
      else None
    } else None
  }


  def processRightsUpdates(images: List[JsValue], rcsSyndicationRights: SyndicationRights): List[SyndicationRightsUpdates] =
    images.flatMap(processImage(_, rcsSyndicationRights))
}