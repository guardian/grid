package com.gu.mediaservice

import com.gu.mediaservice.model.Image
import play.api.libs.json.Json

import scala.concurrent.{Await, Future}
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.Duration

class LambdaHandler {

  def handleImageProjection(params: java.util.Map[String, Object]) = {

    println(s"handleImageProjection input: $params")

    val mediaId = params.get("mediaId").asInstanceOf[String]

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

    val maybeImageFuture: Future[Option[Image]] = merger.getMergedImageData(mediaId.asInstanceOf[String])

    val mayBeImage: Option[Image] = Await.result(maybeImageFuture, Duration.Inf)

    mayBeImage match {
      case Some(img) =>
        println(s"image projected \n $img")
        Json.toJson(img)
      case _ =>
        val emptyRes = Json.obj("message" -> s"image with id=$mediaId not-found")
        println(s"image not projected \n $emptyRes")
        emptyRes
    }
  }
}
