package com.gu.mediaservice

import okhttp3.mockwebserver.{MockResponse, MockWebServer}
import org.scalatest.{FlatSpec, Matchers}
import play.api.libs.json.{JsString, Json}

class GridClientTest extends FlatSpec with Matchers {
  it should "return nothing & the body as string if error code is not 200" in {
    val downstreamMessage = Json.obj(
      "errorKey" -> "Example key",
      "errorMessage" -> "Example message"
    )
    val responseBodyJson = Json.obj(
      "message" -> Json.obj(
        "errorMessage" -> "An error occurred",
        "downstreamErrorMessage" -> JsString(downstreamMessage.toString)
      )
    )
    val responseBody = responseBodyJson.toString

    val server = new MockWebServer()
    server.enqueue(
      new MockResponse().setBody(responseBody).setResponseCode(500));
    server.start();
    val serverUrl = server.url("")
    val javaUrl = serverUrl.url()
    val emptyJson = Json.obj()

    val client = new GridClient(1, true)
    val response = client.makeGetRequestSync(javaUrl, "exampleKey")
    val expectedResponse = ResponseWrapper(emptyJson, 500, responseBody)

    expectedResponse shouldEqual response
  }

  it should "respond with parsed body if error code is 200" in {
    val responseBodyJson = Json.obj(
      "message" -> Json.obj("errorMessage" -> "An error occurred")
    )

    val responseBody = responseBodyJson.toString
    val server = new MockWebServer()
    server.enqueue(
      new MockResponse().setBody(responseBody).setResponseCode(200));
    server.start();
    val serverUrl = server.url("")
    val javaUrl = serverUrl.url()

    val client = new GridClient(1, true)
    val response = client.makeGetRequestSync(javaUrl, "exampleKey")
    val expectedResponse =
      ResponseWrapper(responseBodyJson, 200, responseBody.toString)

    expectedResponse shouldEqual response
  }
}
