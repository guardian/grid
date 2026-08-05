package com.gu.mediaservice.model

import org.scalatest.Ignore
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.{JsResultException, Json}

class UsageRightsV2Test extends AnyFunSpec with Matchers {

  val invalidCategory = "animated-gif"
  val invalidJson = Json.parse(s"""{ "category": "$invalidCategory", "fps": "∞" }""")


   ignore("should serialise to JSON correctly")  {
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

  ignore ("should deserialise from JSON correctly") {
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

  implicit val usageConifg: UsageRightsConfiguration = new UsageRightsConfiguration(List(UsageRightsConfig(
    "",
    "Unknown Rights",
    "Images which we do not currently have the rights to use.",
    Nil,
    Nil,
    Nil
  )))

  // we have a slight edge case where NoRights is symbolised by `{}`
  it ("should deserialise to NoRights from {}") {
    val json = Json.parse("{}")

    val usageRights = json.as[UsageRightsV2]

    usageRights should be (
      UsageRightsV2("")
    )
  }

  it ("should serialise to {} from NoRights") {
    val jsonString = Json.toJson(UsageRightsV2("")).toString()

    jsonString should be ("{}")
  }

  // invalid JSON
  it ("should return None if it cannot deserialise the JSON") {
    val usageRights = invalidJson.asOpt[UsageRightsV2]

    usageRights should be (None)
  }

  it ("should through a `JsResultException` if you try to deserialise the JSON with `as`") {
    val jsError = intercept[JsResultException] {
      invalidJson.as[UsageRightsV2]
    }

    jsError.errors.headOption.foreach { case (path, errors) =>
      errors.head.message should be (s"No such usage rights category: $invalidCategory")
    }
  }

  ignore("should deserialise as a property of a case class") {
    val noRights = TestImage("test", NoRights)
    val agency = TestImage("test", Agency("Getty Images"))

    (Json.toJson(noRights) \ "usageRights").get should be (NoRights.jsonVal)
    (Json.toJson(agency) \ "usageRights" \ "supplier").as[String] should be ("Getty Images")
  }

  ignore ("should serialise as a property of a case class") {
    val noRightsJson = Json.parse("""{ "name": "Test Image", "usageRights": {} }""")
    val agencyJson = Json.parse("""{ "name": "Test Image", "usageRights": { "category": "agency", "supplier": "Getty Images" } }""")

    val noRightsImage = noRightsJson.as[TestImage]
    noRightsImage.usageRights should be (NoRights)

    val agencyImage = agencyJson.as[TestImage]
    agencyImage.usageRights should be (Agency("Getty Images"))
  }

  ignore("deserialise a legacy category and map to the appropriate category") {
    it("handout") {
      val json = Json.parse(
        s"""
        {
          "category": "handout",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("handout"))
    }
    it("PR Image") {
      val json = Json.parse(
        s"""
        {
          "category": "PR Image",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("PR Image"))
    }

    // TODO -> figure out how to display source
    it("Screengrab") {
      val json = Json.parse(
        s"""
        {
          "category": "screengrab",
          "source": "source",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("screengrab"), Some("source"))
    }

    it("Social Media") {
      val json = Json.parse(
        s"""
        {
          "category": "social-media",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("social-media"))
    }
    // TODO - how do we want to handle mapping these fields?
    it("Creative Commons") {
      val json = Json.parse(
        s"""
        {
          "category": "creative-commons",
          "licence":"CC BY-4.0",
          "source":"source",
          "creator":"creator",
          "contentLink":"link to content",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(
        Some("restrictions"),
        Some("creative-commons"),
        Some("source")
      )
    }

    it("Pool") {
      val json = Json.parse(
        s"""
        {
          "category": "pool",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("pool"))
    }

    it("Crown copyright") {
      val json = Json.parse(
        s"""
        {
          "category": "crown-copyright",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("crown-copyright"))
    }

    it("Obituary") {
      val json = Json.parse(
        s"""
        {
          "category": "obituary",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("obituary"))
    }
    // TODO - how to handle additional fields
    it("Agency - subscription") {
      val json = Json.parse(
        s"""
        {
          "category": "agency",
          "supplier":"Action Images",
          "suppliersCollection":"collection",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("agency"))
    }
    // TODO - how to handle additional fields
    it("Agency - commissioned") {
      val json = Json.parse(
        s"""
        {
          "category": "commissioned-agency",
          "supplier":"Action Images",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("commissioned-agency"))
    }

    it("Public Domain") {
      val json = Json.parse(
        s"""
        {
          "category": "public-domain",
          "restrictions": "restrictions"
        }
      """.stripMargin)

      val usageRights = json.as[UsageRights]

      usageRights shouldBe PrAndThirdParty(Some("restrictions"), Some("public-domain"))
    }
  }


}
