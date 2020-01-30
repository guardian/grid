package com.gu.mediaservice

import play.api.libs.json.Json

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.Duration

class LambdaHandler {

  def handleImageProjection(mediaId: String) = {

    val cfg = ImageDataMergerConfig(
      apiKey = sys.env("API_KEY"),
      imgLoaderApiBaseUri = "https://loader.media.test.dev-gutools.co.uk",
      collectionsApiBaseUri = "https://media-collections.test.dev-gutools.co.uk",
      metadataApiBaseUri = "https://media-metadata.test.dev-gutools.co.uk",
      cropperApiBaseUri = "https://cropper.media.test.dev-gutools.co.uk",
      leasesApiBaseUri = "https://media-leases.test.dev-gutools.co.uk",
      usageBaseApiUri = "https://media-usage.test.dev-gutools.co.uk"
    )

    println(s"starting handleImageProjection for mediaId=$mediaId")
    println(s"with config: $cfg")

    val merger = new ImageDataMerger(cfg)

    val maybeImageFuture = merger.getMergedImageData(mediaId)

    val maybeJson = maybeImageFuture.map { imgFuture =>
      val img = Await.result(imgFuture, Duration.Inf)
      Json.toJson(img)
    }

    maybeJson match {
      case Some(img) =>
        println(s"image projected \n $img")
        img
      case _ => Json.obj("message" -> s"image with id=$mediaId not-found")
    }
  }
}
