package com.gu.mediaservice.model

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json._


class UsageRightsTest extends FunSpec with Matchers {

  val invalidJson = Json.parse("""{ "category": "animated-gif", "fps": "∞" }""")

  it ("should serialise to JSON correctly") {
    val supplier = "Getty Images"
    val suppliersCollection = "AFP"
    val usageRights = Agency(supplier, Some(suppliersCollection))

    val json = Json.toJson(usageRights)(Agency.jsonWrites)

    (json \ "category").as[String] should be (usageRights.category)
    (json \ "supplier").as[String] should be (supplier)
    (json \ "suppliersCollection").as[String] should be (suppliersCollection)
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

    usageRights.category should be (category)
    usageRights should be (Agency(supplier, Some(suppliersCollection)))
  }


  // we have a slight edge case where NoRights is symbolised by `{}`
  it ("should deserialise to NoRights from {}") {
    val json = Json.parse("{}")
    val usageRights = json.as[UsageRights]

     usageRights should be (NoRights)
  }

  it ("should serialise to {} from NoRights") {
    val jsonString = Json.toJson(NoRights)(NoRights.jsonWrites).toString()

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

    jsError.errors.headOption.map { case (path, errors) =>
      errors.head.message should be ("No such usage rights category")
    }
  }

}


