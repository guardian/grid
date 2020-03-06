package com.gu.mediaservice

import java.io.IOException
import java.net.URL

import com.gu.mediaservice.lib.auth.Authentication
import com.typesafe.scalalogging.LazyLogging
import okhttp3._
import play.api.libs.json.{JsValue, Json}
import scala.util.{Try, Success, Failure}

import scala.concurrent.{ExecutionContext, Future, Promise}

case class ResponseWrapper(body: JsValue, statusCode: Int, bodyAsString: String)

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
      val bodyAsString = body.string
      val message = response.message()
      val resInfo = Map(
        "statusCode" -> code.toString,
        "message" -> message
      )
      if (debugHttpResponse) logger.info(s"GET $url response: $resInfo")
      if (code != 200 && code != 404) {
        // Parse error messages from the response body JSON, if there are any
        val errorMessage = Try(Json.parse(bodyAsString)) match {
          case Success(bodyAsJson) => {
            val errorMessage = (bodyAsJson \ "message" \ "errorMessage").asOpt[String].getOrElse("No error message found")
            val maybeDownstreamErrorAsString = (bodyAsJson \ "message" \ "downstreamErrorMessage").asOpt[String]
            val downstreamErrorMessage = maybeDownstreamErrorAsString.flatMap(downstreamError => {
              val errorAsJson = Json.parse(downstreamError)
              (errorAsJson \ "errorMessage").asOpt[String]
            }).getOrElse("No downstream error message found")
            (errorMessage, downstreamErrorMessage)
          }
          case Failure(_) =>
            val jsonError = "Could not parse JSON body"
            (jsonError, jsonError)
        }

        val errorJson = Json.obj(
          "errorStatusCode" -> code,
          "responseMessage" -> message,
          "responseBody" -> bodyAsString,
          "errorMessage" -> errorMessage._1,
          "downstreamErrorMessage" -> errorMessage._2,
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

