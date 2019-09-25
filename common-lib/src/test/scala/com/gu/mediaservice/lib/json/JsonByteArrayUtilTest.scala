package com.gu.mediaservice.lib.json

import org.scalatest.{FunSuite, Matchers}
import play.api.libs.json.Json

case class Shape(name: String, numberOfSides: Int)

object Shape {
  implicit val reads = Json.reads[Shape]
  implicit val writes = Json.writes[Shape]
}

class JsonByteArrayUtilTest extends FunSuite with Matchers {
  val circle = Shape("circle", 1)
  val triangle = Shape("triangle", 3)
  val square = Shape("square", 4)

  test("To compressed byte array and back again") {
    val bytes = JsonByteArrayUtil.toByteArray(circle)
    JsonByteArrayUtil.fromByteArray[Shape](bytes) shouldBe Some(circle)
  }

  test("From byte array into different type") {
    val bytes = JsonByteArrayUtil.toByteArray(square)
    JsonByteArrayUtil.fromByteArray[String](bytes) shouldBe None
  }

  test("Compressing... compresses") {
    // gzip compression is only effective above a certain length
    // compressing `circle` by itself results in a longer byte array 😅
    val shapes = List(circle, triangle, square)

    val uncompressedBytes = Json.toBytes(Json.toJson(shapes))
    val compressedBytes = JsonByteArrayUtil.toByteArray(shapes)
    compressedBytes.length < uncompressedBytes.length shouldBe true

    JsonByteArrayUtil.fromByteArray[List[Shape]](compressedBytes) shouldBe Some(shapes)
  }
}
