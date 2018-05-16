package com.gu.mediaservice.model

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json._


case class TestImage(name: String, usageRights: UsageRights)
object TestImage {
  implicit val jsonReads: Reads[TestImage] = Json.reads[TestImage]
  implicit val jsonWrites: Writes[TestImage] = Json.writes[TestImage]
}

class UsageRightsTest extends FunSpec with Matchers {

  val invalidCategory = "animated-gif"
  val invalidJson = Json.parse(s"""{ "category": "$invalidCategory", "fps": "∞" }""")

  it ("should serialise to JSON correctly") {
    val supplier = "Getty Images"
    val suppliersCollection = "AFP"
    val restrictions = Some("Don't use this")
    val usageRights: UsageRights = Agency(supplier, Some(suppliersCollection), restrictions = restrictions)

    val json = Json.toJson(usageRights)

    (json \ "category").as[String] should be (Agency.category)
    (json \ "supplier").as[String] should be (supplier)
    (json \ "suppliersCollection").as[String] should be (suppliersCollection)
    (json \ "restrictions").asOpt[String] should be (restrictions)
  }

  it ("should deserialise from JSON correctly") {
    val supplier = "Getty Images"
    val suppliersCollection = "AFP"
    val category = "agency"

    val json = Json.parse(
      s"""
        {
          "category": "agency",
          "supplier": "$supplier",
          "suppliersCollection": "$suppliersCollection"
        }
      """.stripMargin)

    val usageRights = json.as[UsageRights]

    usageRights should be (Agency(supplier, Some(suppliersCollection)))
  }


  // we have a slight edge case where NoRights is symbolised by `{}`
  it ("should deserialise to NoRights from {}") {
    val json = Json.parse("{}")
    val usageRights = json.as[UsageRights]

    usageRights should be (NoRights)
  }

  it ("should serialise to {} from NoRights") {
    val jsonString = Json.toJson(NoRights).toString()

     jsonString should be ("{}")
  }


  // invalid JSON
  it ("should return None if it cannot deserialise the JSON") {
    val usageRights = invalidJson.asOpt[UsageRights]

    usageRights should be (None)
  }

  it ("should through a `JsResultException` if you try to deserialise thr JSON with `as`") {
    val jsError = intercept[JsResultException] {
      invalidJson.as[UsageRights]
    }

    jsError.errors.headOption.foreach { case (path, errors) =>
      errors.head.message should be (s"No such usage rights category: $invalidCategory")
    }
  }

  it ("should deserialise as a property of a case class") {
    val noRights = TestImage("test", NoRights)
    val agency = TestImage("test", Agency("Getty Images"))

    (Json.toJson(noRights) \ "usageRights").get should be (NoRights.jsonVal)
    (Json.toJson(agency) \ "usageRights" \ "supplier").as[String] should be ("Getty Images")
  }

  it ("should serialise as a property of a case class") {
    val noRightsJson = Json.parse("""{ "name": "Test Image", "usageRights": {} }""")
    val agencyJson = Json.parse("""{ "name": "Test Image", "usageRights": { "category": "agency", "supplier": "Getty Images" } }""")

    val noRightsImage = noRightsJson.as[TestImage]
    noRightsImage.usageRights should be (NoRights)

    val agencyImage = agencyJson.as[TestImage]
    agencyImage.usageRights should be (Agency("Getty Images"))
  }

}


