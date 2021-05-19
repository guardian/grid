package com.gu.mediaservice.lib.cleanup

import akka.actor.ActorSystem
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import com.gu.mediaservice.lib.guardian.GuardianUsageRightsConfig
import com.gu.mediaservice.model._
import org.scalatest.{FunSpec, Matchers}
import play.api.inject.ApplicationLifecycle
import play.api.{Configuration, Environment}

import scala.concurrent.Future

class SupplierProcessorsTest extends FunSpec with Matchers with MetadataHelper {

  private val actorSystem: ActorSystem = ActorSystem()
  private val applicationLifecycle = new ApplicationLifecycle {
    override def addStopHook(hook: () => Future[_]): Unit = {}
    override def stop(): Future[_] = Future.successful(())
  }
  private val config = new CommonConfig(GridConfigResources(
    Configuration.load(Environment.simple()) ++
      Configuration.from(Map("usageRightsConfigProvider" -> GuardianUsageRightsConfig.getClass.getCanonicalName)),
    actorSystem,
    applicationLifecycle
  )){}

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

  it("should absolutely not delete the byline when it's the same as the credit"){
    val image = createImageFromMetadata("credit" -> "Lorem Ipsum", "byline" -> "Lorem Ipsum")
    val processedImage = applyProcessors(image)
    processedImage.metadata.byline should be(Some("Lorem Ipsum"))
    processedImage.metadata.credit should be(Some("Lorem Ipsum"))
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
    it("should find 'Allstar Picture Library' in the credit and replace with canonical name 'Allstar'") {
      val image = createImageFromMetadata("credit" -> "Allstar Picture Library")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library"))
      processedImage.metadata.credit should be(Some("Allstar"))
    }

    it("should match 'Sportsphoto Ltd./Allstar' credit") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto Ltd./Allstar")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("Sportsphoto")))
      processedImage.metadata.credit should be(Some("Sportsphoto/Allstar"))
    }

    it("should match not 'Sportsphoto LtdX/Allstar' credit - but will fix case!") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto LtdX/Allstar")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("Sportsphoto Ltdx")))
      processedImage.metadata.credit should be(Some("Sportsphoto Ltdx/Allstar"))
    }

    it("should remove a prefix of 'Allstar' from a credit and append it to the end of the credit") {
      val image = createImageFromMetadata("credit" -> "Allstar/UNIVERSAL")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("Universal")))
      processedImage.metadata.credit should be(Some("Universal/Allstar"))
    }

    it("should remove a suffix of 'Allstar' from a credit and append it to the end of the credit") {
      val image = createImageFromMetadata("credit" -> "UNIVERSAL/Allstar")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("Universal")))
      processedImage.metadata.credit should be(Some("Universal/Allstar"))
    }

    it("should remove a infix of 'Allstar' from a credit and append it to the end of the credit") {
      val image = createImageFromMetadata("credit" -> "UNIVERSAL/Allstar/Magic Pictures")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("Universal/Magic Pictures")))
      processedImage.metadata.credit should be(Some("Universal/Magic Pictures/Allstar"))
    }

    it("should strip redundant byline but use it as canonical casing for credit") {
      val image = createImageFromMetadata("credit" -> "Allstar/UNIVERSAL PICTURES", "byline" -> "Universal Pictures")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be (Agency("Allstar Picture Library", Some("Universal Pictures")))
      processedImage.metadata.credit should be(Some("Universal Pictures/Allstar"))
      processedImage.metadata.byline should be(None)
    }

    it("should strip '___/Allstar' suffix from byline") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto Ltd./Allstar", "byline" -> "David Gadd/Allstar")
      val processedImage = applyProcessors(image)
      processedImage.metadata.byline should be(Some("David Gadd"))
    }

    // we do not append 'Allstar Picture Library' to the credit because the credit already contains 'Allstar'
    it("should strip '___/Allstar Picture Library' suffix from byline") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto Ltd./Allstar", "byline" -> "David Gadd/Allstar Picture Library")
      val processedImage = applyProcessors(image)
      processedImage.metadata.byline should be(Some("David Gadd"))
      processedImage.metadata.credit should be (Some("Sportsphoto/Allstar"))
    }

    it("should strip '___/Allstar' suffix from byline and append it to credit if 'Allstar' not present already") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto Ltd.", "byline" -> "David Gadd/Allstar")
      val processedImage = applyProcessors(image)
      processedImage.metadata.byline should be(Some("David Gadd"))
      processedImage.metadata.credit should be(Some("Sportsphoto/Allstar"))
    }

    it("should strip '___/Allstar Picture Library' suffix from byline and append it to credit if 'Allstar' not present already") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto Ltd.", "byline" -> "David Gadd/Allstar Picture Library")
      val processedImage = applyProcessors(image)
      processedImage.metadata.byline should be(Some("David Gadd"))
      processedImage.metadata.credit should be(Some("Sportsphoto/Allstar"))
    }

    it ("should strip out 'Allstar' from byline and append it to the credit") {
      val image = createImageFromMetadata("credit" -> "THE RANK ORGANISATION/Sportsphoto Ltd.", "byline" -> "Allstar")
      val processedImage = applyProcessors(image)
      processedImage.metadata.credit should be (Some("The Rank Organisation/Sportsphoto/Allstar"))
      processedImage.metadata.byline should be (None)
    }

    it ("should strip out 'Allstar' from byline and not append it to the credit if credit contains 'Allstar'") {
      val image = createImageFromMetadata("credit" -> "THE RANK ORGANISATION/Allstar/Sportsphoto Ltd.", "byline" -> "Allstar")
      val processedImage = applyProcessors(image)
      processedImage.metadata.credit should be (Some("The Rank Organisation/Sportsphoto/Allstar"))
      processedImage.metadata.byline should be (None)
    }

    it ("should canonicalise and dedupe 'Sportsphoto' in credit") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto/Sportsphoto Ltd.")
      val processedImage = applyProcessors(image)
      processedImage.metadata.credit should be (Some("Sportsphoto"))
    }

    it ("should append 'Allstar' when 'Sportsphoto' is in credit") {
      val image = createImageFromMetadata("credit" -> "Sportsphoto/Allstar/Sportsphoto Ltd.")
      val processedImage = applyProcessors(image)
      processedImage.metadata.credit should be (Some("Sportsphoto/Allstar"))
    }

    it ("should maintain order of rest of credit") {
      val image = createImageFromMetadata("credit" -> "A/B/C/D/Sportsphoto/E/F/G/H/Sportsphoto Ltd./I/J/K/L")
      val processedImage = applyProcessors(image)
      processedImage.metadata.credit should be (Some("A/B/C/D/E/F/G/H/I/J/K/L/Sportsphoto"))
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


  def applyProcessors(image: Image): Image = {
    val processorResources = ImageProcessorResources(config, actorSystem)
    new SupplierProcessors(processorResources).apply(image)
  }

}
