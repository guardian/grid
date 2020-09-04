package com.gu.mediaservice.model.leases

import com.gu.mediaservice.lib.formatting.printDateTime
import org.joda.time.DateTime
import play.api.libs.json.{JodaWrites, JsValue, Json, Writes}

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
