package com.gu.thrall

import com.gu.thrall.JsonParsing._
import com.gu.thrall.config._
import org.joda.time.DateTime
import org.scalatest.prop.{Checkers, PropertyChecks}
import org.scalatest.{FreeSpec, Matchers}
import play.api.libs.json._

import scala.io.Source

class MessageTest extends FreeSpec with Matchers with Checkers with PropertyChecks {

//  "invoking event" - {
//    val image = Image("banana", None, None, Some("{\"id\":\"banana\"}"))
//    val sns = Sns("TestInvoke", image)
//    val record = InvokingEventRecord("1.0", "eventsubscriptionarn", "aws:sns", sns)
//
//    "read sample sns" in {
//      val sampleSns = getMessage("sns")
//      JsonParsing.snsDetails(sampleSns) map {
//        result => result shouldBe sns
//      }
//    }
//    "read sample record" in {
//      val sampleEventRecord = getMessage("invoking-event-record")
//      JsonParsing.recordDetails(sampleEventRecord) map {
//        result =>  result shouldBe Right(record)
//      }
//    }
//    "read sample event" in {
//      val sampleEventMessage = getMessage("invoking-event")
//      val configEvent = new ConfigEvent()
//      configEvent.setInvokingEvent(sampleEventMessage)
//      whenReady(JsonParsing.eventDetails(configEvent)) {
//        result => {
//        result.records.head shouldBe record
//        result.records.tail.length shouldBe 0
//
//        }
//      }
//    }
//  }

  // Get and prettify json as a string
  def getMessage(name: String) = Json.stringify(
    Json.parse(
    Source
      .fromResource(s"messages/$name.message")
      .getLines
      .mkString("")))

  "Event contents" - {

    "delete-image" in {
      val message = JsonParsing.extractEither[Sns](getMessage("delete-image")).right.toOption.get.message
      message shouldBe Image("delete-image-id", None, None, Some("{\"id\":\"delete-image-id\"}"))
    }

    "image" in {
      val raw = getMessage("image")
      val imageText = (Json.parse(raw) \ "Message").validate[String].get
      val message = JsonParsing.extractEither[Sns](raw).right.toOption.get.message
      message shouldBe Image("image-id", None, Some(DateTime.parse("2018-07-18T12:07:20.372Z")), Some(imageText))
    }

    "set-image-collections" in {
      val raw = getMessage("set-image-collections")
      val imageText = (Json.parse(raw) \ "Message").validate[String].get
      val message = JsonParsing.extractEither[Sns](raw).right.toOption.get.message

      val data = Json.parse(
        "{\"id\":\"set-image-collections-id\",\"data\":[{\"path\":[\"Culture\",\"Reviews\",\"SUN\"],\"pathId\":\"culture/reviews/sun\",\"description\":\"SUN\",\"actionData\":{\"author\":\"josy.forsdike@guardian.co.uk\",\"date\":\"2018-07-04T14:13:57.048+00:00\"}},{\"path\":[\"Observer\",\"New Review\",\"Critics\",\"shorts\"],\"pathId\":\"observer/new review/critics/shorts\",\"description\":\"shorts\",\"actionData\":{\"author\":\"josy.forsdike@guardian.co.uk\",\"date\":\"2018-07-18T12:09:32.359+00:00\"}}]}"
      ) \ "data"

      message shouldBe Image("set-image-collections-id", Some(data.get), None, Some(imageText))
    }

    "update-image-exports" in {
      val raw = getMessage("update-image-exports")
      val imageText = (Json.parse(raw) \ "Message").validate[String].get
      val message = JsonParsing.extractEither[Sns](raw).right.toOption.get.message

      val data = Json.parse(
        "{\"id\":\"update-image-exports-id\",\"data\":[{\"id\":\"0_0_7360_4912\",\"author\":\"Adam.Mcculloch@guardian.co.uk\",\"date\":\"2018-07-18T12:07:00Z\",\"specification\":{\"uri\":\"https://api.media.gutools.co.uk/images/6713a3fd3f7ecadeef86c645e125ac74fae14c54\",\"bounds\":{\"x\":0,\"y\":0,\"width\":7360,\"height\":4912},\"type\":\"full\"},\"master\":{\"file\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/master/7360.jpg\",\"size\":49516673,\"mimeType\":\"image/jpeg\",\"dimensions\":{\"width\":7360,\"height\":4912},\"secureUrl\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/master/7360.jpg\"},\"assets\":[{\"file\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/2000.jpg\",\"size\":318308,\"mimeType\":\"jpg\",\"dimensions\":{\"width\":2000,\"height\":1335},\"secureUrl\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/2000.jpg\"},{\"file\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/1000.jpg\",\"size\":88976,\"mimeType\":\"jpg\",\"dimensions\":{\"width\":1000,\"height\":667},\"secureUrl\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/1000.jpg\"},{\"file\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/500.jpg\",\"size\":26524,\"mimeType\":\"jpg\",\"dimensions\":{\"width\":500,\"height\":334},\"secureUrl\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/500.jpg\"},{\"file\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/140.jpg\",\"size\":5695,\"mimeType\":\"jpg\",\"dimensions\":{\"width\":140,\"height\":93},\"secureUrl\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/140.jpg\"},{\"file\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/7360.jpg\",\"size\":4694664,\"mimeType\":\"jpg\",\"dimensions\":{\"width\":7360,\"height\":4912},\"secureUrl\":\"https://media.guim.co.uk/6713a3fd3f7ecadeef86c645e125ac74fae14c54/0_0_7360_4912/7360.jpg\"}]}]}"
      ) \ "data"

      message shouldBe Image("update-image-exports-id", Some(data.get), None, Some(imageText))
    }

    "update-image-usages" in {
      val raw = getMessage("update-image-usages")
      val imageText = (Json.parse(raw) \ "Message").validate[String].get
      val message = JsonParsing.extractEither[Sns](raw).right.toOption.get.message

      val data = Json.parse(
        "{\"id\":\"update-image-usages-id\",\"data\":[{\"id\":\"print/dfb05b73fe34083afabd8de5a47d057a_e46806dde2d317438e187835ad986f11\",\"references\":[{\"type\":\"indesign\",\"name\":\"2018-07-22, Observer, Critics (Observer Review), Page 40\"}],\"platform\":\"print\",\"media\":\"image\",\"status\":\"pending\",\"dateAdded\":\"2018-07-18T13:07:18.142Z\",\"lastModified\":\"2018-07-18T13:07:18.142Z\",\"printUsageMetadata\":{\"sectionName\":\"Critics (Observer Review)\",\"issueDate\":\"2018-07-22T00:00:00.000Z\",\"pageNumber\":40,\"storyName\":\"cumming.22july\",\"publicationCode\":\"obs\",\"publicationName\":\"Observer\",\"layoutId\":13812970,\"edition\":1,\"size\":{\"x\":744,\"y\":558},\"orderedBy\":\"Carol McDaid\",\"sectionCode\":\"2rc\"}}],\"lastModified\":\"2018-07-18T12:07:18.350Z\"}"
      ) \ "data"

      message shouldBe Image("update-image-usages-id", Some(data.get), Some(DateTime.parse("2018-07-18T12:07:18.350Z")), Some(imageText))
    }

    "update-image-user-metadata" in {
      val raw = getMessage("update-image-user-metadata")
      val imageText = (Json.parse(raw) \ "Message").validate[String].get
      val message = JsonParsing.extractEither[Sns](raw).right.toOption.get.message

      val data = Json.parse(
        "{\"id\":\"update-image-user-metadata-id\",\"data\":{\"archived\":false,\"labels\":[\"ASTRONOMY PHOTOGRAPHER\",\"bs\"],\"metadata\":{\"description\":\"Guardian of Tre Cime © Carlos F. Turienzo. EMBARGOED until 00.01am BST Thursday 19 July 2018* INSIGHT INVESTMENT ASTRONOMY PHOTOGRAPHER OF THE YEAR 2018 SHORTLISTED IMAGES\\nGuardian of Tre Cime © Carlos F. Turienzo (Spain)\\nThis panoramic image, composed out of eight photos, depicts the Milky Way emerging over the rocky Dolomites in Tre Crime on the left and on the right the lights from a house illuminating the beautiful terrain. The photographer noted that the image represents sharing unforgettable moment with the ones you love.    \\nTre Cime, Italy, 25 June 2017\",\"credit\":\"Carlos F. Turienzo\"},\"usageRights\":{\"category\":\"handout\"}},\"lastModified\":\"2018-07-18T12:08:30.021Z\"}"
      ) \ "data"

        message shouldBe Image("update-image-user-metadata-id", Some(data.get), Some(DateTime.parse("2018-07-18T12:08:30.021Z")), Some(imageText))
    }

    "bad" in {
      val message = JsonParsing.extractEither[Sns](getMessage("bad")).left.toOption.get
      message shouldBe "Unable to parse json"
    }
  }

  "a genuine message" - {
    "parse it" in {
      val original = getMessage("real-image")
      val image = JsonParsing.extractEither[Image](original).right.toOption.get
      image shouldBe Image("7cd035dc7a1283b4fd8555457fb1fa63b78049f5", None, Some(DateTime.parse("2015-09-23T22:37:02Z")), Some(original))
    }
  }

  "Elasticsearch response" - {
    "es" in {
      val message = JsonParsing.extractEither[ElasticSearchResponse](getMessage("es")).right.toOption.get
      message should matchPattern {
        case ElasticSearchResponse(
          None,
          Some(ElasticSearchHits(1, Some(List(ElasticSearchHit(Image("1", None, None, Some("{\"id\":1}"))))))),
          _) =>
      }
    }
  }

}


