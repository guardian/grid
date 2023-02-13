package lib

import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers
import play.api.Configuration

class MetadataTemplateConfigTest extends AnyFreeSpec with Matchers {

  "The config loader" - {
    val configuration = Configuration.from(Map(
      "metadata.templates" -> List(
        Map(
          "templateName" -> "A",
          "usageRights" -> Map(
            "category" -> "social-media",
            "restrictions" -> "Sample social media restriction"
          ),
          "metadataFields" -> List(
            Map(
              "name" -> "byline",
              "value" -> "Sample byline from template",
              "resolveStrategy" -> "replace"
            )
          ),
          "leases" -> List(
            Map(
              "leaseType" -> "allow-use",
              "notes" -> "Sample allow cropping lease note"
            ),
            Map(
              "leaseType" -> "deny-syndication",
              "notes" -> "Sample deny syndication lease note"
            )
          )
        ),
        Map(
          "templateName" -> "B",
          "metadataFields" -> List(
            Map(
              "name" -> "specialInstructions",
              "value" -> "Sample special instructions from template",
              "resolveStrategy" -> "append"
            )
          )
        ),
        Map(
          "templateName" -> "C",
          "usageRights" -> Map(
            "category" -> "composite",
            "creator" -> "Creator A",
            "photographer" -> "Photographer A",
            "publication" -> "Publication A",
            "suppliers" -> "Supplier A",
            "restrictions" -> "Sample composite restriction",
          ),
        )
      )
    ))

    val metadataTemplates: Seq[MetadataTemplate] = configuration
      .getOptional[Seq[MetadataTemplate]]("metadata.templates").getOrElse(Seq.empty)

    "should return a list of templates when metadata.templates is configured" in {
      metadataTemplates.nonEmpty shouldBe true
      metadataTemplates.length shouldBe 3
    }

    "should return a template with leases, usage rights and metadata fields" in {
      metadataTemplates.headOption.nonEmpty shouldBe true
      val template = metadataTemplates.head
      template.templateName shouldBe "A"
      template.usageRights shouldBe defined

      val leases = template.leases
      leases.nonEmpty shouldBe true

      val usageRights = template.usageRights.get
      usageRights.category shouldBe "social-media"
      usageRights.restrictions shouldBe Some("Sample social media restriction")

      template.metadataFields.nonEmpty shouldBe true
      template.metadataFields.length shouldBe 1

      val field = template.metadataFields.head
      field.name shouldBe "byline"
      field.value shouldBe "Sample byline from template"
      field.resolveStrategy shouldBe FieldResolveStrategy.replace
    }

    "should return a template metadata fields only" in {
      val template = metadataTemplates.tail.head
      template.templateName shouldBe "B"
      template.usageRights shouldBe None

      template.metadataFields.nonEmpty shouldBe true
      template.metadataFields.length shouldBe 1

      val fieldA = template.metadataFields.head
      fieldA.name shouldBe "specialInstructions"
      fieldA.value shouldBe "Sample special instructions from template"
      fieldA.resolveStrategy shouldBe FieldResolveStrategy.append
    }

    "should return a template usage rights only" in {
      val template = metadataTemplates.tail.last
      template.templateName shouldBe "C"
      template.metadataFields.isEmpty shouldBe true
      template.usageRights shouldBe defined

      val usageRights = template.usageRights.get
      usageRights.category shouldBe "composite"
      usageRights.creator shouldBe Some("Creator A")
      usageRights.photographer shouldBe Some("Photographer A")
      usageRights.publication shouldBe Some("Publication A")
      usageRights.restrictions shouldBe Some("Sample composite restriction")
      usageRights.suppliers shouldBe Some("Supplier A")
    }
  }

}
