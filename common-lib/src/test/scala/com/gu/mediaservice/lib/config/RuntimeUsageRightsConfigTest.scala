package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.config.UsageRightsConfigProvider.Resources
import com.gu.mediaservice.model.{ContractPhotographer, StaffPhotographer}
import org.joda.time.DateTime
import org.scalatest.freespec.AnyFreeSpec
import org.scalatest.matchers.should.Matchers
import play.api.Configuration
import play.api.inject.ApplicationLifecycle

import scala.concurrent.Future

class RuntimeUsageRightsConfigTest extends AnyFreeSpec with Matchers {

  "The config loader" - {
    val configuration: Configuration = Configuration.from(Map(
      "some.path" -> Map(
        "className" -> classOf[RuntimeUsageRightsConfig].getCanonicalName,
        "config" -> Map(
          "externalStaffPhotographers" -> List(
            Map("name" -> "Company A", "photographers" -> List("A")),
            Map("name" -> "Company A", "photographers" -> List("B"))
          ),
          "internalStaffPhotographers" -> List(
            Map("name" -> "Company A", "photographers" -> List("AA"))
          ),
          "contractedPhotographers" -> List(
            Map("name" -> "Company B", "photographers" -> List("C")),
            Map("name" -> "Company T", "photographers" -> List(
              Map("name" -> "Temp hire", "from" -> "2025-04-07", "to" -> "2025-04-10")
            ))
          ),
          "contractIllustrators" -> List(
            Map("name" -> "Company B", "photographers" -> List("CC")),
          ),
          "staffIllustrators" -> List("S", "SS"),
          "creativeCommonsLicense" -> List("CC BY-4.0", "CC BY-SA-4.0", "CC BY-ND-4.0"),
          "freeSuppliers" -> List("S1", "S2"),
          "suppliersCollectionExcl" -> Map(
            "S1" -> List("S1Coll1", "S1Coll2")
          ),
          "programmesOrganisationOwned" -> Map(
            "description" -> "Organisation owned programmes"
          ),
          "programmesIndependents" -> Map(
            "description" -> "Independents programmes",
            "independentTypes" -> List(
              Map(
                "name" -> "A",
                "productionsCompanies" -> List("P1", "P2")
              ),
            )
          ),
          "programmesAcquisitions" -> Map(
            "description" -> "Acquisitions programmes"
          )
        )
      )
    ))

    val applicationLifecycle = new ApplicationLifecycle {
      override def addStopHook(hook: () => Future[_]): Unit = {}
      override def stop(): Future[_] = Future.successful(())
    }
    val loader = UsageRightsConfigProvider.ProviderLoader.singletonConfigLoader(new Resources(), applicationLifecycle)
    val conf: UsageRightsConfigProvider = configuration.get[UsageRightsConfigProvider]("some.path")(loader)

    "should load programmesOrganisationOwned configuration" in {
      conf.programmesOrganisationOwnedConfig.nonEmpty shouldBe true
      conf.programmesOrganisationOwnedConfig.get.description.nonEmpty shouldBe true
      conf.programmesOrganisationOwnedConfig.get.description shouldBe Some("Organisation owned programmes")
    }

    "should load programmesIndependents configuration" in {
      conf.programmesIndependentsConfig.nonEmpty shouldBe true
      conf.programmesIndependentsConfig.get.description.nonEmpty shouldBe true
      conf.programmesIndependentsConfig.get.description shouldBe Some("Independents programmes")
      conf.programmesIndependentsConfig.get.independentTypes.nonEmpty shouldBe true
      conf.programmesIndependentsConfig.get.independentTypes.length shouldBe 1

      conf.programmesIndependentsConfig.get.independentTypes.head.name shouldBe "A"
      conf.programmesIndependentsConfig.get.independentTypes.head.productionsCompanies.nonEmpty shouldBe true
      conf.programmesIndependentsConfig.get.independentTypes.head.productionsCompanies shouldBe List("P1", "P2")
    }

    "should load programmesAcquisitions configuration" in {
      conf.programmesAcquisitionsConfig.nonEmpty shouldBe true
      conf.programmesAcquisitionsConfig.get.description.nonEmpty shouldBe true
      conf.programmesAcquisitionsConfig.get.description shouldBe Some("Acquisitions programmes")
    }

    "should load usage rights configuration" in {
      conf.externalStaffPhotographers.nonEmpty shouldBe true
      conf.externalStaffPhotographers.length shouldBe 2

      conf.internalStaffPhotographers.nonEmpty shouldBe true
      conf.internalStaffPhotographers.length shouldBe 1

      conf.contractedPhotographers.nonEmpty shouldBe true
      conf.contractedPhotographers.length shouldBe 2

      conf.contractIllustrators.nonEmpty shouldBe true
      conf.contractIllustrators.length shouldBe 1

      conf.staffIllustrators.nonEmpty shouldBe true
      conf.staffIllustrators.length shouldBe 2

      conf.creativeCommonsLicense.nonEmpty shouldBe true
      conf.creativeCommonsLicense.length shouldBe 3

      conf.freeSuppliers.nonEmpty shouldBe true
      conf.freeSuppliers.length shouldBe 2

      conf.suppliersCollectionExcl.nonEmpty shouldBe true
      conf.suppliersCollectionExcl.keySet.size shouldBe 1
    }

    "should return staff photographers" in {
      val staffPhotographers = conf.staffPhotographers
      staffPhotographers.nonEmpty shouldBe true
      staffPhotographers.length shouldBe 1
      staffPhotographers.flatMap(_.photographers).length shouldBe 3
    }

    "should return all photographers" in {
      val allPhotographers = conf.allPhotographers
      allPhotographers.nonEmpty shouldBe true
      allPhotographers.length shouldBe 3
      allPhotographers.flatMap(_.photographers).length shouldBe 5
    }

    "should return staff photographer" in {
      val photographer = conf.getPhotographer("A", DateTime.parse("2025-04-01"))
      photographer.nonEmpty shouldBe true
      photographer.head should matchPattern {
        case _: StaffPhotographer =>
      }
    }

    "should return contract photographer" in {
      val photographer = conf.getPhotographer("C", DateTime.parse("2025-04-01"))
      photographer.nonEmpty shouldBe true
      photographer.head should matchPattern {
        case _: ContractPhotographer =>
      }
    }

    "should return photographer when in active period, and not when they are not" in {
      val photographer = conf.getPhotographer("Temp hire", DateTime.parse("2025-04-08"))
      photographer should not be (empty)
      photographer.head should matchPattern {
        case ContractPhotographer("Temp hire", Some("Company T"), _) =>
      }

      val noPhotographerBefore = conf.getPhotographer("Temp hire", DateTime.parse("2025-04-06"))
      noPhotographerBefore should be(empty)

      val noPhotographerAfter = conf.getPhotographer("Temp hire", DateTime.parse("2025-04-11"))
      noPhotographerAfter should be(empty)
    }

    "should return staff photographer with lowercase name" in {
      val photographer = conf.getPhotographer("a", DateTime.parse("2025-04-01"))
      photographer.nonEmpty shouldBe true
      photographer.head should matchPattern {
        case _: StaffPhotographer =>
      }
    }

    "should not return unknown photographer" in {
      val photographer = conf.getPhotographer("D", DateTime.parse("2025-04-01"))
      photographer.isEmpty shouldBe true
    }

    "should return suppliers" in {
      val freeSuppliers = conf.freeSuppliers
      freeSuppliers.contains("S1") shouldBe true
      freeSuppliers.contains("S2") shouldBe true
    }

    "should return suppliersExclColl" in {
      val suppliersCollectionExcl = conf.suppliersCollectionExcl
      suppliersCollectionExcl.get("S1") shouldBe defined
      suppliersCollectionExcl("S1").nonEmpty shouldBe true
      suppliersCollectionExcl("S1").length shouldBe 2
    }
  }

}
