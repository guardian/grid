package com.gu.mediaservice

import java.net.URL

import com.gu.mediaservice.lib.auth.provider.ApiKeyAuthentication
import com.gu.mediaservice.lib.config.Services
import com.gu.mediaservice.model.{Crop, Edits, Image}
import com.gu.mediaservice.model.leases.LeasesByMedia
import com.gu.mediaservice.model.usage.Usage
import com.typesafe.scalalogging.LazyLogging
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

case class ResponseWrapper(body: JsValue, statusCode: Int, bodyAsString: String)

object GridClient {
  def apply(apiKey: String, services: Services, maxIdleConnections: Int, debugHttpResponse: Boolean = true)(implicit wsClient: WSClient): GridClient =
    new GridClient(apiKey, services, maxIdleConnections, debugHttpResponse)
}

class GridClient(apiKey: String, services: Services, maxIdleConnections: Int, debugHttpResponse: Boolean)(implicit wsClient: WSClient) extends ApiKeyAuthentication with LazyLogging {

  def makeGetRequestAsync[T](
                           url: URL,
                           apiKey: String,
                           authFn: Option[WSRequest => WSRequest],
                           foundFn: ResponseWrapper => Option[T],
                           notFoundFn: ResponseWrapper => Option[T],
                           errorFn: Option[ResponseWrapper => Exception] = None
                         )(
    implicit ec: ExecutionContext): Future[Option[T]] = {
    val request: WSRequest = wsClient.url(url.toString)
    val authorisedRequest = authFn.map( fn => fn(request)).getOrElse(request.withHttpHeaders((apiKeyHeaderName, apiKey)))

    authorisedRequest.get().map { response =>
      validateResponse[T](response, url, foundFn, notFoundFn, errorFn, authFn.isDefined)
    }
  }

  private def processResponse(response: WSResponse, url: URL) = {
    val body = response.body
    val code = response.status
    val message = response.statusText
    val resInfo = Map(
      "statusCode" -> code.toString,
      "message" -> message
    )

    try {
      if (debugHttpResponse) logger.info(s"GET $url response: $resInfo")
      if (code != 200 && code != 404) {
        // Parse error messages from the response body JSON, if there are any
        val errorMessages = getErrorMessagesFromResponse(body)

        val errorJson = Json.obj(
          "errorStatusCode" -> code,
          "responseMessage" -> message,
          "responseBody" -> body,
          "message" -> errorMessages.errorMessage,
          "downstreamErrorMessage" -> errorMessages.downstreamErrorMessage,
          "url" -> url.toString,
        )
        logger.error(errorJson.toString())
      }
      val json = if (code == 200) Json.parse(body) else Json.obj()
      ResponseWrapper(json, code, body)
    } catch {
      case e: Exception =>
        val errorJson = Json.obj(
          "message" -> e.getMessage
        )
        logger.error(errorJson.toString())
        // propagating exception
        throw e
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


  private def validateResponse[T](
                                   response: WSResponse,
                                   url: URL,
                                   foundFn: ResponseWrapper => Option[T],
                                   notFoundFn: ResponseWrapper => Option[T],
                                   errorFn: Option[ResponseWrapper => Exception],
                                   usingAuthFn: Boolean
                                 ): Option[T] = {
    val res = processResponse(response, url)
    res.statusCode match {
      case 200 => foundFn(res)
      case 404 => notFoundFn(res)
      case failCode => errorFn match {
        case Some(fn) => throw fn(res)
        case _ =>
          val errorMessage = s"Downstream API Failure: $url is in a bad state, code: $failCode, using auth function: $usingAuthFn"
          val downstreamErrorMessage = res.bodyAsString

          val errorJson = Json.obj(
            "level" -> "ERROR",
            "errorStatusCode" -> failCode,
            "message" -> Json.obj(
              "errorMessage" -> errorMessage,
              "downstreamErrorMessage" -> downstreamErrorMessage
            )
          )
          logger.error(errorJson.toString())
          throw new DownstreamApiInBadStateException(errorMessage, downstreamErrorMessage)
      }
    }
  }

  def getImageLoaderProjection(mediaId: String, imageLoaderEndpoint: String, authFn: Option[WSRequest => WSRequest])
                              (implicit ec: ExecutionContext): Future[Option[Image]] = {
    logger.info("attempt to get image projection from image-loader")
    val url = new URL(s"$imageLoaderEndpoint/images/project/$mediaId")
    makeGetRequestAsync(
      url,
      apiKey,
      authFn,
      {res:ResponseWrapper => Some(res.body.as[Image])},
      {_:ResponseWrapper => None}
    )
  }

  def getLeases(mediaId: String, authFn: Option[WSRequest => WSRequest])(implicit ec: ExecutionContext): Future[Option[LeasesByMedia]] = {
    logger.info("attempt to get leases")
    val url = new URL(s"${services.leasesBaseUri}/leases/media/$mediaId")
    makeGetRequestAsync(
      url,
      apiKey,
      authFn,
      {res:ResponseWrapper => Some((res.body \ "data").as[LeasesByMedia])},
      {_:ResponseWrapper => Some(LeasesByMedia.empty)}
    )
  }

  def getEdits(mediaId: String, authFn: Option[WSRequest => WSRequest])(implicit ec: ExecutionContext): Future[Option[Edits]] = {
    logger.info("attempt to get edits")
    val url = new URL(s"${services.metadataBaseUri}/edits/$mediaId")
    makeGetRequestAsync(
      url,
      apiKey,
      authFn,
      {res:ResponseWrapper => Some((res.body \ "data").as[Edits])},
      {_:ResponseWrapper => None}
    )
  }

  def getCrops(mediaId: String, authFn: Option[WSRequest => WSRequest])(implicit ec: ExecutionContext): Future[Option[List[Crop]]] = {
    logger.info("attempt to get crops")
    val url = new URL(s"${services.cropperBaseUri}/crops/$mediaId")
    makeGetRequestAsync[List[Crop]](
      url,
      apiKey,
      authFn,
      {res:ResponseWrapper => Some((res.body \ "data").as[List[Crop]])},
      {_:ResponseWrapper => Some(Nil)}
    )
  }

  def getUsages(mediaId: String, authFn: Option[WSRequest => WSRequest])(implicit ec: ExecutionContext): Future[Option[List[Usage]]] = {
    logger.info("attempt to get usages")

    def unpackUsagesFromEntityResponse(resBody: JsValue): List[JsValue] = {
      (resBody \ "data").as[JsArray].value
        .map(entity => (entity.as[JsObject] \ "data").as[JsValue]).toList
    }

    val url = new URL(s"${services.usageBaseUri}/usages/media/$mediaId")
    makeGetRequestAsync(
      url,
      apiKey,
      authFn,
      {res:ResponseWrapper => Some(unpackUsagesFromEntityResponse(res.body).map(_.as[Usage]))},
      {_:ResponseWrapper => Some(Nil)}
    )
  }

}

class DownstreamApiInBadStateException(message: String, downstreamMessage: String) extends IllegalStateException(message) {
  def getDownstreamMessage: String = downstreamMessage
}
