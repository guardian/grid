package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model._
import org.scalatest.{Matchers, FunSpec}

class SupplierProcessorsTest extends FunSpec with Matchers with MetadataHelper {

  it("should leave supplier, suppliersCollection and credit empty by default") {
    val image = createImageFromMetadata()
    val processedImage = applyProcessors(image)

    processedImage.usageRights should be(NoRights)
    processedImage.metadata.credit should be (None)
  }

  it("should leave supplier and suppliersCollection empty if credit doesn't match") {
    val image = createImageFromMetadata("credit" -> "Unknown Party")
    val processedImage = applyProcessors(image)
    processedImage.usageRights should be (NoRights)
    processedImage.metadata.credit should be (Some("Unknown Party"))
  }


  describe("AAP") {
    it("should match AAPIMAGE credit") {
      val image = createImageFromMetadata("credit" -> "AAPIMAGE")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("AAP", None))
      processedImage.metadata.credit should be(Some("AAP"))
    }
  }


  describe("Action Images") {
    it("should match Action Images credit") {
      val image = createImageFromMetadata("credit" -> "Action Images")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Action Images"))
      processedImage.metadata.credit should be(Some("Action Images"))
    }
  }


  describe("Alamy") {
    it("should match Alamy credit") {
      val image = createImageFromMetadata("credit" -> "Alamy")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Alamy"))
      processedImage.metadata.credit should be(Some("Alamy"))
    }
  }


  describe("AP") {
    it("should match AP credit") {
      val image = createImageFromMetadata("credit" -> "AP")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("AP"))
      processedImage.metadata.credit should be(Some("AP"))
    }

    it("should match Associated Press credit") {
      val image = createImageFromMetadata("credit" -> "Associated Press")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("AP"))
      processedImage.metadata.credit should be(Some("AP"))
    }

    it("should match ASSOCIATED PRESS credit") {
      val image = createImageFromMetadata("credit" -> "ASSOCIATED PRESS")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("AP"))
      processedImage.metadata.credit should be(Some("AP"))
    }

    it("should match Invision credit") {
      val image = createImageFromMetadata("credit" -> "Invision")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("AP", Some("Invision")))
      processedImage.metadata.credit should be(Some("Invision"))
    }

    it("should match Invision for ___ credit") {
      val image = createImageFromMetadata("credit" -> "Invision for Quaker")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("AP", Some("Invision")))
      processedImage.metadata.credit should be(Some("Invision for Quaker"))
    }

    it("should match __/Invision/AP credit") {
      val image = createImageFromMetadata("credit" -> "Andy Kropa /Invision/AP")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("AP", Some("Invision")))
      processedImage.metadata.credit should be(Some("Andy Kropa /Invision/AP"))
    }
  }


  describe("Barcroft Media") {
    it("should match Barcroft Media credit") {
      val image = createImageFromMetadata("credit" -> "Barcroft Media")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Barcroft Media"))

      processedImage.metadata.credit should be(Some("Barcroft Media"))
    }

    it("should match other Barcroft offices credit") {
      val image = createImageFromMetadata("credit" -> "Barcroft India")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Barcroft Media"))
      processedImage.metadata.credit should be(Some("Barcroft India"))
    }
  }


  describe("Corbis") {
    it("should match Corbis source") {
      val image = createImageFromMetadata("credit" -> "Demotix/Corbis", "source" -> "Corbis")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Corbis"))
      processedImage.metadata.credit should be(Some("Demotix/Corbis"))
      processedImage.metadata.source should be(Some("Corbis"))
    }
  }


  describe("EPA") {
    it("should match EPA credit") {
      val image = createImageFromMetadata("credit" -> "EPA")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("EPA"))
    }
  }


  describe("Getty Images") {
    it("should detect getty file metadata and use source as suppliersCollection") {
      val image = createImageFromMetadata("credit" -> "AFP/Getty", "source" -> "AFP")
      val gettyImage = image.copy(fileMetadata = FileMetadata(getty = Map("Original Filename" -> "lol.jpg")))
      val processedImage = applyProcessors(gettyImage)
      processedImage.usageRights should be(Agency("Getty Images", Some("AFP")))
      processedImage.metadata.credit should be(Some("AFP/Getty"))
      processedImage.metadata.source should be(Some("AFP"))
    }

    it("should use 'Getty Images' as credit if missing from the file metadata") {
      val image = createImageFromMetadata()
      val gettyImage = image.copy(fileMetadata = FileMetadata(getty = Map("Original Filename" -> "lol.jpg")))
      val processedImage = applyProcessors(gettyImage)
      processedImage.metadata.credit should be(Some("Getty Images"))
    }
  }


  describe("PA") {
    it("should match PA credit") {
      val image = createImageFromMetadata("credit" -> "PA")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("PA"))
      processedImage.metadata.credit should be(Some("PA"))
    }

    it("should not match Press Association Images credit") {
      val image = createImageFromMetadata("credit" -> "Press Association Images")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (NoRights)
      processedImage.metadata.credit should be(Some("Press Association Images"))
    }
  }


  describe("PA") {
    it("should match REUTERS credit") {
      val image = createImageFromMetadata("credit" -> "REUTERS")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Reuters"))
      processedImage.metadata.credit should be(Some("Reuters"))
    }

    it("should match RETUERS credit (typo)") {
      val image = createImageFromMetadata("credit" -> "RETUERS")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Reuters"))
      processedImage.metadata.credit should be(Some("Reuters"))
    }

    it("should match USA Today Sports credit") {
      val image = createImageFromMetadata("credit" -> "USA Today Sports")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Reuters"))
      processedImage.metadata.credit should be(Some("USA Today Sports"))
    }

    it("should match TT NEWS AGENCY credit") {
      val image = createImageFromMetadata("credit" -> "TT NEWS AGENCY")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Reuters"))
      processedImage.metadata.credit should be(Some("TT NEWS AGENCY"))
    }
  }


  describe("Rex Features") {
    it("should match Rex Features source") {
      val image = createImageFromMetadata("credit" -> "Tim Ireland/REX Shutterstock", "source" -> "Rex Features")
      val processedImage = applyProcessors(image)
      processedImage.usageRights match {
        case u: Agency => {
          u.supplier should be ("Rex Features")
          u.suppliersCollection should be(None)
        }

        case _ =>
      }
      processedImage.metadata.credit should be(Some("Tim Ireland/REX Shutterstock"))
      processedImage.metadata.source should be(Some("Rex Features"))
    }
  }


  def applyProcessors(image: Image): Image =
    SupplierProcessors.process(image)


}
