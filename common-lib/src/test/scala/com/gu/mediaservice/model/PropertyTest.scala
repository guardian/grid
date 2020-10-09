package com.gu.mediaservice.model

import org.scalatest.{FunSpec, Matchers}
import play.api.libs.json.Json

class PropertyTest extends FunSpec with Matchers {
  it("should omit None values from written json") {
    val property = Property("foo", None, None)
    val actual = Json.stringify(Json.toJson(property))
    val expected = """{"propertyCode":"foo"}"""
    actual should be (expected)
  }

  it("should write optional fields that have a value") {
    val property = Property("foo", None, Some("bar"))
    val actual = Json.stringify(Json.toJson(property))
    val expected = """{"propertyCode":"foo","value":"bar"}"""
    actual should be (expected)
  }
}
