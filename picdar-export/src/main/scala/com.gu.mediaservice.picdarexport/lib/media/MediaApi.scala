package com.gu.mediaservice.picdarexport.lib.media

import java.net.URI

import com.gu.mediaservice.picdarexport.lib.{Config, LogHelper}

import scala.concurrent.Future
import scalaj.http.Http

case class Image(metadata: ImageMetadata, originalMetadata: ImageMetadata)

object MediaApi extends LogHelper {

  import Config.{mediaApiConnTimeout, mediaApiReadTimeout}

  def getImage(mediaUri: URI): Future[Image] = Future {
    logDuration("MediaApi.getImage") {
      val body = Http(mediaUri.toString).
        timeout(mediaApiConnTimeout, mediaApiReadTimeout).
        asString.
        body

      // TODO: extract metadata from JSON!
      // TODO: extract link to write metadata
      body
      Image()
    }
  }

}
