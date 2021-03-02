package com.gu.mediaservice

import java.net.URL

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
  def apply(services: Services, debugHttpResponse: Boolean = true)(implicit wsClient: WSClient): GridClient =
    new GridClient(services, debugHttpResponse)
}

class GridClient(services: Services, debugHttpResponse: Boolean)(implicit wsClient: WSClient) extends LazyLogging {

  def makeGetRequestAsync[T](
                           url: URL,
                           authFn: WSRequest => WSRequest,
                           foundFn: ResponseWrapper => T,
                           notFoundFn: ResponseWrapper => T,
                           errorFn: Option[ResponseWrapper => Exception] = None
                         )(
    implicit ec: ExecutionContext): Future[T] = {
    val request: WSRequest = wsClient.url(url.toString)
    val authorisedRequest = authFn(request)

    authorisedRequest.get().map { response =>
      validateResponse(response, url, foundFn, notFoundFn, errorFn)
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
      val json = code match {
        case 200 => Json.parse(body)
        case 404 => Json.obj()
        case _ =>
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
          Json.obj()
      }
      ResponseWrapper(json, code, body)
    } catch {
      case e: Exception =>
        val errorJson = Json.obj(
          "message" -> e.getMessage
        )
        logger.error(errorJson.toString(), e)
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
                                   foundFn: ResponseWrapper => T,
                                   notFoundFn: ResponseWrapper => T,
                                   errorFn: Option[ResponseWrapper => Exception]
                                 ): T = {
    val res = processResponse(response, url)
    res.statusCode match {
      case 200 => foundFn(res)
      case 404 => notFoundFn(res)
      case failCode => errorFn match {
        case Some(fn) => throw fn(res)
        case _ =>
          val errorMessage = s"Downstream API Failure: $url is in a bad state, code: $failCode"
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

  def getImageLoaderProjection(mediaId: String, imageLoaderEndpoint: String, authFn: WSRequest => WSRequest)
                              (implicit ec: ExecutionContext): Future[Option[Image]] = {
    logger.info("attempt to get image projection from image-loader")
    val url = new URL(s"$imageLoaderEndpoint/images/project/$mediaId")
    makeGetRequestAsync(
      url,
      authFn,
      {res:ResponseWrapper => Some(res.body.as[Image])},
      {_:ResponseWrapper => None}
    )
  }

  def getLeases(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[LeasesByMedia] = {
    logger.info("attempt to get leases")
    val url = new URL(s"${services.leasesBaseUri}/leases/media/$mediaId")
    makeGetRequestAsync(
      url,
      authFn,
      {res:ResponseWrapper => (res.body \ "data").as[LeasesByMedia]},
      {_:ResponseWrapper => LeasesByMedia.empty}
    )
  }

  def getEdits(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[Option[Edits]] = {
    logger.info("attempt to get edits")
    val url = new URL(s"${services.metadataBaseUri}/edits/$mediaId")
    makeGetRequestAsync(
      url,
      authFn,
      {res:ResponseWrapper => Some((res.body \ "data").as[Edits])},
      {_:ResponseWrapper => None}
    )
  }

  def getCrops(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[List[Crop]] = {
    logger.info("attempt to get crops")
    val url = new URL(s"${services.cropperBaseUri}/crops/$mediaId")
    makeGetRequestAsync(
      url,
      authFn,
      {res:ResponseWrapper => (res.body \ "data").as[List[Crop]]},
      {_:ResponseWrapper => Nil}
    )
  }

  def getUsages(mediaId: String, authFn: WSRequest => WSRequest)(implicit ec: ExecutionContext): Future[List[Usage]] = {
    logger.info("attempt to get usages")

    def unpackUsagesFromEntityResponse(resBody: JsValue): List[JsValue] = {
      (resBody \ "data").as[JsArray].value
        .map(entity => (entity.as[JsObject] \ "data").as[JsValue]).toList
    }

    val url = new URL(s"${services.usageBaseUri}/usages/media/$mediaId")
    makeGetRequestAsync(
      url,
      authFn,
      {res:ResponseWrapper => unpackUsagesFromEntityResponse(res.body).map(_.as[Usage])},
      {_:ResponseWrapper => Nil}
    )
  }

}

class DownstreamApiInBadStateException(message: String, downstreamMessage: String) extends IllegalStateException(message) {
  def getDownstreamMessage: String = downstreamMessage
}
