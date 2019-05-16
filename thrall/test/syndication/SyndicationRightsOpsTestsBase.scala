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
import scala.util.Properties

trait SyndicationRightsOpsTestsBase extends FreeSpec with Matchers with Fixtures with BeforeAndAfterAll with ScalaFutures with DockerKit with DockerTestKit with DockerKitSpotify {

  val useEsDocker = Properties.envOrElse("ES6_USE_DOCKER", "true").toBoolean
  val es6TestUrl = Properties.envOrElse("ES6_TEST_URL", "http://localhost:9200")

  def ES: ElasticSearchVersion
  def esContainer: Option[DockerContainer]

  lazy val syndRightsOps = new SyndicationRightsOps(ES)

  def withImage(image: Image)(test: Image => Unit): Unit = {
    ES.indexImage(image.id, Json.toJson(image))
    Thread.sleep(1000)
    test(image)
  }

  def withPhotoshoot(photoshoot: Photoshoot)(test: List[Image] => Unit): Unit = {
    val images = (1 to 5).map { _ =>
      val image = imageWithPhotoshoot(photoshoot)
      ES.indexImage(image.id, Json.toJson(image))
      image
    }.toList
    Thread.sleep(1000)
    test(images)
  }

  override def beforeAll {
    super.beforeAll()
    ES.ensureAliasAssigned()
  }

  private def addSyndicationRights(image: Image, someRights: Option[SyndicationRights]): Image = image.copy(syndicationRights = someRights)

  private def makeSyndicationRightsInferred(imageWithRights: Image): Option[SyndicationRights] = imageWithRights.syndicationRights.map(_.copy(isInferred = true))

  final override def dockerContainers: List[DockerContainer] = esContainer.toList ++ super.dockerContainers

  final override val StartContainersTimeout = 1.minute

  implicit val defaultPatience = PatienceConfig(timeout = Span(30, Seconds), interval = Span(250, Millis))

  "SyndicationRightsOps" - {
    "General logic" - {
      "return the most recent syndication rights" in {
        val image1 = createImageForSyndication(UUID.randomUUID().toString, rightsAcquired = true, Some(DateTime.now()), None)
        val image2 = createImageForSyndication(UUID.randomUUID().toString, rightsAcquired = true, Some(DateTime.now().minusDays(5)), None)

        syndRightsOps.mostRecentSyndicationRights(image1, image2) shouldBe image1.syndicationRights
      }
    }

    "Applying rights when outside photoshoot" - {
      val syndRights = someSyndRights
      "save rights on image" in {
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

    "Inferring rights in a photoshoot with no syndication rights" - {
      "an image with syndication rights is added" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          withImage(imageWithSyndRights) { imageWithRights =>
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
              images.foreach { img =>
                whenReady(ES.getImage(img.id)) { optImg =>
                  optImg.get.syndicationRights shouldBe makeSyndicationRightsInferred(imageWithRights)
                }
              }
            }
          }
        }
      }

      "an image with no syndication rights is added" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          withImage(imageWithNoSyndRights) { imageWithNoRights =>
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithNoRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
              images.foreach { img =>
                whenReady(ES.getImage(img.id)) { optImg =>
                  optImg.get.syndicationRights shouldBe None
                }
              }
            }
          }
        }
      }

      "an image in that photoshoot receives syndication rights" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")
        val syndRights = someSyndRights

        withPhotoshoot(photoshootTitle) { images =>
          val imageWithNoRights = images.head
          val imageWithRights = addSyndicationRights(imageWithNoRights, syndRights)
          whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
            images.tail.foreach { img =>
              whenReady(ES.getImage(img.id)) { optImg =>
                optImg.get.syndicationRights shouldBe makeSyndicationRightsInferred(imageWithRights)
              }
            }
            whenReady(ES.getImage(imageWithNoRights.id)) { img =>
              img.get.syndicationRights shouldBe syndRights
            }
          }
        }
      }
    }

    "Inferring rights in a photoshoot with syndication rights" - {
      "an image with more recent syndication rights is added" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          withImage(imageWithSyndRights) { imageWithRights1 =>
            withImage(imageWithSyndRights) { imageWithRights2 =>
              whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights1, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
                whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights2, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
                  images.foreach { img =>
                    whenReady(ES.getImage(img.id)) { optImg =>
                      optImg.get.syndicationRights shouldBe makeSyndicationRightsInferred(imageWithRights2)
                    }
                  }
                }
              }
            }
          }
        }
      }

      "an image with no syndication rights is added" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          val imageWithNoRights = images.head
          val syndRights = someSyndRights
          val imageWithRights = addSyndicationRights(imageWithNoRights, syndRights)
          whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
            withImage(imageWithNoSyndRights) { imageWithNoRights =>
              whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithNoRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
                (images.tail :+ imageWithNoRights).foreach { img =>
                  whenReady(ES.getImage(img.id)) { optImg =>
                    optImg.get.syndicationRights shouldBe makeSyndicationRightsInferred(imageWithRights)
                  }
                }
              }
            }
          }
        }
      }

      "the image with not inferred syndication rights is removed" in {
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

      "an image with inferred syndication rights is removed" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")

        withPhotoshoot(photoshootTitle) { images =>
          withImage(imageWithSyndRights) { imageWithRights =>
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle))) { _ =>
              whenReady(syndRightsOps.upsertOrRefreshRights(image = addSyndicationRights(images.head, makeSyndicationRightsInferred(imageWithRights)), previousPhotoshootOpt = Some(photoshootTitle), currentPhotoshootOpt = None)) { _ =>
                images.tail.foreach { img =>
                  whenReady(ES.getImage(img.id)) { optImg =>
                    optImg.get.syndicationRights shouldBe makeSyndicationRightsInferred(imageWithRights)
                  }
                }
                whenReady(ES.getImage(images.head.id)) { optImg =>
                  optImg.get.syndicationRights shouldBe None
                }
              }
            }
          }
        }
      }
    }
  }
}
