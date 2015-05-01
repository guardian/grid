package com.gu.mediaservice.picdarexport.lib.media

import java.net.URI

import com.gu.mediaservice.lib.formatting._
import com.gu.mediaservice.model.{FileMetadata, ImageMetadata}
import play.api.libs.json._
import play.api.libs.functional.syntax._

import com.gu.mediaservice.picdarexport.lib.{Config, LogHelper}
import com.gu.mediaservice.picdarexport.lib.ExecutionContexts.mediaApi

import scala.concurrent.Future
import scalaj.http.{HttpOptions, Http}


case class ImageResource(data: Image)

object ImageResource {
  implicit val ImageResourceReads: Reads[ImageResource] = Json.reads[ImageResource]
}


case class Image(
  metadata: ImageMetadata,
  originalMetadata: ImageMetadata,
  metadataOverrideUri: URI
)

object Image {

  implicit val UriReads: Reads[URI] = __.read[String].map(URI.create)

  implicit val ImageReads: Reads[Image] =
    ((__ \ "metadata").read[ImageMetadata] ~
      (__ \ "originalMetadata").read[ImageMetadata] ~
      (__ \ "userMetadata" \ "data" \ "metadata" \ "uri").read[URI]
    )(Image.apply _)
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
      // FIXME: horrible hack, find a way to omit empty lists
      val metadataStringNoKeywords = metadataString.replace(""","keywords":[]""", "")
      val response = Http(metadataOverrideUri.toString).
        header("X-Gu-Media-Key", mediaApiKey).
        timeout(mediaApiConnTimeout, mediaApiReadTimeout).
        // Disable gzip as library doesn't seem to correctly decode response, and
        // it's tiny anyway
        compress(false).
        header("Content-Type", "application/json").
        // TODO: technically only for TEST
        option(HttpOptions.allowUnsafeSSL).
        postData(metadataStringNoKeywords).
        method("put").
        asString

      if (! response.is2xx) {
        throw MetadataOverrideError(response.body)
      }
    }
  }

}
