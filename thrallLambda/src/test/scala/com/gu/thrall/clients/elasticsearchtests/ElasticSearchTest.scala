package com.gu.thrall.clients.elasticsearchtests

import com.gu.thrall.clients.ElasticSearch
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.concurrent.ScalaFutures._
import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatest.{FreeSpec, Matchers}
class ElasticSearchTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  implicit val patienceConfig: ScalaFutures.PatienceConfig = PatienceConfig(timeout = Span(2, Seconds), interval = Span(50, Millis))

  "talk to local es" - {

    val indexName = "ignore"
    val es = new ElasticSearch("localhost", 9200, "http", indexName)

    "es running" in {
      val response = es.restHighLevelClient
        .getLowLevelClient
        .performRequest("GET", "/")
      response.getStatusLine.getProtocolVersion.getProtocol shouldBe "HTTP"
      response.getStatusLine.getProtocolVersion.getMajor shouldBe 1
      response.getStatusLine.getProtocolVersion.getMinor shouldBe 1
      response.getStatusLine.getStatusCode shouldBe 200
      response.getStatusLine.getReasonPhrase shouldBe "OK"
    }
  }

}


