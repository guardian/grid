package syndication

import java.util.UUID

import com.gu.mediaservice.model.{Image, Photoshoot}
import helpers.Fixtures
import lib.{ElasticSearchVersion, SyndicationRightsOps}
import org.joda.time.DateTime
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatest.{BeforeAndAfterAll, FreeSpec, Matchers}
import play.api.libs.json.Json

import scala.concurrent.ExecutionContext.Implicits.global

trait SyndicationRightsOpsTestsBase extends FreeSpec with Matchers with Fixtures with BeforeAndAfterAll with ScalaFutures {

  def ES: ElasticSearchVersion

  lazy val syndRightsOps = new SyndicationRightsOps(ES)

  def withImage(image: Image)(test: Image => Unit): Unit = {
    ES.indexImage(image.id, Json.toJson(image))
    Thread.sleep(5000)
    test(image)
  }

  def withPhotoshoot(photoshoot: Photoshoot)(test: List[Image] => Unit): Unit = {
    println(s"Creating photoshoot ${photoshoot.title}")
    val images = (1 until 5).map { _ =>
      val image = imageWithPhotoshoot(photoshoot)
      ES.indexImage(image.id, Json.toJson(image))
      image
    }.toList
    Thread.sleep(5000)
    test(images)
  }

  override def beforeAll {
    ES.ensureAliasAssigned()
  }

  implicit val defaultPatience = PatienceConfig(timeout = Span(30, Seconds), interval = Span(250, Millis))

  "SyndicationRightsOps" - {
    "General logic" - {
      "return the most recent syndication rights" in {
        val image1 = createImageForSyndication(UUID.randomUUID().toString, true, Some(DateTime.now()), None)
        val image2 = createImageForSyndication(UUID.randomUUID().toString, true, Some(DateTime.now().minusDays(5)), None)

        syndRightsOps.mostRecentSyndicationRights(image1, image2) shouldBe image1.syndicationRights
      }
    }

    "Image is in no photoshoot" - {
      val syndRights = someSyndRights
      "correctly apply syndication rights" in {
        withImage(imageWithNoSyndRights) { image =>
          whenReady(syndRightsOps.upsertOrRefreshRights(image = image, newRightsOpt = syndRights)) { _ =>
            whenReady(ES.getImage(image.id)) { optImg =>
              optImg.get.syndicationRights shouldBe defined
              optImg.get.syndicationRights shouldBe syndRights
            }
          }
        }
      }
    }

    "Images in a photoshoot" - {
      "correctly infer rights in the photoshoot when an image with syndication rights is added" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          withImage(imageWithSyndRights) { imageWithRights =>
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
              images.foreach { img =>
                whenReady(ES.getImage(img.id)) { optImg =>
                  optImg.get.syndicationRights shouldBe imageWithRights.syndicationRights.map(_.copy(isInferred = true))
                }
              }
            }
          }
        }
      }

      "recalculate rights in the photoshoot when an image is removed" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          withImage(imageWithSyndRights) { imageWithRights =>
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
              whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = Some(photoshootTitle), currentPhotoshootOpt = None)) { _ =>
                images.foreach { img =>
                  whenReady(ES.getImage(img.id)) { optImg =>
                    optImg.get.syndicationRights shouldBe None
                  }
                }
              }
            }
          }
        }
      }

      "correctly infer rights in the photoshoot when an image receives syndication rights" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          val imageWithRights = images.head
          whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
            images.foreach { img =>
              whenReady(ES.getImage(img.id)) { optImg =>
                optImg.get.syndicationRights shouldBe imageWithRights.syndicationRights.map(_.copy(isInferred = true))
              }
            }
          }
        }
      }

    }
  }
}
