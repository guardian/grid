package com.gu.mediaservice

import java.net.URL
import com.gu.mediaservice.GridClient.{Error, Found, NotFound, Response}
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.model.{Collection, Crop, Edits, Image, ImageMetadata}
import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.typesafe.scalalogging.LazyLogging
import play.api.http.HeaderNames
import play.api.libs.json.{JsArray, JsObject, JsValue, Json, Reads}

import scala.concurrent.{ExecutionContext, Future}
import scala.util.{Failure, Success, Try}
import play.api.libs.ws.{WSClient, WSRequest, WSResponse}

object ClientResponse {
  case class Message(errorMessage: String, downstreamErrorMessage: String)

  object Message {
    implicit val reads: Reads[Message] = Json.reads[Message]
  }

  case class DownstreamMessage(errorKey: String, errorMessage: String)

  object DownstreamMessage {
    implicit val reads: Reads[DownstreamMessage] = Json.reads[DownstreamMessage]
  }

  case class Root(message: Message)

  object Root {
    implicit val reads: Reads[Root] = Json.reads[Root]
  }
}

case class ClientErrorMessages(errorMessage: String, downstreamErrorMessage: String)

object GridClient extends LazyLogging {
  def apply(services: Services)(implicit wsClient: WSClient): GridClient =
    new GridClient(services)

  sealed trait Response {
    def status: Int
    def underlying: WSResponse
    def contentLength: Option[Long] =
      underlying.header(HeaderNames.CONTENT_LENGTH).flatMap(v => Try(v.toLong).toOption)
  }

  case class Found(json: JsValue, underlying: WSResponse) extends Response {
    val status = 200
  }
  case class NotFound(body: String, underlying: WSResponse) extends Response {
    val status = 404
  }
  case class Error(status: Int, url: URL, underlying: WSResponse) extends Response {
    def logErrorAndThrowException(): Nothing = {
      val errorMessages = getErrorMessagesFromResponse(underlying.body)

      val body: String = underlying.body
      val errorJson = Json.obj(
        "errorStatusCode" -> status,
        "responseMessage" -> underlying.statusText,
        "responseBody" -> body,
        "message" -> errorMessages.errorMessage,
        "downstreamErrorMessage" -> errorMessages.downstreamErrorMessage,
        "url" -> url.toString,
      )
      logger.error(errorJson.toString())
      throw new DownstreamApiInBadStateException(errorMessages.errorMessage, errorMessages.downstreamErrorMessage)
    }
  }

  private def getErrorMessagesFromResponse(responseStr: String): ClientErrorMessages = {
    Try(Json.parse(responseStr)) match {
      case Success(json) =>
        val response = json.asOpt[ClientResponse.Root]
        val errorMessage = response.map(_.message.errorMessage).getOrElse("No error message found")
        val maybeDownstrErr = response.map(_.message.downstreamErrorMessage)
        val downstreamErrorMessage = maybeDownstrErr.flatMap(getErrorMessageFromDownstreamResponse).getOrElse("No downstream error message found")
        ClientErrorMessages(errorMessage, downstreamErrorMessage)
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

}

class GridClient(services: Services)(implicit wsClient: WSClient) extends LazyLogging {

  def makeGetRequestAsync(url: URL, authFn: WSRequest => WSRequest)
                         (implicit ec: ExecutionContext): Future[Response] = {
    val request: WSRequest = wsClient.url(url.toString)
    val authorisedRequest = authFn(request)
    authorisedRequest.get().map { response => validateResponse(response, url)}
  }

  private def validateResponse(
                                   response: WSResponse,
                                   url: URL
                                 ): Response = {
    response.status match {
      case 200 => Found(Json.parse(response.body), response)
      case 404 => NotFound(response.body, response)
      case failCode => Error(failCode, url, response)
    }
  }

  def validateApiKey(projectionEndpoint: String, authFn: WSRequest => WSRequest)
                    (implicit ec: ExecutionContext): Future[Boolean] = {
    val projectionUrl = new URL(s"$projectionEndpoint/")
    makeGetRequestAsync(projectionUrl, authFn) map {
      case Found(_, _) => true
      case NotFound(_, _) => true
      case Error(_, _, _) => throw new Exception("Authorisation failed")
    }
  }

  def getImageLoaderProjection(mediaId: String, authFn: WSRequest => WSRequest)
                              (implicit ec: ExecutionContext): Future[Option[Image]] = {
    getImageLoaderProjection(mediaId, services.loaderBaseUri, authFn)
  }

  def getImageLoaderProjection(mediaId: String, imageLoaderEndpoint: String, authFn: WSRequest => WSRequest)
                              (implicit ec: ExecutionContext): Future[Option[Image]] = {
    logger.info("attempt to get image projection from image-loader")
    val url = new URL(s"$imageLoaderEndpoint/images/project/$mediaId")
    makeGetRequestAsync(url, authFn) map {
      case Found(json, _) => Some(json.as[Image])
      case NotFound(_, _) => None
      case e@Error(_, _, _) => e.logErrorAndThrowException()
    }
  }

  def getLeases(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[LeasesByMedia] = {
    logger.info("attempt to get leases")
    val url = new URL(s"${services.leasesBaseUri}/leases/media/$mediaId")
    makeGetRequestAsync(url, authFn) map {
      case Found(json, _) => (json \ "data").as[LeasesByMedia]
      case NotFound(_, _) => LeasesByMedia.empty
      case e@Error(_, _, _) => e.logErrorAndThrowException()
    }
  }

  def getCollections(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[List[Collection]] = {
    logger.info("attempt to get collections")
    val url = new URL(s"${services.collectionsBaseUri}/images/$mediaId")
    makeGetRequestAsync(url, authFn) map {
      case Found(json, _) => (json \ "data").as[List[Collection]]
      case NotFound(_, _) => Nil
      case e@Error(_, _, _) => e.logErrorAndThrowException()
    }
  }

  def getEdits(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[Option[Edits]] = {
    logger.info("attempt to get edits")
    val url = new URL(s"${services.metadataBaseUri}/edits/$mediaId")
    makeGetRequestAsync(url, authFn) map {
      case Found(json, _) => Some((json \ "data").as[Edits])
      case NotFound(_, _) => None
      case e@Error(_, _, _) => e.logErrorAndThrowException()
    }
  }

  def getUploadedBy(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[Option[String]] = {
    logger.info("attempt to get uploadedBy")
    val url = new URL(s"${services.apiBaseUri}/images/$mediaId/uploadedBy")
    makeGetRequestAsync(url, authFn) map {
      case Found(json, _) => Some((json \ "data").as[String])
      case NotFound(_, _) => None
      case e@Error(_, _, _) => e.logErrorAndThrowException()
    }
  }

  def getCrops(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[List[Crop]] = {
    logger.info("attempt to get crops")
    val url = new URL(s"${services.cropperBaseUri}/crops/$mediaId")
    makeGetRequestAsync(url, authFn) map {
      case Found(json, _) => (json \ "data").as[List[Crop]]
      case NotFound(_, _) => Nil
      case e@Error(_, _, _) => e.logErrorAndThrowException()
    }
  }

  def getUsages(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[List[Usage]] = {
    logger.info("attempt to get usages")

    def unpackUsagesFromEntityResponse(resBody: JsValue): List[JsValue] = {
      (resBody \ "data").as[JsArray].value
        .map(entity => (entity.as[JsObject] \ "data").as[JsValue]).toList
    }

    val url = new URL(s"${services.usageBaseUri}/usages/media/$mediaId")
    makeGetRequestAsync(url, authFn) map {
      case Found(json, _) => unpackUsagesFromEntityResponse(json).map(_.as[Usage])
      case NotFound(_, _) => Nil
      case e@Error(_, _, _) => e.logErrorAndThrowException()
    }
  }

  def getMetadata(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[ImageMetadata] = {
    logger.info("attempt to get metadata")
    val url = new URL(s"${services.apiBaseUri}/images/$mediaId")
    makeGetRequestAsync(url, authFn) map {
      case Found(json, _) => (json \ "data" \ "metadata").as[ImageMetadata]
      case nf@NotFound(_, _) => Error(nf.status, url, nf.underlying).logErrorAndThrowException()
      case e@Error(_, _, _) => e.logErrorAndThrowException()
    }
  }

}

class DownstreamApiInBadStateException(message: String, downstreamMessage: String) extends IllegalStateException(message) {
  def getDownstreamMessage: String = downstreamMessage
}
