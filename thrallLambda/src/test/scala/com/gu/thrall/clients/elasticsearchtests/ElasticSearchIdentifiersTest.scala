package com.gu.thrall.clients.elasticsearchtests

import com.gu.thrall.clients.ElasticSearch
import com.gu.thrall.config.Image
import org.apache.http.entity.ContentType
import org.apache.http.nio.entity.NStringEntity
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.concurrent.ScalaFutures._
import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatest.{FreeSpec, Matchers}

import scala.collection.JavaConverters._
import scala.io.Source

class ElasticSearchIdentifiersTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  def getRequestBody(name: String): NStringEntity =
    new NStringEntity(Source.fromResource(s"elasticSearchRequests/$name.request").getLines.mkString(""), ContentType.APPLICATION_JSON)

  implicit val patienceConfig: ScalaFutures.PatienceConfig = PatienceConfig(timeout = Span(2, Seconds), interval = Span(50, Millis))

  "talk data to local es with identifiers" - {

    val indexName = "plaindata"
    val es = new ElasticSearch("localhost", 9200, "http", indexName)
    val indexUrl = s"/$indexName"

    val id = "3"
    val data = s""" {"id": $id, "identifiers": {"identifier1": "one"} }"""
    val data_with_new_identifier = s""" {"id": $id, "identifiers": {"identifier2": "two"} }"""

    "Add an index" in {
      val entity = getRequestBody("createIndex")
      val response1 = es.restHighLevelClient.getLowLevelClient.performRequest("PUT", indexUrl, Map[String, String]().asJava, entity)
      response1.getStatusLine.getStatusCode shouldBe 200
    }

    "check no images present in the new index" in {
      whenReady(es.getImage(id)) {
        result =>
          result shouldBe Left(s"Failed to find a single image with id $id")
      }
    }

    "store image in the new index" in {
      whenReady(es.indexImage(id, data)) {
        result =>
          result shouldBe Right("Updated image index 3")
      }
      Thread.sleep(1000) // Required because ES only refreshes its shard every 1s
    }

    "get image from the new index" in {
      whenReady(es.getImage(id)) {
        result =>
          result shouldBe Right(Image("3", None, None, Some("""{"identifiers":{"identifier1":"one"},"id":3}""")))
      }
    }

    "update same image" in {
      whenReady(es.indexImage(id, data_with_new_identifier)) {
        result =>
          result shouldBe Right("Updated image index 3")
      }
      Thread.sleep(1000)
    }

    "get image again" in {
      whenReady(es.getImage(id)) {
        result =>
          result should matchPattern {
            case Right(Image("3", None, None, Some("""{"identifiers":{"identifier1":"one","identifier2":"two"},"id":3}"""))) =>
          }
      }
    }

    "delete image" in {
      whenReady(es.deleteImage(id)) {
        result =>
          result shouldBe Right("OK")
      }
      Thread.sleep(1000) //Again, let the elasticsearch index refresh happen
    }

    "get image yet again" in {
      whenReady(es.getImage(id)) {
        result =>
          result shouldBe Left(s"Failed to find a single image with id $id")
      }
    }

    "Delete an index" in {
      val entity = getRequestBody("deleteIndex")
      val response = es.restHighLevelClient.getLowLevelClient.performRequest("DELETE", indexUrl, Map[String, String]().asJava, entity)
      response.getStatusLine.getStatusCode shouldBe 200
    }

  }

  "talk data to local es with suggestions" - {

    val indexName = "suggestions"
    val es = new ElasticSearch("localhost", 9200, "http", indexName)
    val indexUrl = s"/$indexName"

    val id = "4"
    val data = s""" {"id": $id, "metadata": {"credit": "someone" } }"""
    val data_with_new_suggestion = s""" {"id": $id, "metadata": {"credit": "someone else" } }"""

    "Add an index" in {
      val entity = getRequestBody("createIndex")
      val response1 = es.restHighLevelClient.getLowLevelClient.performRequest("PUT", indexUrl, Map[String, String]().asJava, entity)
      response1.getStatusLine.getStatusCode shouldBe 200
    }

    "check no images present in the new index" in {
      whenReady(es.getImage(id)) {
        result =>
          result shouldBe Left(s"Failed to find a single image with id $id")
      }
    }

    "store image in the new index" in {
      whenReady(es.indexImage(id, data)) {
        result =>
          result shouldBe Right("Updated image index 4")
      }
      Thread.sleep(1000) // Required because ES only refreshes its shard every 1s
    }

    "get image" in {
      whenReady(es.getImage(id)) {
        result =>
          result should matchPattern {
            case Right(Image("4", None, None, Some(_))) =>
          }
      }
    }

    "store image in the new index with different suggestion" in {
      whenReady(es.indexImage(id, data_with_new_suggestion)) {
        result =>
          result shouldBe Right("Updated image index 4")
      }
      Thread.sleep(1000) // Required because ES only refreshes its shard every 1s
    }

    "get image again" in {
      whenReady(es.getImage(id)) {
        result =>
          result should matchPattern { case Right(Image("4", None, None, Some(_))) => }
      }
    }

    "delete image" in {
      whenReady(es.deleteImage(id)) {
        result =>
          result shouldBe Right("OK")
      }
      Thread.sleep(1000) //Again, let the elasticsearch index refresh happen
    }

    "get image yet again" in {
      whenReady(es.getImage(id)) {
        result =>
          result shouldBe Left(s"Failed to find a single image with id $id")
      }
    }


    "Delete an index" in {
      val entity = getRequestBody("deleteIndex")
      val response = es.restHighLevelClient.getLowLevelClient.performRequest("DELETE", indexUrl, Map[String, String]().asJava, entity)
      response.getStatusLine.getStatusCode shouldBe 200
    }

  }


  // TODO test metadata credit suggestions

  //    def updateImageUserMetadata(id: String, data: String, lastModified: Any): Future[String] = {Future({
    //      //    val data = metadata \ "data"
    //      //    val lastModified = metadata \ "lastModified"
    //      //    Future.sequence( withImageId(metadata)(id => es.applyImageMetadataOverride(id, data, lastModified)))
    //      // TODO Implement!
    //      ???
    //    })}
    //
    //    def updateImageLeases(id: String, data: String, lastModified: Any): Future[String] = {Future({
    //      //    Future.sequence( withImageId(leaseByMedia)(id => es.updateImageLeases(id, leaseByMedia \ "data", leaseByMedia \ "lastModified")) )
    //      // TODO Implement!
    //      ???
    //    })}
    //
    //    def setImageCollections(id: String, data: String): Future[String] = {Future({
    //      //    Future.sequence(withImageId(collections)(id => es.setImageCollection(id, collections \ "data")) )
    //      // TODO Implement!
    //      ???
    //    })}
    //
    //    def updateRcsRights(id: String, data: String): Future[String] = {Future({
    //      //      Future.sequence( withImageId(rights)(id => es.updateImageSyndicationRights(id, rights \ "data")) )
    //      // TODO Implement!
    //      ???
    //    })}

}


