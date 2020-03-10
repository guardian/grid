package com.gu.mediaservice

import org.scalatest.{FlatSpec, Matchers}
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.MockResponse
import java.net.URL
import play.api.libs.json.Json
import play.api.libs.json.JsString

class GridClientTest extends FlatSpec with Matchers {
  it should "parse error messages correctly" in {
    val downstreamMessage = Json.obj(
      "errorKey"-> "Example key",
      "errorMessage" ->"Example message"
    )
    val responseBodyJson = Json.obj(
      "message" -> Json.obj(
        "errorMessage" -> "An error occurred",
        "downstreamErrorMessage" -> JsString(downstreamMessage.toString)
      )
    )
    val responseBody = responseBodyJson.toString

    val server = new MockWebServer()
    server.enqueue(new MockResponse().setBody(responseBody).setResponseCode(500));
    server.start();
    val serverUrl = server.url("")
    val javaUrl = serverUrl.url()

    val client = new GridClient(1, true)
    val response = client.makeGetRequestSync(javaUrl, "exampleKey")
    val expectedResponse = ResponseWrapper(Json.obj(), 500, responseBody)

    expectedResponse shouldEqual response
  }
}
