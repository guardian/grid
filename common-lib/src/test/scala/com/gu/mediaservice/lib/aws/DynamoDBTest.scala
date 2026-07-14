package com.gu.mediaservice.lib.aws

import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.libs.json.{Format, Json}

import scala.jdk.CollectionConverters._

class DynamoDBTest extends AnyFunSpec with Matchers {

  describe("removeExpr") {
    it("should generate the correction expression when the lastModified is set") {
      DynamoDB.removeExpr("key", Some("lastModifiedKey")) shouldBe "REMOVE key SET lastModifiedKey = :lastModifiedKey"
    }
    it("should generate the correction expression when the lastModified is not set") {
      DynamoDB.removeExpr("key", None) shouldBe "REMOVE key"
    }
  }

  describe("setExpr") {
    it("should generate the correction expression when the lastModified is set") {
      DynamoDB.setExpr("key", Some("lastModifiedKey")) shouldBe "SET key = :value, lastModifiedKey = :lastModifiedKey"
    }
    it("should generate the correction expression when the lastModified is not set") {
      DynamoDB.setExpr("key", None) shouldBe "SET key = :value"
    }
  }

  describe("addExpr") {
    it("should generate the correction expression when the lastModified is set") {
      DynamoDB.addExpr("key", Some("lastModifiedKey")) shouldBe "ADD key :value SET lastModifiedKey = :lastModifiedKey"
    }
    it("should generate the correction expression when the lastModified is not set") {
      DynamoDB.addExpr("key", None) shouldBe "ADD key :value"
    }
  }

  describe("deleteExpr") {
    it("should generate the correction expression when the lastModified is set") {
      DynamoDB.deleteExpr("key", Some("lastModifiedKey")) shouldBe
        "DELETE key :value SET lastModifiedKey = :lastModifiedKey"
    }
    it("should generate the correction expression when the lastModified is not set") {
      DynamoDB.deleteExpr("key", None) shouldBe "DELETE key :value"
    }
  }
}

case class SimpleDynamoDBObj(s: String, d: BigDecimal, b: Boolean, a: List[String])
object SimpleDynamoDBObj {
  implicit def formats: Format[SimpleDynamoDBObj] = Json.format[SimpleDynamoDBObj]
}

case class NestedDynamoDBObj(ss: String, dd: BigDecimal, bb: Boolean, simple: SimpleDynamoDBObj)
object NestedDynamoDBObj {
  implicit def formats: Format[NestedDynamoDBObj] = Json.format[NestedDynamoDBObj]
}
