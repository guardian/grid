package com.gu.mediaservice

import com.gu.mediaservice.lib.config.{ServiceHosts, Services}
import com.gu.mediaservice.model.Image
import play.api.libs.json.Json

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.Duration
import scala.concurrent.{Await, Future}

class LambdaHandler {

  def handleImageProjection(params: java.util.Map[String, Object]) = {

    println(s"handleImageProjection input: $params")

    val mediaId = params.get("mediaId").asInstanceOf[String]

    val domainRoot = sys.env("DOMAIN_ROOT")
    // TODO consider using parameter store with KMS for API_KEY
    val apiKey = sys.env("API_KEY")
    val services = new Services(domainRoot, ServiceHosts.guardianPrefixes, Set.empty)

    val cfg = ImageDataMergerConfig(apiKey, services)

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
