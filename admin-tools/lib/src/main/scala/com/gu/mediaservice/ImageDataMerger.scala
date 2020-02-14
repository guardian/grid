package com.gu.mediaservice

import java.io.IOException
import java.net.URL

import com.gu.mediaservice.lib.auth.Authentication
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.gu.mediaservice.model.{Collection, Crop, Edits, Image}
import com.typesafe.scalalogging.LazyLogging
import okhttp3._
import play.api.libs.json._

import scala.concurrent.{ExecutionContext, Future, Promise}

case class ImageDataMergerConfig(apiKey: String, services: Services, gridClient: GridClient) {
  def isValidApiKey(): Boolean = {
    // Make an API key authenticated request to the leases API as a way of validating the API key.
    // A 200 indicates a valid key.
    // Using leases because its a low traffic API.
    gridClient.makeGetRequestSync(new URL(services.leasesBaseUri), apiKey).statusCode == 200
  }
}

case class ResponseWrapper(body: JsValue, statusCode: Int)

object GridClient {
  def apply(maxIdleConnections: Int, debugHttpResponse: Boolean = true): GridClient = new GridClient(maxIdleConnections, debugHttpResponse)
}

class GridClient(maxIdleConnections: Int, debugHttpResponse: Boolean) extends LazyLogging {

  import java.util.concurrent.TimeUnit

  private val pool = new ConnectionPool(maxIdleConnections, 5, TimeUnit.MINUTES)

  private val httpClient: OkHttpClient = new OkHttpClient.Builder()
    .connectTimeout(0, TimeUnit.MINUTES)
    .readTimeout(0, TimeUnit.MINUTES)
    .connectionPool(pool)
    .build()

  def makeGetRequestSync(url: URL, apiKey: String): ResponseWrapper = {
    val request = new Request.Builder().url(url).header(Authentication.apiKeyHeaderName, apiKey).build
    val response = httpClient.newCall(request).execute
    processResponse(response, url)
  }

  def makeGetRequestAsync(url: URL, apiKey: String)(implicit ec: ExecutionContext): Future[ResponseWrapper] = {
    makeRequestAsync(url, apiKey).map { response =>
      processResponse(response, url)
    }
  }

  private def processResponse(response: Response, url: URL) = {
    val body = response.body()
    val code = response.code()
    try {
      val resInfo = Map(
        "status-code" -> code.toString,
        "message" -> response.message()
      )
      if (debugHttpResponse) logger.info(s"GET $url response: $resInfo")
      if (serverErrorType(code)) throw new IllegalStateException(s"projection server error, calling $url return statusCode: $code")
      val json = if (code == 200) Json.parse(body.string) else Json.obj()
      response.close()
      ResponseWrapper(json, code)
    } catch {
      case e: Exception =>
        // propagating exception
        throw e
    } finally {
      body.close()
    }
  }

  private def serverErrorType(code: Int): Boolean = (code / 100) == 5

  private def makeRequestAsync(url: URL, apiKey: String): Future[Response] = {
    val request = new Request.Builder().url(url).header(Authentication.apiKeyHeaderName, apiKey).build
    val promise = Promise[Response]()
    httpClient.newCall(request).enqueue(new Callback {
      override def onFailure(call: Call, e: IOException): Unit = promise.failure(e)

      override def onResponse(call: Call, response: Response): Unit = promise.success(response)
    })
    promise.future
  }
}

class ImageDataMerger(config: ImageDataMergerConfig, gridClient: GridClient) extends LazyLogging {

  import config._
  import services._

  def getMergedImageData(mediaId: String)(implicit ec: ExecutionContext): Future[Option[Image]] = {
    val maybeImage: Option[Image] = getImageLoaderProjection(mediaId)
    maybeImage match {
      case Some(img) => aggregate(img).map(Some(_))
      case None => Future(None)
    }
  }

  private def aggregate(image: Image)(implicit ec: ExecutionContext): Future[Image] = {
    logger.info(s"starting to aggregate image")
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
    logger.info("attempt to get image projection from image-loader")
    val url = new URL(s"$loaderBaseUri/images/project/$mediaId")
    val res = gridClient.makeGetRequestSync(url, apiKey)
    logger.info(s"got image projection from image-loader for $mediaId with status code $res.statusCode")
    if (res.statusCode == 200) Some(res.body.as[Image]) else None
  }

  private def getCollectionsResponse(mediaId: String)(implicit ec: ExecutionContext): Future[List[Collection]] = {
    logger.info("attempt to get collections")
    val url = new URL(s"$collectionsBaseUri/images/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      if (res.statusCode == 200) (res.body \ "data").as[List[Collection]] else Nil
    }
  }

  private def getEdits(mediaId: String)(implicit ec: ExecutionContext): Future[Option[Edits]] = {
    logger.info("attempt to get edits")
    val url = new URL(s"$metadataBaseUri/edits/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      if (res.statusCode == 200) Some((res.body \ "data").as[Edits]) else None
    }
  }

  private def getCrops(mediaId: String)(implicit ec: ExecutionContext): Future[List[Crop]] = {
    logger.info("attempt to get crops")
    val url = new URL(s"$cropperBaseUri/crops/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      if (res.statusCode == 200) (res.body \ "data").as[List[Crop]] else Nil
    }
  }

  private def getLeases(mediaId: String)(implicit ec: ExecutionContext): Future[LeasesByMedia] = {
    logger.info("attempt to get leases")
    val url = new URL(s"$leasesBaseUri/leases/media/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      if (res.statusCode == 200) (res.body \ "data").as[LeasesByMedia] else LeasesByMedia.empty
    }
  }

  private def getUsages(mediaId: String)(implicit ec: ExecutionContext): Future[List[Usage]] = {
    logger.info("attempt to get usages")

    def unpackUsagesFromEntityResponse(resBody: JsValue): List[JsValue] = {
      (resBody \ "data").as[JsArray].value
        .map(entity => (entity.as[JsObject] \ "data").as[JsValue]).toList
    }

    val url = new URL(s"$usageBaseUri/usages/media/$mediaId")
    gridClient.makeGetRequestAsync(url, apiKey).map { res =>
      if (res.statusCode == 200) unpackUsagesFromEntityResponse(res.body).map(_.as[Usage])
      else Nil
    }
  }
}
