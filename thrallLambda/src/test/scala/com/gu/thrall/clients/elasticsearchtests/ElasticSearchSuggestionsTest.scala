package com.gu.thrall.clients.elasticsearchtests

import com.gu.thrall.JsonParsing
import com.gu.thrall.clients.ElasticSearch
import com.gu.thrall.config.{ElasticSearchHits, ElasticSearchResponse, Image}
import org.apache.http.entity.ContentType
import org.apache.http.nio.entity.NStringEntity
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.concurrent.ScalaFutures._
import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatest.{FreeSpec, Matchers}

import scala.collection.JavaConverters._
import scala.io.Source

class ElasticSearchSuggestionsTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

  def getRequestBody(name: String): NStringEntity =
    new NStringEntity(Source.fromResource(s"elasticSearchRequests/$name.request").getLines.mkString(""), ContentType.APPLICATION_JSON)

  implicit val patienceConfig: ScalaFutures.PatienceConfig = PatienceConfig(timeout = Span(2, Seconds), interval = Span(50, Millis))

  "talk data to local es with suggestions" - {

    val indexName = "suggestions"
    val es = new ElasticSearch("localhost", 9200, "http", indexName)
    val indexUrl = s"/$indexName"

    val id = "4"
    val searchName = "credit"
    val data = s""" {"id": $id, "metadata": {"credit": "someone" } }"""
    val data_with_new_suggestion = s""" {"id": $id, "metadata": {"credit": "somebody else" } }"""

    "Add an index with a suggestion mapping" in {
      val mappingScript =
        s"""
           |{
           |  "mappings": {
           |    "image" : {
           |      "properties" : {
           |        "suggestMetadataCredit" : {
           |          "type" : "completion"
           |        },
           |        "title" : {
           |          "type": "keyword"
           |        }
           |      }
           |    }
           |  }
           |}
         """.stripMargin

      es.restHighLevelClient.getLowLevelClient.performRequest(
        "PUT",
        s"/$indexName",
        Map[String, String]().asJava,
        new NStringEntity(
          mappingScript, ContentType.APPLICATION_JSON)
      ).getStatusLine.getReasonPhrase
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
          result should matchPattern { case Right(Image("4", None, None, Some(_))) => }
      }
    }

    "get no suggestions via search for 'else'" in {
      val parsedResponse = es.getSuggestion("else", "suggestMetadataCredit", searchName)

      parsedResponse should matchPattern {
        case Right(ElasticSearchResponse(None, Some(ElasticSearchHits(0, _)), _)) =>
      }

      ((parsedResponse.right.get.suggest \ searchName).get(0) \ "options").get.as[List[String]].size shouldBe 0
    }

    "get one suggestion via search for 'some'" in {
      val parsedResponse = es.getSuggestion("some", "suggestMetadataCredit", searchName)

      parsedResponse should matchPattern {
        case Right(ElasticSearchResponse(None, Some(ElasticSearchHits(0, _)), _)) =>
      }

      val image = JsonParsing.imageDetails((((parsedResponse.right.get.suggest \ searchName).get(0) \ "options").get(0) \ "_source").get)

      image should matchPattern {
        case Right(Image("4", None, None, _)) =>
      }

    }
    "get one suggestion via search for 'someone'" in {
      val parsedResponse = es.getSuggestion("someone", "suggestMetadataCredit", searchName)

      parsedResponse should matchPattern {
        case Right(ElasticSearchResponse(None, Some(ElasticSearchHits(0, _)), _)) =>
      }

      val image = JsonParsing.imageDetails((((parsedResponse.right.get.suggest \ searchName).get(0) \ "options").get(0) \ "_source").get)

      image should matchPattern {
        case Right(Image("4", None, None, _)) =>
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
          result should matchPattern { case Right(Image("4", None, None, _)) => }
      }
    }

    "still get no suggestions via search for 'else'" in {
      val parsedResponse = es.getSuggestion("else", "suggestMetadataCredit", searchName)

      parsedResponse should matchPattern {
        case Right(ElasticSearchResponse(None, Some(ElasticSearchHits(0, _)), _)) =>
      }

      ((parsedResponse.right.get.suggest \ searchName).get(0) \ "options").get.as[List[String]].size shouldBe 0
    }

    "still get one suggestion via search for 'some'" in {
      val parsedResponse = es.getSuggestion("some", "suggestMetadataCredit", searchName)

      parsedResponse should matchPattern {
        case Right(ElasticSearchResponse(None, Some(ElasticSearchHits(0, _)), _)) =>
      }

      val image = JsonParsing.imageDetails((((parsedResponse.right.get.suggest \ searchName).get(0) \ "options").get(0) \ "_source").get)

      image should matchPattern {
        case Right(Image("4", None, None, Some(_))) =>
      }

    }

    "get no suggestions via search for 'someone'" in {
      val parsedResponse = es.getSuggestion("someone", "suggestMetadataCredit", searchName)

      parsedResponse should matchPattern {
        case Right(ElasticSearchResponse(None, Some(ElasticSearchHits(0, _)), _)) =>
      }

      ((parsedResponse.right.get.suggest \ searchName).get(0) \ "options").get.as[List[String]].size shouldBe 0

    }

    "get one suggestion via search for 'somebody'" in {
      val parsedResponse = es.getSuggestion("somebody", "suggestMetadataCredit", searchName)

      parsedResponse should matchPattern {
        case Right(ElasticSearchResponse(None, Some(ElasticSearchHits(0, _)), _)) =>
      }

      val image = JsonParsing.imageDetails((((parsedResponse.right.get.suggest \ searchName).get(0) \ "options").get(0) \ "_source").get)

      image should matchPattern {
        case Right(Image("4", None, None, _)) =>
      }

    }

    "get one suggestion via fuzzy search for 'smbody'" in {
      val parsedResponse = es.getSuggestion("smbody", "suggestMetadataCredit", searchName, fuzzy = 2)

      parsedResponse should matchPattern {
        case Right(ElasticSearchResponse(None, Some(ElasticSearchHits(0, _)), _)) =>
      }

      val image = JsonParsing.imageDetails((((parsedResponse.right.get.suggest \ searchName).get(0) \ "options").get(0) \ "_source").get)

      image should matchPattern {
        case Right(Image("4", None, None, _)) =>
      }

    }

    "get no suggestions via fuzzy search for 'sbody' (too many text changes)" in {
      val parsedResponse = es.getSuggestion("sbody", "suggestMetadataCredit", searchName, fuzzy = 2)

      parsedResponse should matchPattern {
        case Right(ElasticSearchResponse(None, Some(ElasticSearchHits(0, _)), _)) =>
      }

      ((parsedResponse.right.get.suggest \ searchName).get(0) \ "options").get.as[List[String]].size shouldBe 0

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
}


