package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.model.Image._
import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.model.{Collection, Crop, Edits, Image}
import okhttp3.{OkHttpClient, Request}
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future}

case class ImageDataMergerConfig(apiKey: String, services: Services) {
  def isValidApiKey(): Boolean = {
    // Make an API key authenticated request to the leases API as a way of validating the API key.
    // A 200 indicates a valid key.
    // Using leases because its a low traffic API.
    GridClient.makeGetRequest(new URL(services.leasesBaseUri), apiKey).statusCode == 200
  }
}

case class ResponseWrapper(body: JsValue, statusCode: Int)

object GridClient {
  private val httpClient = new OkHttpClient

  def makeGetRequest(url: URL, apiKey: String): ResponseWrapper = {
    val request = new Request.Builder().url(url).header(Authentication.apiKeyHeaderName, apiKey).build
    val response = httpClient.newCall(request).execute
    import response._
    val resInfo = Map(
      "status-code" -> response.code.toString,
      "message" -> response.message
    )
    println(s"GET $url response: $resInfo")
    val json = if (code == 200) Json.parse(body.string) else Json.obj()
    ResponseWrapper(json, code)
  }
}

class ImageDataMerger(config: ImageDataMergerConfig)(implicit ec: ExecutionContext) {

  import config._
  import services._

  def getMergedImageData(mediaId: String): Future[Option[Image]] = {
    val maybeImage: Option[Image] = getImageLoaderProjection(mediaId)
    maybeImage match {
      case Some(img) =>  aggregate(img).map(Some(_))
      case None => Future(None)
    }
  }

  private def aggregate(image: Image): Future[Image] = {
    println(s"starting to aggregate image")
    val mediaId = image.id
    for {
      collections <- getCollectionsResponse(mediaId)
      edits <- getEdits(mediaId)
      leases <- getLeases(mediaId)
      usages <- getUsages(mediaId)
      crops <- getCrops(mediaId)
    } yield image.copy(
      collections = collections,
      userMetadata = edits,
      leases = leases,
      usages = usages,
      exports = crops
    )
  }

  private def getImageLoaderProjection(mediaId: String): Option[Image] = {
    println("attempt to get image projection from image-loader")
    val url = new URL(s"$loaderBaseUri/images/project/$mediaId")
    val res = GridClient.makeGetRequest(url, apiKey)
    import res._
    println(s"got image projection from image-loader for $mediaId with status code $statusCode")
    if (statusCode == 200) Some(body.as[Image]) else None
  }

  private def getCollectionsResponse(mediaId: String): Future[List[Collection]] = Future {
    println("attempt to get collections")
    val url = new URL(s"$collectionsBaseUri/images/$mediaId")
    val res = GridClient.makeGetRequest(url, apiKey)
    if (res.statusCode == 200) (res.body \ "data").as[List[Collection]] else Nil
  }

  private def getEdits(mediaId: String): Future[Option[Edits]] = Future {
    println("attempt to get edits")
    val url = new URL(s"$metadataBaseUri/edits/$mediaId")
    val res = GridClient.makeGetRequest(url, apiKey)
    if (res.statusCode == 200) Some((res.body \ "data").as[Edits]) else None
  }

  private def getCrops(mediaId: String): Future[List[Crop]] = Future {
    println("attempt to get crops")
    val url = new URL(s"$cropperBaseUri/crops/$mediaId")
    val res = GridClient.makeGetRequest(url, apiKey)
    if (res.statusCode == 200) (res.body \ "data").as[List[Crop]] else Nil
  }

  private def getLeases(mediaId: String): Future[LeasesByMedia] = Future {
    println("attempt to get leases")
    val url = new URL(s"$leasesBaseUri/leases/media/$mediaId")
    val res = GridClient.makeGetRequest(url, apiKey)
    if (res.statusCode == 200) (res.body \ "data").as[LeasesByMedia] else LeasesByMedia.empty
  }

  private def getUsages(mediaId: String): Future[List[Usage]] = Future {
    println("attempt to get usages")
    def unpackUsagesFromEntityResponse(resBody: JsValue): List[JsValue] = {
      (resBody \ "data").as[JsArray].value
        .map(entity => (entity.as[JsObject] \ "data").as[JsValue]).toList
    }

    val url = new URL(s"$usageBaseUri/usages/media/$mediaId")
    val res = GridClient.makeGetRequest(url, apiKey)
    if (res.statusCode == 200) unpackUsagesFromEntityResponse(res.body).map(_.as[Usage])
    else Nil
  }
}
