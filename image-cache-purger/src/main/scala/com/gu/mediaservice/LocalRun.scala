package com.gu.mediaservice

import com.amazonaws.services.lambda.runtime.events.SQSEvent

import scala.jdk.CollectionConverters.SeqHasAsJava

object LocalRun extends App {

  private val apiKeyProvider = DummyFastlyApiKeyProvider(
    sys.env.getOrElse("FASTLY_API_KEY", throw new IllegalStateException("FASTLY_API_KEY is not set"))
  )
  private val imageCachePurger = new ImageCachePurger(
    new FastlyPurger(apiKeyProvider, sys.env.getOrElse("STAGE", "CODE"))
  )

  imageCachePurger.handleRecord(new SQSEvent() {
    setRecords(List(new SQSEvent.SQSMessage() {
      setBody(
        """
          |{
          |  "Records": [
          |    {
          |      "s3": {
          |        "object": {
          |          "key": "a160358957624201fade81079a905b6a7600ad24/0_0_7243_4831/master/3538.jpg"
          |        }
          |      }
          |    }
          |  ]
          |}
          |""".stripMargin)
    }).asJava)
  })
}

