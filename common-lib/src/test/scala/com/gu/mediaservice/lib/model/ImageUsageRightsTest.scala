package com.gu.mediaservice.model

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json._


class ImageUsageRightsTest extends FunSpec with Matchers {

  it("convert correctly to JSON") {
    val supplier = "Getty Images"
    val suppliersCollection = "AFP"
    val usageRights = ImageUsageRights(Some(Agency), Some(supplier), Some(suppliersCollection))
    val json = Json.toJson(usageRights)

    (json \ "category").as[String] should be (Agency.toString)
    (json \ "supplier").as[String] should be (supplier)
    (json \ "suppliersCollection").as[String] should be (suppliersCollection)
  }

  it("convert JSON correctly") {
    val supplier = "Getty Images"
    val suppliersCollection = "AFP"
    val json = Json.parse(
      s"""
        {
          "category": "${Agency.toString}",
          "supplier": "$supplier",
          "suppliersCollection": "$suppliersCollection"
        }
      """.stripMargin)

    val usageRights = json.as[ImageUsageRights]

    usageRights.category should be (Some(Agency))
    usageRights.supplier should be (Some(supplier))
    usageRights.suppliersCollection should be (Some(suppliersCollection))
  }

}


