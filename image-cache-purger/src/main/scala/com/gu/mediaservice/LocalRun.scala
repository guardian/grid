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
          |          "key": "002c764d33119c7fd2893adec33ed41db35ca2ae/4_0_3492_2097/2000.jpg"
          |        }
          |      }
          |    }
          |  ]
          |}
          |""".stripMargin)
    }).asJava)
  })
}

