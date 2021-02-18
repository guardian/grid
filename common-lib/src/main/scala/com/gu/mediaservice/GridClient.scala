package com.gu.mediaservice

import java.io.IOException
import java.net.URL

import com.gu.mediaservice.lib.auth.provider.ApiKeyAuthentication
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.model.{Crop, Edits, Image}
import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.typesafe.scalalogging.LazyLogging
import play.api.libs.json.{JsArray, JsObject, JsValue, Json}
import okhttp3._

import scala.concurrent.{ExecutionContext, Future, Promise}
import scala.util.{Failure, Success, Try}

object ClientResponse {
  case class Message(errorMessage: String, downstreamErrorMessage: String)

  object Message {
    implicit val reads = Json.reads[Message]
  }

  case class DownstreamMessage(errorKey: String, errorMessage: String)

  object DownstreamMessage {
    implicit val reads = Json.reads[DownstreamMessage]
  }

  case class Root(message: Message)

  object Root {
    implicit val reads = Json.reads[Root]
  }
}

case class ClientErrorMessages(errorMessage: String, downstreamErrorMessage: String)

case class ResponseWrapper(body: JsValue, statusCode: Int, bodyAsString: String)

object GridClient {
  def apply(apiKey: String, services: Services, maxIdleConnections: Int, debugHttpResponse: Boolean = true): GridClient =
    new GridClient(apiKey, services, maxIdleConnections, debugHttpResponse)
}

class GridClient(apiKey: String, services: Services, maxIdleConnections: Int, debugHttpResponse: Boolean) extends ApiKeyAuthentication with LazyLogging {

  import java.util.concurrent.TimeUnit

  private val pool = new ConnectionPool(maxIdleConnections, 5, TimeUnit.MINUTES)

  private val httpClient: OkHttpClient = new OkHttpClient.Builder()
    .connectTimeout(0, TimeUnit.MINUTES)
    .readTimeout(0, TimeUnit.MINUTES)
    .connectionPool(pool)
    .build()

  def makeGetRequestSync(url: URL, apiKey: String): ResponseWrapper = {
    val request = new Request.Builder().url(url).header(apiKeyHeaderName, apiKey).build
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
      val bodyAsString = body.string
      val message = response.message()
      val resInfo = Map(
        "statusCode" -> code.toString,
        "message" -> message
      )

      if (debugHttpResponse) logger.info(s"GET $url response: $resInfo")
      if (code != 200 && code != 404) {
        // Parse error messages from the response body JSON, if there are any
        val errorMessages = getErrorMessagesFromResponse(bodyAsString)

        val errorJson = Json.obj(
          "errorStatusCode" -> code,
          "responseMessage" -> message,
          "responseBody" -> bodyAsString,
          "message" -> errorMessages.errorMessage,
          "downstreamErrorMessage" -> errorMessages.downstreamErrorMessage,
          "url" -> url.toString,
        )
        logger.error(errorJson.toString())
      }
      val json = if (code == 200) Json.parse(bodyAsString) else Json.obj()
      ResponseWrapper(json, code, bodyAsString)
    } catch {
      case e: Exception =>
        val errorJson = Json.obj(
          "message" -> e.getMessage
        )
        logger.error(errorJson.toString())
        // propagating exception
        throw e
    } finally {
      body.close()
    }
  }

  private def getErrorMessagesFromResponse(responseStr: String): ClientErrorMessages = {
    Try(Json.parse(responseStr)) match {
      case Success(json) => {
        val response = json.asOpt[ClientResponse.Root]
        val errorMessage = response.map(_.message.errorMessage).getOrElse("No error message found")
        val maybeDownstrErr = response.map(_.message.downstreamErrorMessage)
        val downstreamErrorMessage = maybeDownstrErr.flatMap(getErrorMessageFromDownstreamResponse).getOrElse("No downstream error message found")
        ClientErrorMessages(errorMessage, downstreamErrorMessage)
      }
      case Failure(_) =>
        val jsonError = "Could not parse JSON body"
        ClientErrorMessages(jsonError, jsonError)
    }
  }

  private def getErrorMessageFromDownstreamResponse(downstreamResponseStr: String): Option[String] = {
    Try(Json.parse(downstreamResponseStr)) match {
      case Success(downstreamBodyAsJson) =>
        downstreamBodyAsJson.asOpt[ClientResponse.DownstreamMessage].map(_.errorMessage)
      case Failure(_) => None
    }
  }

  private def makeRequestAsync(url: URL, apiKey: String): Future[Response] = {
    val request = new Request.Builder().url(url).header(apiKeyHeaderName, apiKey).build
    val promise = Promise[Response]()
    httpClient.newCall(request).enqueue(new Callback {
      override def onFailure(call: Call, e: IOException): Unit = promise.failure(e)

      override def onResponse(call: Call, response: Response): Unit = promise.success(response)
    })
    promise.future
  }

  private def validateResponse(res: ResponseWrapper, url: URL): Unit = {
    import res._
    if (statusCode != 200 && statusCode != 404) {
      val errorMessage = s"breaking the circuit of full image projection, downstream API: $url is in a bad state, code: $statusCode"
      val downstreamErrorMessage = res.bodyAsString

      val errorJson = Json.obj(
        "level" -> "ERROR",
        "errorStatusCode" -> statusCode,
        "message" -> Json.obj(
          "errorMessage" -> errorMessage,
          "downstreamErrorMessage" -> downstreamErrorMessage
        )
      )
      logger.error(errorJson.toString())
      throw new DownstreamApiInBadStateException(errorMessage, downstreamErrorMessage)
    }
  }

  def getImageLoaderProjection(mediaId: String, imageLoaderEndpoint: String): Option[Image] = {
    logger.info("attempt to get image projection from image-loader")
    val url = new URL(s"${imageLoaderEndpoint}/images/project/$mediaId")
    val res = makeGetRequestSync(url, apiKey)
    validateResponse(res, url)
    logger.info(s"got image projection from image-loader for $mediaId with status code $res.statusCode")
    if (res.statusCode == 200) Some(res.body.as[Image]) else None
  }

  def getLeases(mediaId: String)(implicit ec: ExecutionContext): Future[LeasesByMedia] = {
    logger.info("attempt to get leases")
    val url = new URL(s"${services.leasesBaseUri}/leases/media/$mediaId")
    makeGetRequestAsync(url, apiKey).map { res =>
      validateResponse(res, url)
      if (res.statusCode == 200) (res.body \ "data").as[LeasesByMedia] else LeasesByMedia.empty
    }
  }

  def getEdits(mediaId: String)(implicit ec: ExecutionContext): Future[Option[Edits]] = {
    logger.info("attempt to get edits")
    val url = new URL(s"${services.metadataBaseUri}/edits/$mediaId")
    makeGetRequestAsync(url, apiKey).map { res =>
      validateResponse(res, url)
      if (res.statusCode == 200) Some((res.body \ "data").as[Edits]) else None
    }
  }

  def getCrops(mediaId: String)(implicit ec: ExecutionContext): Future[List[Crop]] = {
    logger.info("attempt to get crops")
    val url = new URL(s"${services.cropperBaseUri}/crops/$mediaId")
    makeGetRequestAsync(url, apiKey).map { res =>
      validateResponse(res, url)
      if (res.statusCode == 200) (res.body \ "data").as[List[Crop]] else Nil
    }
  }

  def getUsages(mediaId: String)(implicit ec: ExecutionContext): Future[List[Usage]] = {
    logger.info("attempt to get usages")

    def unpackUsagesFromEntityResponse(resBody: JsValue): List[JsValue] = {
      (resBody \ "data").as[JsArray].value
        .map(entity => (entity.as[JsObject] \ "data").as[JsValue]).toList
    }

    val url = new URL(s"${services.usageBaseUri}/usages/media/$mediaId")
    makeGetRequestAsync(url, apiKey).map { res =>
      validateResponse(res, url)
      if (res.statusCode == 200) unpackUsagesFromEntityResponse(res.body).map(_.as[Usage])
      else Nil
    }
  }



}

class DownstreamApiInBadStateException(message: String, downstreamMessage: String) extends IllegalStateException(message) {
  def getDownstreamMessage = downstreamMessage
}
