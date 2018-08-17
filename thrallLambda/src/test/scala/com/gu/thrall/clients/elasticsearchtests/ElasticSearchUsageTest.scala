package com.gu.thrall.clients.elasticsearchtests

import com.gu.thrall.clients.ElasticSearch
import com.gu.thrall.config.Image
import org.apache.http.entity.ContentType
import org.apache.http.nio.entity.NStringEntity
import org.joda.time.DateTime
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.concurrent.ScalaFutures._
import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatest.{FreeSpec, Matchers}
import play.api.libs.json.Json

import scala.collection.JavaConverters._
import scala.io.Source

class ElasticSearchUsageTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  def getRequestBody(name: String): NStringEntity =
    new NStringEntity(Source.fromResource(s"elasticSearchRequests/$name.request").getLines.mkString(""), ContentType.APPLICATION_JSON)

  implicit val patienceConfig: ScalaFutures.PatienceConfig = PatienceConfig(timeout = Span(2, Seconds), interval = Span(50, Millis))

  "talk usage to local es" - {

    val indexName = "datawithusages"
    val es = new ElasticSearch("localhost", 9200, "http", indexName)
    val indexUrl = s"/$indexName"

    val id = "1"
    val data = s""" {"id": $id} """

    val nonExistentId = "1"

    "Add an index" in {
      val entity = getRequestBody("createIndex")
      val response1 = es.restHighLevelClient.getLowLevelClient.performRequest("PUT", indexUrl, Map[String, String]().asJava, entity)
      response1.getStatusLine.getStatusCode shouldBe 200
    }

    "check no images present in the new index" in {
      whenReady(es.getImage(id)) {
        result =>
          result shouldBe Left("Failed to find a single image with id 1")
      }
    }

    "store image in the new index" in {
      whenReady(es.indexImage(id, data)) {
        result =>
          result shouldBe Right("Updated image index 1")
      }
      Thread.sleep(1000) // Required because ES only refreshes its shard every 1s
    }

    "get image from the new index" in {
      whenReady(es.getImage(id)) {
        result =>
          result should matchPattern {
            case Right(Image("1", None, None, Some("""{"id":1}"""))) =>
          }
      }
    }

    "update same image" in {
      whenReady(es.indexImage(id, data)) {
        result =>
          result shouldBe Right("Updated image index 1")
      }
    }

    "get image again" in {
      whenReady(es.getImage(id)) {
        result =>
          result should matchPattern {
            case Right(Image("1", None, None, Some("""{"id":1}"""))) =>
          }
      }
    }

    "update image usages" in {
      whenReady(es.updateImageUsages(id, Json.parse("""{"test":"apples"}"""), DateTime.now())) {
        result =>
          result should matchPattern {
            case Right("Updated image 1, field usages") =>
          }
      }
      Thread.sleep(1000)
    }

    "get image again, now with usages" in {
      whenReady(es.getImage(id)) {
        result =>
          result shouldBe Right(Image("1", None, None, Some("""{"id":1,"usages":{"test":"apples"}}""")))
      }
    }

    "can't delete image" in {
      whenReady(es.deleteImage(id)) {
        result =>
          result shouldBe Left("Image not deletable")
      }
    }

    "delete usages" in {
      whenReady(es.deleteAllUsages(id)) {
        result =>
          result shouldBe Right("Deleted image 1, field usages")
      }
      Thread.sleep(1000)
    }

    "delete image" in {
      whenReady(es.deleteImage(id)) {
        result =>
          result shouldBe Right("OK")
      }
    }

    "update non-existent image usages" in {
      whenReady(es.updateImageUsages(nonExistentId, Json.parse("""{"test":"oranges"}"""), DateTime.now())) {
        result =>
          result should matchPattern {
            case Left(_) =>
          }
          result.left.get should include ("document_missing_exception")
      }
      Thread.sleep(1000)
    }


    "Delete an index" in {
      val entity = getRequestBody("deleteIndex")
      val response = es.restHighLevelClient.getLowLevelClient.performRequest("DELETE", indexUrl, Map[String, String]().asJava, entity)
      response.getStatusLine.getStatusCode shouldBe 200
    }

  }

}


