package com.gu.mediaservice.lib.config

import com.gu.mediaservice.lib.config.UsageRightsConfigProvider.Resources
import com.gu.mediaservice.model.{ContractPhotographer, StaffPhotographer}
import org.scalatest.{FreeSpec, Matchers}
import play.api.Configuration
import play.api.inject.ApplicationLifecycle

import scala.concurrent.Future

class PhotographersConfigTest extends FreeSpec with Matchers {

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
          ),
          "contractIllustrators" -> List(
            Map("name" -> "Company B", "photographers" -> List("CC")),
          ),
          "staffIllustrators" -> List("S", "SS"),
          "creativeCommonsLicense" -> List("CC BY-4.0", "CC BY-SA-4.0", "CC BY-ND-4.0")
        )
      )
    ))

    val applicationLifecycle = new ApplicationLifecycle {
      override def addStopHook(hook: () => Future[_]): Unit = {}
      override def stop(): Future[_] = Future.successful(())
    }
    val loader = UsageRightsConfigProvider.ProviderLoader.singletonConfigLoader(new Resources(), applicationLifecycle)
    val conf: UsageRightsConfigProvider = configuration.get[UsageRightsConfigProvider]("some.path")(loader)

    "should load usage rights configuration" in {
      conf.externalStaffPhotographers.nonEmpty shouldBe true
      conf.externalStaffPhotographers.length shouldBe 2

      conf.internalStaffPhotographers.nonEmpty shouldBe true
      conf.internalStaffPhotographers.length shouldBe 1

      conf.contractedPhotographers.nonEmpty shouldBe true
      conf.contractedPhotographers.length shouldBe 1

      conf.contractIllustrators.nonEmpty shouldBe true
      conf.contractIllustrators.length shouldBe 1

      conf.staffIllustrators.nonEmpty shouldBe true
      conf.staffIllustrators.length shouldBe 2

      conf.creativeCommonsLicense.nonEmpty shouldBe true
      conf.creativeCommonsLicense.length shouldBe 3
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
      allPhotographers.length shouldBe 2
      allPhotographers.flatMap(_.photographers).length shouldBe 4
    }

    "should return staff photographer" in {
      val photographer = conf.getPhotographer("A")
      photographer.nonEmpty shouldBe true
      photographer.head should matchPattern {
        case _: StaffPhotographer =>
      }
    }

    "should return contract photographer" in {
      val photographer = conf.getPhotographer("C")
      photographer.nonEmpty shouldBe true
      photographer.head should matchPattern {
        case _: ContractPhotographer =>
      }
    }

    "should return staff photographer with lowercase name" in {
      val photographer = conf.getPhotographer("a")
      photographer.nonEmpty shouldBe true
      photographer.head should matchPattern {
        case _: StaffPhotographer =>
      }
    }

    "should not return photographer" in {
      val photographer = conf.getPhotographer("D")
      photographer.isEmpty shouldBe true
    }
  }

}
