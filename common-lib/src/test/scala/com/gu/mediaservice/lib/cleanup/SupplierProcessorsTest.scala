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

  describe("Photographer") {
    it("should match StaffPhotographer byline") {
      val image = createImageFromMetadata("byline" -> "Graham Turner")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(StaffPhotographer("Graham Turner", "The Guardian"))
      processedImage.metadata.credit should be(Some("The Guardian"))
    }

    it("should match ContractPhotographer byline") {
      val image = createImageFromMetadata("byline" -> "Linda Nylind")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(ContractPhotographer("Linda Nylind", Option("The Guardian")))
      processedImage.metadata.credit should be(Some("The Guardian"))
    }

    it ("should correct casing of photographer") {
      val image = createImageFromMetadata("byline" -> "Murdo MacLeod")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(ContractPhotographer("Murdo MacLeod", Option("The Guardian")))
      processedImage.metadata.byline should be(Some("Murdo MacLeod"))
    }
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

  describe("Action Images/Reuters") {
    it("should match 'Action Images/Reuters' credit") {
      val image = createImageFromMetadata("credit" -> "Action Images/Reuters")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Action Images"))
      processedImage.metadata.credit should be(Some("Action Images/Reuters"))
    }
  }

  describe("Alamy") {
    it("should match 'Alamy' credit") {
      val image = createImageFromMetadata("credit" -> "Alamy")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Alamy"))
      processedImage.metadata.credit should be(Some("Alamy"))
    }

    it("should match 'Alamy Stock Photo' credit, and replace 'Alamy Stock Photo' with 'Alamy'") {
      val image = createImageFromMetadata("credit" -> "Alamy Stock Photo")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Alamy"))
      processedImage.metadata.credit should be(Some("Alamy"))
    }

    it("should match credit with Alamy as a suffix with '/'") {
      val image = createImageFromMetadata("credit" -> "Prod.DB/Alamy Stock Photo")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Alamy"))
      processedImage.metadata.credit should be(Some("Prod.DB/Alamy"))
    }

    it("should not match credit with Alamy when the credit contains 'Alamy Live News', because we only have rights after 48 hours, and there's no provision to add a 'deny' lease for that period yet") {
      val image = createImageFromMetadata("credit" -> "Alamy Live News/Alamy Live News")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (NoRights)
      processedImage.metadata.credit should be(Some("Alamy Live News/Alamy Live News"))
    }
  }

  describe("Allstar") {
    it("should match 'Allstar Picture Library' credit") {
      val image = createImageFromMetadata("credit" -> "Allstar Picture Library")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library"))
      processedImage.metadata.credit should be(Some("Allstar Picture Library"))
    }

    it("should match 'Sportsphoto Ltd./Allstar' credit") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto Ltd./Allstar")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("Sportsphoto Ltd.")))
      processedImage.metadata.credit should be(Some("Sportsphoto Ltd./Allstar"))
    }

    it("should match 'Allstar/UNIVERSAL' credit") {
      val image = createImageFromMetadata("credit" -> "Allstar/UNIVERSAL")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("UNIVERSAL")))
      processedImage.metadata.credit should be(Some("Allstar/UNIVERSAL"))
    }

    it("should strip redundant byline but use it as canonical casing for credit") {
      val image = createImageFromMetadata("credit" -> "Allstar/UNIVERSAL PICTURES", "byline" -> "Universal Pictures")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("Universal Pictures")))
      processedImage.metadata.credit should be(Some("Allstar/Universal Pictures"))
      processedImage.metadata.byline should be(None)
    }

    it("should strip '___/Allstar' suffix from byline") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto Ltd./Allstar", "byline" -> "David Gadd/Allstar")
      val processedImage = applyProcessors(image)
      processedImage.metadata.byline should be(Some("David Gadd"))
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

    it("should exclude images that have Getty metadata that aren't from Getty") {
      val image = createImageFromMetadata("credit" -> "NEWSPIX INTERNATIONAL")
      val notGettyImage = image.copy(fileMetadata = FileMetadata(getty = Map("Composition" -> "Headshot")))
      val processedImage = applyProcessors(notGettyImage)
      processedImage.usageRights should be(NoRights)
    }

    it("should exclude images that have Getty metadata that also have 'Pinnacle Photo Agency Ltd' as source") {
      val image = createImageFromMetadata("source" -> "Pinnacle Photo Agency Ltd")
      val notGettyImage = image.copy(fileMetadata = FileMetadata(getty = Map("dummy" -> "metadata")))
      val processedImage = applyProcessors(notGettyImage)
      processedImage.usageRights should be(NoRights)
    }

    it("should use 'Getty Images' as credit if missing from the file metadata") {
      val image = createImageFromMetadata()
      val gettyImage = image.copy(fileMetadata = FileMetadata(getty = Map("Original Filename" -> "lol.jpg")))
      val processedImage = applyProcessors(gettyImage)
      processedImage.metadata.credit should be(Some("Getty Images"))
    }

    it("should match 'Getty Images' credit") {
      val image = createImageFromMetadata("credit" -> "Getty Images")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images"))
      processedImage.metadata.credit should be(Some("Getty Images"))
    }

    it("should match 'AFP/Getty Images' credit") {
      val image = createImageFromMetadata("credit" -> "AFP/Getty Images")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images"))
      processedImage.metadata.credit should be(Some("AFP/Getty Images"))
    }

    // Truncation FTW!
    it("should match 'The LIFE Images Collection/Getty' credit") {
      val image = createImageFromMetadata("credit" -> "The LIFE Images Collection/Getty", "source" -> "The LIFE Images Collection")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("The LIFE Images Collection")))
      processedImage.metadata.credit should be(Some("The LIFE Images Collection/Getty"))
    }

    it("should match 'Getty Images/Ikon Images' credit") {
      val image = createImageFromMetadata("credit" -> "Getty Images/Ikon Images", "source" -> "Ikon Images")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("Ikon Images")))
      processedImage.metadata.credit should be(Some("Getty Images/Ikon Images"))
    }

    it("should match 'Bloomberg/Getty Images' credit") {
      val image = createImageFromMetadata("credit" -> "Bloomberg/Getty Images", "source" -> "Bloomberg")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("Bloomberg")))
      processedImage.metadata.credit should be(Some("Bloomberg/Getty Images"))
    }

    it("should match 'Some Long Provider/Getty Im' credit") {
      val image = createImageFromMetadata("credit" -> "Some Long Provider/Getty Im", "source" -> "Some Long Provider")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("Some Long Provider")))
      processedImage.metadata.credit should be(Some("Some Long Provider/Getty Im"))
    }

    it("should match 'Getty Images for Apple' credit") {
      val image = createImageFromMetadata("credit" -> "Getty Images for Apple", "source" -> "Getty Images Europe")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("Getty Images Europe")))
      processedImage.metadata.credit should be(Some("Getty Images for Apple"))
    }

    it("should match 'AFP' credit") {
      val image = createImageFromMetadata("credit" -> "AFP")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("AFP")))
      processedImage.metadata.credit should be(Some("AFP"))
    }
    it("should match 'afp' credit") {
      val image = createImageFromMetadata("credit" -> "afp")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("AFP")))
      processedImage.metadata.credit should be(Some("afp"))
    }
    it("should match 'FilmMagic' credit") {
      val image = createImageFromMetadata("credit" -> "FilmMagic")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("FilmMagic")))
      processedImage.metadata.credit should be(Some("FilmMagic"))
    }
    it("should match 'WireImage' credit") {
      val image = createImageFromMetadata("credit" -> "WireImage")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("WireImage")))
      processedImage.metadata.credit should be(Some("WireImage"))
    }
    it("should match 'Hulton' credit") {
      val image = createImageFromMetadata("credit" -> "Hulton")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Getty Images", Some("Hulton")))
      processedImage.metadata.credit should be(Some("Hulton"))
    }
  }


  describe("PA") {
    it("should match PA credit") {
      val image = createImageFromMetadata("credit" -> "PA")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("PA"))
    }

    it("should match PA source if credit doesn't match") {
      val image = createImageFromMetadata("credit" -> "BBC/PA", "source" -> "PA")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("PA"))
    }

    it("should match 'PA WIRE' images") {
      val image = createImageFromMetadata("credit" -> "PA WIRE")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("PA"))
    }

    it("should match 'Press Association Images' credit") {
      val image = createImageFromMetadata("credit" -> "Press Association Images")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("PA"))
    }

    it("should match archive images credit") {
      val image = createImageFromMetadata("credit" -> "PA Archive/PA Images")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("PA"))
    }
  }


  describe("Reuters") {
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

    it("should match USA TODAY Sports credit") {
      val image = createImageFromMetadata("credit" -> "USA TODAY Sports")
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

    it("should match '*/ Rex Features' credit") {
      val image = createImageFromMetadata("credit" -> "Bleddyn Butcher / Rex Features")
      val processedImage = applyProcessors(image)

      processedImage.usageRights should be (Agency("Rex Features"))
    }
  }


  describe("Ronald Grant") {
    it("should match www.ronaldgrantarchive.com credit") {
      val image = createImageFromMetadata("credit" -> "www.ronaldgrantarchive.com")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Ronald Grant Archive"))
      processedImage.metadata.credit should be(Some("Ronald Grant"))
    }

    it("should match Ronald Grant Archive credit") {
      val image = createImageFromMetadata("credit" -> "Ronald Grant Archive")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Ronald Grant Archive"))
      processedImage.metadata.credit should be(Some("Ronald Grant"))
    }
  }


  def applyProcessors(image: Image): Image =
    SupplierProcessors.apply(image)


}
