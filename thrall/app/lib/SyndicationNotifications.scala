package lib

import com.gu.mediaservice.lib.logging.GridLogger
import com.gu.mediaservice.model.{Image, SyndicationRights}
import play.api.libs.json.Json

class SyndicationNotifications(thrallNotifications: ThrallNotifications) {
  def sendRemoval(images: List[Image]): Unit =
    images.foreach(sendRemoval)

  def sendRemoval(image: Image): Unit = {
    GridLogger.info("deleting inferred rights", image.id)
    thrallNotifications.publish(
      Json.obj("id" -> image.id),
      subject = SyndicationNotifications.deleteSubject
    )
  }

  def sendRefresh(images: List[Image], syndicationRights: SyndicationRights): Unit =
    images.foreach(sendRefresh(_, syndicationRights))

  def sendRefresh(image: Image, syndicationRights: SyndicationRights): Unit = {
    GridLogger.info(s"refreshing inferred rights", image.id)
    val inferredRights = syndicationRights.copy(published = None)

    val message = Json.obj(
      "id" -> image.id,
      "data" -> Json.toJson(inferredRights)
    )
    thrallNotifications.publish(
      message,
      subject = SyndicationNotifications.refreshSubject
    )
  }
}

object SyndicationNotifications {
  val refreshSubject = "refresh-inferred-rights"
  val deleteSubject = "delete-inferred-rights"
}
