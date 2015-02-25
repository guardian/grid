package com.gu.mediaservice.picdarexport.lib.media

import java.net.URI

import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.picdarexport.lib.{Config, LogHelper}
import com.gu.mediaservice.picdarexport.lib.ExecutionContexts.mediaApi

import scala.concurrent.Future
import scalaj.http.Http


case class ImageResource(data: Image)

object ImageResource {
  implicit val ImageResourceReads: Reads[ImageResource] = Json.reads[ImageResource]
}


case class Image(metadata: ImageMetadata, originalMetadata: ImageMetadata, metadataOverrideUri: URI)

object Image {

  implicit val UriReads: Reads[URI] = __.read[String].map(URI.create)

  implicit val ImageReads: Reads[Image] =
    ((__ \ "metadata").read[ImageMetadata] ~
      (__ \ "originalMetadata").read[ImageMetadata] ~
      (__ \ "userMetadata" \ "data" \ "metadata" \ "uri").read[URI]
    )(Image.apply _)
}


// FIXME: to be shared via common-lib
case class ImageMetadata(
//  dateTaken:           Option[DateTime],
  description:         Option[String],
  credit:              Option[String],
  byline:              Option[String],
  bylineTitle:         Option[String],
  title:               Option[String],
  copyrightNotice:     Option[String],
  copyright:           Option[String],
  suppliersReference:  Option[String],
  source:              Option[String],
  specialInstructions: Option[String],
// FIXME: leave it as a list, improve parsing
  keywords:            Option[List[String]],
  subLocation:         Option[String],
  city:                Option[String],
  state:               Option[String],
  country:             Option[String]
)

object ImageMetadata {
  implicit val ImageMetadataReads: Reads[ImageMetadata] = Json.reads[ImageMetadata]
  implicit val ImageMetadataWrites: Writes[ImageMetadata] = Json.writes[ImageMetadata]
}


// TODO: use generic argo types for this
case class ImageMetadataEntity(data: ImageMetadata)

object ImageMetadataEntity {
  implicit val ImageMetadataEntityWrites: Writes[ImageMetadataEntity] = Json.writes[ImageMetadataEntity]
}


case class MetadataOverrideError(message: String) extends Exception(message)

trait MediaApi extends LogHelper {

  val mediaApiKey: String

  import Config.{mediaApiConnTimeout, mediaApiReadTimeout}

  def getImage(mediaUri: URI): Future[Image] = Future {
    logDuration("MediaApi.getImage") {
      val body = Http(mediaUri.toString).
        header("X-Gu-Media-Key", mediaApiKey).
        timeout(mediaApiConnTimeout, mediaApiReadTimeout).
        // Disable gzip as library doesn't seem to correctly decode response, and
        // it's tiny anyway
        compress(false).
        asString.
        body

      Json.parse(body).as[ImageResource].data
    }
  }

  def overrideMetadata(metadataOverrideUri: URI, metadata: ImageMetadata): Future[Unit] = Future {
    logDuration("MediaApi.overrideMetadata") {
      val metadataString = Json.stringify(Json.toJson(ImageMetadataEntity(metadata)))
      val response = Http(metadataOverrideUri.toString).
        header("X-Gu-Media-Key", mediaApiKey).
        timeout(mediaApiConnTimeout, mediaApiReadTimeout).
        // Disable gzip as library doesn't seem to correctly decode response, and
        // it's tiny anyway
        compress(false).
        header("Content-Type", "application/json").
        postData(metadataString).
        method("put").
        asString

      if (! response.is2xx) {
        throw MetadataOverrideError(response.body)
      }
    }
  }

}
