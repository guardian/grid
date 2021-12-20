package com.gu.mediaservice.lib.config

import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers
import play.api.Configuration

class DomainMetadataSpecConfigTest extends AnyFreeSpec with Matchers {

  "The config loader" - {
    val configuration = Configuration.from(Map(
      "domainMetadata.specifications" -> List(
        Map(
          "name" -> "a",
          "label" -> "A",
          "description" -> "Description of A",
          "fields" -> List(
            Map(
              "name" -> "a.a",
              "label" -> "A.A",
              "type" -> "string"
            ),
            Map(
              "name" -> "a.b",
              "label" -> "A.B",
              "type" -> "datetime"
            ),
            Map(
              "name" -> "a.c",
              "label" -> "A.C",
              "type" -> "integer"
            ),
            Map(
              "name" -> "a.d",
              "label" -> "A.D",
              "type" -> "select",
              "options" -> List("Option 1", "Option 2")
            )
          )
        ),
        Map(
          "name" -> "b",
          "label" -> "B",
          "description" -> "Description of B",
          "fields" -> List(
            Map(
              "name" -> "b.a",
              "label" -> "B.A",
              "type" -> "string"
            )
          )
        )
      )
    ))

    val domainMetadataSpecifications: Seq[DomainMetadataSpec] = configuration
      .getOptional[Seq[DomainMetadataSpec]]("domainMetadata.specifications").getOrElse(Seq.empty)

    "should load domain metadata specification from configuration" in {
      domainMetadataSpecifications.nonEmpty shouldBe true
      domainMetadataSpecifications.length shouldBe 2

      domainMetadataSpecifications.headOption.nonEmpty shouldBe true
      val specificationA = domainMetadataSpecifications.head

      specificationA.name shouldBe "a"
      specificationA.label shouldBe "A"
      specificationA.description shouldBe Some("Description of A")
      specificationA.fields.length shouldBe 4
      specificationA.fields.map(_.name) shouldBe List("a.a", "a.b", "a.c", "a.d")
      specificationA.fields.map(_.label) shouldBe List("A.A", "A.B", "A.C", "A.D")
      specificationA.fields.map(_.fieldType) shouldBe List("string", "datetime", "integer", "select")
      specificationA.fields.find(_.options.nonEmpty).flatMap(_.options) shouldBe Some(List("Option 1", "Option 2"))


      domainMetadataSpecifications.lastOption.nonEmpty shouldBe true
      val specificationB = domainMetadataSpecifications.last

      specificationB.name shouldBe "b"
      specificationB.label shouldBe "B"
      specificationB.description shouldBe Some("Description of B")
      specificationB.fields.length shouldBe 1
    }
  }

}
