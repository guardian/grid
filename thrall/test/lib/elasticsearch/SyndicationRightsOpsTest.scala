package lib.elasticsearch

import java.util.UUID

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model.{Image, Photoshoot, SyndicationRights}
import org.joda.time.{DateTime, DateTimeZone}
import org.scalatest.time.{Millis, Seconds, Span}

class SyndicationRightsOpsTest extends ElasticSearchTestBase {

  lazy val syndRightsOps = new SyndicationRightsOps(ES)

  def withImage(image: Image)(test: Image => Unit): Unit = {
    implicit val logMarker: LogMarker = MarkerMap()

    ES.indexImage(image.id, image, now)
    Thread.sleep(1000)
    test(image)
  }

  def withPhotoshoot(photoshoot: Photoshoot)(test: List[Image] => Unit): Unit = {
    implicit val logMarker: LogMarker = MarkerMap()

    val images = (1 to 5).map { _ =>
      val image = imageWithPhotoshoot(photoshoot)
      ES.indexImage(image.id, image, now)
      image
    }.toList
    Thread.sleep(1000)
    test(images)
  }

  private def addSyndicationRights(image: Image, someRights: Option[SyndicationRights]): Image = image.copy(syndicationRights = someRights)

  private def makeSyndicationRightsInferred(imageWithRights: Image): Option[SyndicationRights] = imageWithRights.syndicationRights.map(_.copy(isInferred = true))

  implicit val logMarker: MarkerMap = MarkerMap()
  implicit val defaultPatience: PatienceConfig = PatienceConfig(timeout = Span(30, Seconds), interval = Span(250, Millis))

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
          whenReady(syndRightsOps.upsertOrRefreshRights(image = addSyndicationRights(image, syndRights), currentPhotoshootOpt = None, previousPhotoshootOpt = None, lastModified = now)) { _ =>
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
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle), lastModified = now)) { _ =>
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
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithNoRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle), lastModified = now)) { _ =>
              images.foreach { img =>
                whenReady(ES.getImage(img.id)) { optImg =>
                  optImg.get.syndicationRights shouldBe None
                }
              }
            }
          }
        }
      }

      "an image in that photoshoot receives syndication rights, and the rest of the images in that shoot have their rights inferred" in {
        val photoshootTitle = Photoshoot(s"photoshoot-${UUID.randomUUID()}")
        val syndRights = someSyndRights

        withPhotoshoot(photoshootTitle) { images =>
          val imageWithNoRights = images.head
          val otherImagesInShoot = images.tail

          val imageWithRights = addSyndicationRights(imageWithNoRights, syndRights)
          whenReady(
            syndRightsOps.upsertOrRefreshRights(
              image = imageWithRights,
              previousPhotoshootOpt = None,
              currentPhotoshootOpt = Some(photoshootTitle),
              lastModified = now)
          ) { _ =>
            whenReady(ES.getImage(imageWithNoRights.id)) { img =>
              withClue("the original image should have syndication rights") {
                img.get.syndicationRights shouldBe syndRights
              }
            }
            otherImagesInShoot.foreach { img =>
              whenReady(ES.getImage(img.id)) { optImg =>
                withClue("the other images in the shoot should gain inferred syndication rights") {
                  optImg.get.syndicationRights shouldBe makeSyndicationRightsInferred(imageWithRights)
                }
              }
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
              whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights1, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle), lastModified = now)) { _ =>
                whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights2, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle), lastModified = now)) { _ =>
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
          whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle), lastModified = now)) { _ =>
            withImage(imageWithNoSyndRights) { imageWithNoRights =>
              whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithNoRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle), lastModified = now)) { _ =>
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
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle), lastModified = now)) { _ =>
              whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = Some(photoshootTitle), currentPhotoshootOpt = None, lastModified = now)) { _ =>
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
            whenReady(syndRightsOps.upsertOrRefreshRights(image = imageWithRights, previousPhotoshootOpt = None, currentPhotoshootOpt = Some(photoshootTitle), lastModified = now)) { _ =>
              whenReady(syndRightsOps.upsertOrRefreshRights(image = addSyndicationRights(images.head, makeSyndicationRightsInferred(imageWithRights)), previousPhotoshootOpt = Some(photoshootTitle), currentPhotoshootOpt = None, lastModified = now)) { _ =>
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

  private def now = DateTime.now(DateTimeZone.UTC)
}
