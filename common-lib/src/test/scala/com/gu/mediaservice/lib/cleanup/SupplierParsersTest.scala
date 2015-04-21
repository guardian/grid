package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.{FileMetadata, ImageMetadata}
import org.scalatest.{Matchers, FunSpec}

class SupplierParsersTest extends FunSpec with Matchers with MetadataHelper {

  it("should leave supplier, collection and credit empty by default") {
    val metadata = createImageMetadata()
    val cleanedMetadata = applyParsers(metadata)
    cleanedMetadata.supplier should be (None)
    cleanedMetadata.collection should be (None)
    cleanedMetadata.credit should be (None)
  }

  it("should leave supplier and collection empty if credit doesn't match") {
    val metadata = createImageMetadata("credit" -> "Unknown Party")
    val cleanedMetadata = applyParsers(metadata)
    cleanedMetadata.supplier should be (None)
    cleanedMetadata.collection should be (None)
    cleanedMetadata.credit should be (Some("Unknown Party"))
  }


  describe("AAP") {
    it("should match AAPIMAGE credit") {
      val metadata = createImageMetadata("credit" -> "AAPIMAGE")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("AAP"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("AAP"))
    }
  }


  describe("Action Images") {
    it("should match Action Images credit") {
      val metadata = createImageMetadata("credit" -> "Action Images")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Action Images"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("Action Images"))
    }
  }


  describe("Alamy") {
    it("should match Alamy credit") {
      val metadata = createImageMetadata("credit" -> "Alamy")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Alamy"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("Alamy"))
    }
  }


  describe("AP") {
    it("should match AP credit") {
      val metadata = createImageMetadata("credit" -> "AP")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("AP"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("AP"))
    }

    it("should match Invision credit") {
      val metadata = createImageMetadata("credit" -> "Invision")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("AP"))
      cleanedMetadata.collection should be(Some("Invision"))
      cleanedMetadata.credit should be(Some("Invision"))
    }

    it("should match Invision for ___ credit") {
      val metadata = createImageMetadata("credit" -> "Invision for Quaker")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("AP"))
      cleanedMetadata.collection should be(Some("Invision"))
      cleanedMetadata.credit should be(Some("Invision for Quaker"))
    }

    it("should match __/Invision/AP credit") {
      val metadata = createImageMetadata("credit" -> "Andy Kropa /Invision/AP")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("AP"))
      cleanedMetadata.collection should be(Some("Invision"))
      cleanedMetadata.credit should be(Some("Andy Kropa /Invision/AP"))
    }
  }


  describe("Barcroft Media") {
    it("should match Barcroft Media credit") {
      val metadata = createImageMetadata("credit" -> "Barcroft Media")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Barcroft Media"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("Barcroft Media"))
    }

    it("should match other Barcroft offices credit") {
      val metadata = createImageMetadata("credit" -> "Barcroft India")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Barcroft Media"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("Barcroft India"))
    }
  }


  describe("Corbis") {
    it("should match Corbis source") {
      val metadata = createImageMetadata("credit" -> "Demotix/Corbis", "source" -> "Corbis")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Corbis"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("Demotix/Corbis"))
      cleanedMetadata.source should be(Some("Corbis"))
    }
  }


  describe("EPA") {
    it("should match EPA credit") {
      val metadata = createImageMetadata("credit" -> "EPA")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("EPA"))
      cleanedMetadata.collection should be(None)
    }
  }


  describe("Getty Images") {
    it("should detect getty file metadata and use source as collection") {
      val metadata = createImageMetadata("credit" -> "AFP/Getty", "source" -> "AFP")
      val fileMetadata = FileMetadata(getty = Map("Original Filename" -> "lol.jpg"))
      val cleanedMetadata = applyParsers(metadata, fileMetadata)
      cleanedMetadata.supplier should be(Some("Getty Images"))
      cleanedMetadata.collection should be(Some("AFP"))
      cleanedMetadata.credit should be(Some("AFP/Getty"))
      cleanedMetadata.source should be(Some("AFP"))
    }
  }


  describe("PA") {
    it("should match PA credit") {
      val metadata = createImageMetadata("credit" -> "PA")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("PA"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("PA"))
    }

    it("should not match Press Association Images credit") {
      val metadata = createImageMetadata("credit" -> "Press Association Images")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(None)
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("Press Association Images"))
    }
  }


  describe("PA") {
    it("should match REUTERS credit") {
      val metadata = createImageMetadata("credit" -> "REUTERS")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Reuters"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("Reuters"))
    }

    it("should match RETUERS credit (typo)") {
      val metadata = createImageMetadata("credit" -> "RETUERS")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Reuters"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("Reuters"))
    }

    it("should match USA Today Sports credit") {
      val metadata = createImageMetadata("credit" -> "USA Today Sports")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Reuters"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("USA Today Sports"))
    }

    it("should match TT NEWS AGENCY credit") {
      val metadata = createImageMetadata("credit" -> "TT NEWS AGENCY")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Reuters"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("TT NEWS AGENCY"))
    }
  }


  describe("Rex Features") {
    it("should match Rex Features source") {
      val metadata = createImageMetadata("credit" -> "Tim Ireland/REX Shutterstock", "source" -> "Rex Features")
      val cleanedMetadata = applyParsers(metadata)
      cleanedMetadata.supplier should be(Some("Rex Features"))
      cleanedMetadata.collection should be(None)
      cleanedMetadata.credit should be(Some("Tim Ireland/REX Shutterstock"))
      cleanedMetadata.source should be(Some("Rex Features"))
    }
  }


  def applyParsers(imageMetadata: ImageMetadata, fileMetadata: FileMetadata = FileMetadata()): ImageMetadata =
    SupplierParsers.all.foldLeft(imageMetadata) { case (metadata, parser) =>
      parser.clean(metadata, fileMetadata)
    }


}
