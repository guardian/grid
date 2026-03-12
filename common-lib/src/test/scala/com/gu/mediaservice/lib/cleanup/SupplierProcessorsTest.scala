package com.gu.mediaservice.lib.cleanup

import org.apache.pekko.actor.ActorSystem
import com.gu.mediaservice.lib.config.{CommonConfig, GridConfigResources}
import com.gu.mediaservice.lib.guardian.GuardianUsageRightsConfig
import com.gu.mediaservice.model._
import org.scalatest.funspec.AnyFunSpec
import org.scalatest.matchers.should.Matchers
import play.api.inject.ApplicationLifecycle
import play.api.{Configuration, Environment}

import scala.concurrent.Future

class SupplierProcessorsTest extends AnyFunSpec with Matchers with MetadataHelper {

  private val actorSystem: ActorSystem = ActorSystem()
  private val applicationLifecycle = new ApplicationLifecycle {
    override def addStopHook(hook: () => Future[_]): Unit = {}
    override def stop(): Future[_] = Future.successful(())
  }
  private val config = new CommonConfig(GridConfigResources(
    Configuration.from(Map("usageRightsConfigProvider" -> GuardianUsageRightsConfig.getClass.getCanonicalName)).withFallback(
      Configuration.load(Environment.simple())),
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
      processedImage.metadata.credit should be(Some("Action Images/Reuters"))
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

  describe("Action Images/REUTERS") {
    it("should match 'Action Images/REUTERS' credit") {
      val image = createImageFromMetadata("credit" -> "Action Images/REUTERS")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Action Images"))
      processedImage.metadata.credit should be(Some("Action Images/Reuters"))
    }
  }

  describe("Action images/Reuters") {
    it("should match 'Action images/Reuters' credit") {
      val image = createImageFromMetadata("credit" -> "Action images/Reuters")
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
    it("should ignore images without Asset ID in getty metadata") {
      val image = createImageFromMetadata("credit" -> "Getty Images", "source" -> "Getty Images Europe")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(NoRights)
    }

    it("should detect getty file metadata and set getty usage rights") {
      val image = createImageFromMetadata("credit" -> "Getty Images", "source" -> "Getty Images Europe")
      val gettyImage = image.copy(fileMetadata = FileMetadata(getty = Map("Asset ID" -> "123")))
      val processedImage = applyProcessors(gettyImage)

      processedImage.usageRights should be(Agency("Getty Images", Some("Getty Images Europe")))
      processedImage.metadata.suppliersReference should be(Some("123"))
      processedImage.metadata.credit should be(Some("Getty Images"))
      processedImage.metadata.source should be(Some("Getty Images Europe"))
    }

    Seq("AFP", "FilmMagic", "WireImage", "Hulton") foreach { collection =>
      it(s"should detect and set suppliers collection to $collection") {
        val image = createImageFromMetadata("credit" -> collection, "source" -> "Getty Images Europe")
        val gettyImage = image.copy(fileMetadata = FileMetadata(getty = Map("Asset ID" -> "123")))
        val processedImage = applyProcessors(gettyImage)

        processedImage.usageRights should be(Agency("Getty Images", Some(collection)))
        processedImage.metadata.suppliersReference should be(Some("123"))
        processedImage.metadata.credit should be(Some(collection))
        processedImage.metadata.source should be(Some("Getty Images Europe"))
      }
    }

    it(s"should detect and set suppliers collection to hulton (handles capitalisation)") {
      val image = createImageFromMetadata("credit" -> "hulton", "source" -> "Getty Images Europe")
      val gettyImage = image.copy(fileMetadata = FileMetadata(getty = Map("Asset ID" -> "123")))
      val processedImage = applyProcessors(gettyImage)

      processedImage.usageRights should be(Agency("Getty Images", Some("Hulton")))
      processedImage.metadata.suppliersReference should be(Some("123"))
      processedImage.metadata.credit should be(Some("hulton"))
      processedImage.metadata.source should be(Some("Getty Images Europe"))
    }

    it("should set credit if not already defined") {
      val image = createImageFromMetadata()
      val gettyImage = image.copy(fileMetadata = FileMetadata(getty = Map("Asset ID" -> "123")))
      val processedImage = applyProcessors(gettyImage)

      processedImage.usageRights should be(Agency("Getty Images", None))
      processedImage.metadata.suppliersReference should be(Some("123"))
      processedImage.metadata.credit should be(Some("Getty Images"))
      processedImage.metadata.source should be(None)
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

    it("should match USA Today Sports copyright") {
      val image = createImageFromMetadata("copyright" -> "USA Today Sports")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Reuters"))
      processedImage.metadata.credit should be(Some("USA Today Sports"))
    }

    it("should match USA TODAY Sports copyright") {
      val image = createImageFromMetadata("copyright" -> "USA TODAY Sports")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Reuters"))
      processedImage.metadata.credit should be(Some("USA Today Sports"))
    }

    it("should normalise reuters credits when using via") {
      val image = createImageFromMetadata("credit" -> "John Doe/intermediary/via reuters")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Reuters"))
      processedImage.metadata.credit should be(Some("John Doe/intermediary/Reuters"))
    }

    it("should normalise reuters credits when using slash") {
      val image = createImageFromMetadata("credit" -> "John Doe/intermediary/ REUTERS")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Reuters"))
      processedImage.metadata.credit should be(Some("John Doe/intermediary/Reuters"))
    }

    it("should normalise reuters credits when using no delimiter") {
      val image = createImageFromMetadata("credit" -> "John Doe/intermediary retuERS")
      val processedImage = applyProcessors(image)
      processedImage.usageRights should be(Agency("Reuters"))
      processedImage.metadata.credit should be(Some("John Doe/intermediary/Reuters"))
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

    case class ImageDescriptionSpec(specDescription: String, image: Image, expectedDescription: String)

    val rexFixtures = List(
      ImageDescriptionSpec("should remove instructions and credit when they match the metadata, 1", createImageFromMetadata(
        "source" -> "Shutterstock Editorial",
        "credit" -> "NurPhoto/Shutterstock",
        "specialInstructions" -> "RESTRICTED TO EDITORIAL USE",
        "byline" -> "Jose Breton",
        "suppliersReference" -> "16507315bs",
        "description" ->
          """
            |RESTRICTED TO EDITORIAL USE
            |Mandatory Credit: Photo by Jose Breton/NurPhoto/Shutterstock (16507315bs)
            |Marcus Rashford left winger of Barcelona and England during the Copa del Rey quarter-final match between Albacete Balompie and FC Barcelona at Estadio Carlos Belmonte on February 3, 2026 in Albacete, Spain.
            |Albacete Balompie v FC Barcelona - Copa Del Rey, Spain - 03 Feb 2026
            |""".stripMargin
      ),
        """
          |Marcus Rashford left winger of Barcelona and England during the Copa del Rey quarter-final match between Albacete Balompie and FC Barcelona at Estadio Carlos Belmonte on February 3, 2026 in Albacete, Spain.
          |Albacete Balompie v FC Barcelona - Copa Del Rey, Spain - 03 Feb 2026
          |""".stripMargin),
      ImageDescriptionSpec("should remove instructions and credit when they match the metadata, 2", createImageFromMetadata(
        "source" -> "Shutterstock Editorial",
        "credit" -> "ITV/Shutterstock",
        "specialInstructions" -> "Editorial use only",
        "byline" -> "Ken McKay",
        "suppliersReference" -> "16513246a",
        "description" ->
          """
            |Editorial use only
            |Mandatory Credit: Photo by Ken McKay/ITV/Shutterstock (16513246a)
            |Katie Piper
            |'Loose Women' TV show, London, UK - 04 Feb 2026
            |""".stripMargin
      ),
        """
          |Katie Piper
          |'Loose Women' TV show, London, UK - 04 Feb 2026
          |""".stripMargin),
      ImageDescriptionSpec("should remove credit when it matches the metadata, 1", createImageFromMetadata(
        "source" -> "Shutterstock Editorial",
        "credit" -> "ITV/Shutterstock",
        "byline" -> "Action Press",
        "suppliersReference" -> "16512200n",
        "description" ->
          """
            |Mandatory Credit: Photo by Action Press/Shutterstock (16512200n)
            |Mark Tallman
            |Apple TV+ Press Day, Santa Monica, USA - 03 Feb 2026
            |""".stripMargin
      ),
        """
          |Mark Tallman
          |Apple TV+ Press Day, Santa Monica, USA - 03 Feb 2026
          |""".stripMargin),
      ImageDescriptionSpec("should remove credit when it matches the metadata, 2", createImageFromMetadata(
        "source" -> "Shutterstock Editorial",
        "credit" -> "ITV/Shutterstock",
        "byline" -> "Anthony Harvey",
        "suppliersReference" -> "16501549o",
        "description" ->
          """
            |Mandatory Credit: Photo by Anthony Harvey/Shutterstock (16501549o)
            |Alison Oliver
            |'Wuthering Heights' film photocall, London, UK - 04 Feb 2026
            |""".stripMargin
      ),
        """
          |Alison Oliver
          |'Wuthering Heights' film photocall, London, UK - 04 Feb 2026
          |""".stripMargin),
      ImageDescriptionSpec("should not blow up when regex reserved chars are in relevant metadata", createImageFromMetadata(
        "source" -> "Shutterstock Editorial",
        "credit" -> "NurPhoto/Shutterstock",
        "specialInstructions" -> "(RESTRICTED TO EDITORIAL USE",
        "byline" -> "Jose Breton",
        "suppliersReference" -> "(16507315bs",
        "description" ->
          """
            |(RESTRICTED TO EDITORIAL USE
            |Mandatory Credit: Photo by Jose Breton/NurPhoto/Shutterstock ((16507315bs)
            |Marcus Rashford left winger of Barcelona and England during the Copa del Rey quarter-final match between Albacete Balompie and FC Barcelona at Estadio Carlos Belmonte on February 3, 2026 in Albacete, Spain.
            |Albacete Balompie v FC Barcelona - Copa Del Rey, Spain - 03 Feb 2026
            |""".stripMargin
      ),
        """
          |Marcus Rashford left winger of Barcelona and England during the Copa del Rey quarter-final match between Albacete Balompie and FC Barcelona at Estadio Carlos Belmonte on February 3, 2026 in Albacete, Spain.
          |Albacete Balompie v FC Barcelona - Copa Del Rey, Spain - 03 Feb 2026
          |""".stripMargin),
      ImageDescriptionSpec("should not remove credit when the credit includes a byline that is not in the metadata - 1", createImageFromMetadata(
        "source" -> "Rex Features",
        "credit" -> "REX/Shutterstock",
        "byline" -> "ZUMA Wire",
        "suppliersReference" -> "9011672i",
        "description" ->
          """
            |Mandatory Credit: Photo by Sachelle Babbar/ZUMA Wire/REX/Shutterstock (9011672i)
            |New Yorkers demonstrate at 780 3rd avenue in Manhattan, the location of the Bank of Korea and the offices of Senator Chuck Schumer and Kirstin Gillibrand, against the sabre-rattling by both the Trump Administration and the government of the DPRK, also known as North Korea.
            |Anti-nuclear war demonstration, New York, USA - 21 Aug 2017
            |""".stripMargin
      ),
        """
          |Mandatory Credit: Photo by Sachelle Babbar/ZUMA Wire/REX/Shutterstock (9011672i)
          |New Yorkers demonstrate at 780 3rd avenue in Manhattan, the location of the Bank of Korea and the offices of Senator Chuck Schumer and Kirstin Gillibrand, against the sabre-rattling by both the Trump Administration and the government of the DPRK, also known as North Korea.
          |Anti-nuclear war demonstration, New York, USA - 21 Aug 2017
          |""".stripMargin),
      ImageDescriptionSpec("should not remove credit when the credit includes a byline that is not in the metadata - 2", createImageFromMetadata(
        "source" -> "Rex Features",
        "credit" -> "REX/Shutterstock",
        "byline" -> "ZUMA Wire",
        "suppliersReference" -> "9011672i",
        "description" ->
          """
            |Mandatory Credit: Photo by ZUMA Wire/Sachelle Babbar/REX/Shutterstock (9011672i)
            |New Yorkers demonstrate at 780 3rd avenue in Manhattan, the location of the Bank of Korea and the offices of Senator Chuck Schumer and Kirstin Gillibrand, against the sabre-rattling by both the Trump Administration and the government of the DPRK, also known as North Korea.
            |Anti-nuclear war demonstration, New York, USA - 21 Aug 2017
            |""".stripMargin
      ),
        """
          |Mandatory Credit: Photo by ZUMA Wire/Sachelle Babbar/REX/Shutterstock (9011672i)
          |New Yorkers demonstrate at 780 3rd avenue in Manhattan, the location of the Bank of Korea and the offices of Senator Chuck Schumer and Kirstin Gillibrand, against the sabre-rattling by both the Trump Administration and the government of the DPRK, also known as North Korea.
          |Anti-nuclear war demonstration, New York, USA - 21 Aug 2017
          |""".stripMargin),
      ImageDescriptionSpec("should not remove credit when the credit includes a byline that is not in the metadata - 3", createImageFromMetadata(
        "source" -> "Shutterstock Editorial",
        "credit" -> "Pool/Yuri Gripas - Pool/CNP/Shutterstock",
        "byline" -> "Yuri Gripas",
        "suppliersReference" -> "16452941i",
        "description" ->
          """
            |Mandatory Credit: Photo by Yuri Gripas - Pool via CNP/Shutterstock (16452941i)
            |White House Press Secretary Karoline Leavitt holds a press briefing in the James S Brady Press Briefing Room of the White House in Washington, DC, USA,.
            |Karoline Leavitt press briefing - Washington, Washington, District of Columbia, USA - 26 Jan 2026
            |""".stripMargin
      ),
        """
          |Mandatory Credit: Photo by Yuri Gripas - Pool via CNP/Shutterstock (16452941i)
          |White House Press Secretary Karoline Leavitt holds a press briefing in the James S Brady Press Briefing Room of the White House in Washington, DC, USA,.
          |Karoline Leavitt press briefing - Washington, Washington, District of Columbia, USA - 26 Jan 2026
          |""".stripMargin),
      ImageDescriptionSpec("should not remove credit when the credit includes a byline that is not in the metadata - 4", createImageFromMetadata(
        "source" -> "Shutterstock Editorial",
        "credit" -> "Nexpher/ZUMA Press Wire/Shutterstock",
        "byline" -> "Kobe Li",
        "suppliersReference" -> "16520092w",
        "description" ->
          """
            |Mandatory Credit: Photo by Kobe Li/Nexpher via ZUMA Press Wire/Shutterstock (16520092w)
            |English snooker player, Mark Selby during a game at the 2026 World Snooker Grand Prix on February 5, 2026 in Hong Kong.
            |2026 World Snooker Grand Prix - Day 3, Hong Kong, China - 05 Feb 2026
            |""".stripMargin
      ),
        """
          |Mandatory Credit: Photo by Kobe Li/Nexpher via ZUMA Press Wire/Shutterstock (16520092w)
          |English snooker player, Mark Selby during a game at the 2026 World Snooker Grand Prix on February 5, 2026 in Hong Kong.
          |2026 World Snooker Grand Prix - Day 3, Hong Kong, China - 05 Feb 2026
          |""".stripMargin),
    )

    rexFixtures.foreach {
      case ImageDescriptionSpec(spec, image, expectedDescription) =>
        it(spec) {
          val processedImage = applyProcessors(image)

          processedImage.usageRights should be(Agency("Rex Features"))
          processedImage.metadata.description should be(Some(expectedDescription))
        }
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


  describe("PaParser") {
    it("matchAndClean - simple example") {
      val image = createImageFromMetadata("credit" -> "Ben Blackall/Netflix/PA")

      val cleaned = PaParser.apply(image)

      cleaned.metadata.credit should be (Some("Ben Blackall/Netflix/PA"))
      cleaned.usageRights should be (an[Agency])
      cleaned.usageRights.asInstanceOf[Agency].supplier should be ("PA")
    }
    it("matchAndClean - complex credit at end") {
      val image = createImageFromMetadata("credit" -> "Ben Blackall/Netflix/PA wIRE/PA Photos")

      val cleaned = PaParser.apply(image)

      cleaned.metadata.credit should be (Some("Ben Blackall/Netflix/PA"))
      cleaned.usageRights should be (an[Agency])
      cleaned.usageRights.asInstanceOf[Agency].supplier should be ("PA")
    }
    it("matchAndClean - simple credit in middle of credit listing") {
      val image = createImageFromMetadata("credit" -> "Ben Blackall/PA/Netflix")

      val cleaned = PaParser.apply(image)

      cleaned.metadata.credit should be (Some("Ben Blackall/Netflix/PA"))
      cleaned.usageRights should be (an[Agency])
      cleaned.usageRights.asInstanceOf[Agency].supplier should be ("PA")
    }
    it("matchAndClean - complex credit in middle of credit listing") {
      val image = createImageFromMetadata("credit" -> "Ben Blackall/PA Archive/PA Images/Netflix")

      val cleaned = PaParser.apply(image)

      cleaned.metadata.credit should be (Some("Ben Blackall/Netflix/PA"))
      cleaned.usageRights should be (an[Agency])
      cleaned.usageRights.asInstanceOf[Agency].supplier should be ("PA")
    }
    it("matchAndClean - unmatched credit is unchanged") {
      val image = createImageFromMetadata("credit" -> "Ben Blackall/NPA Archive/PA Images/Netflix")

      val cleaned = PaParser.apply(image)

      cleaned.metadata.credit should be (Some("Ben Blackall/NPA Archive/PA Images/Netflix"))
      cleaned.usageRights should be (NoRights)
    }
  }


  def applyProcessors(image: Image): Image = {
    val processorResources = ImageProcessorResources(config, actorSystem)
    new SupplierProcessors(processorResources).apply(image)
  }

}
