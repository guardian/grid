package syndication

import java.util.UUID

import com.gu.mediaservice.model.{Image, Photoshoot, SyndicationRights}
import com.whisk.docker.impl.spotify.DockerKitSpotify
import com.whisk.docker.scalatest.DockerTestKit
import com.whisk.docker.{DockerContainer, DockerKit}
import helpers.Fixtures
import lib.{ElasticSearchVersion, SyndicationRightsOps}
import org.joda.time.DateTime
import org.scalatest.concurrent.ScalaFutures
import org.scalatest.time.{Millis, Seconds, Span}
import org.scalatest.{BeforeAndAfterAll, FreeSpec, Matchers}
import play.api.libs.json.Json

import scala.concurrent.duration._

trait SyndicationRightsOpsTestsBase extends FreeSpec with Matchers with Fixtures with BeforeAndAfterAll with ScalaFutures with DockerKit with DockerTestKit with DockerKitSpotify {

  def ES: ElasticSearchVersion
  def esContainer: Option[DockerContainer]

  lazy val syndRightsOps = new SyndicationRightsOps(ES)

  def withImage(image: Image)(test: Image => Unit): Unit = {
    ES.indexImage(image.id, Json.toJson(image))
    Thread.sleep(5000)
    test(image)
  }

  def withPhotoshoot(photoshoot: Photoshoot)(test: List[Image] => Unit): Unit = {
    val images = (1 until 5).map { _ =>
      val image = imageWithPhotoshoot(photoshoot)
      ES.indexImage(image.id, Json.toJson(image))
      image
    }.toList
    Thread.sleep(5000)
    test(images)
  }

  override def beforeAll {
    super.beforeAll()
    ES.ensureAliasAssigned()
  }

  def addSyndicationRights(image: Image, someRights: Option[SyndicationRights]) = {
    image.copy(syndicationRights = someRights)
  }

  final override def dockerContainers: List[DockerContainer] =
    esContainer.toList ++ super.dockerContainers

  final override val StartContainersTimeout = 1.minute

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
          whenReady(syndRightsOps.upsertOrRefreshRights(image = addSyndicationRights(image, syndRights))) { _ =>
            whenReady(ES.getImage(image.id)) { optImg =>
              optImg.get.syndicationRights shouldBe defined
              optImg.get.syndicationRights shouldBe syndRights
            }
          }
        }
      }
    }

    "Images in a photoshoot" - {
      "correctly infer rights in a photoshoot containing images with no syndication rights, when an image with syndication rights is added" in {
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

      "correctly infer rights in a photoshoot containing images with syndication rights, when an image with more recent syndication rights is added" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          withImage(imageWithSyndRights) { imageWithRights1 =>
            withImage(imageWithSyndRights) { imageWithRights2 =>
              whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights1, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
                whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights2, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
                  images.foreach { img =>
                    whenReady(ES.getImage(img.id)) { optImg =>
                      optImg.get.syndicationRights shouldBe imageWithRights2.syndicationRights.map(_.copy(isInferred = true))
                    }
                  }
                }
              }
            }
          }
        }
      }

      "correctly infer rights in the photoshoot when an image with no syndication rights is added" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          withImage(imageWithNoSyndRights) { imageWithRights =>
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
              images.foreach { img =>
                whenReady(ES.getImage(img.id)) { optImg =>
                  optImg.get.syndicationRights shouldBe None
                }
              }
            }
          }
        }
      }

      "correctly infer rights in the photoshoot when an image in that photoshoot receives rights" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")
        val syndRights = someSyndRights

        withPhotoshoot(photoshootTitle) { images =>
          val imageWithNoRights = images.head
          whenReady(syndRightsOps.upsertOrRefreshRights(image = addSyndicationRights(imageWithNoRights, syndRights), previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
            images.tail.foreach { img =>
              whenReady(ES.getImage(img.id)) { optImg =>
                optImg.get.syndicationRights shouldBe syndRights.map(_.copy(isInferred = true))
              }
            }
            whenReady(ES.getImage(imageWithNoRights.id)) { img =>
              img.get.syndicationRights shouldBe syndRights
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
                whenReady(ES.getImage(imageWithRights.id)) { optImg =>
                  optImg.get.syndicationRights shouldBe imageWithRights.syndicationRights
                }
              }
            }
          }
        }
      }
    }
  }
}
