package lib.elasticsearch

import java.util.UUID
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{LeasesByMedia, MediaLease}
import com.gu.mediaservice.model.usage.Usage
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.http._
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json.{JsDefined, JsLookupResult, JsObject, JsString, Json}

import scala.concurrent.{Await, Future}

class ElasticSearchTest extends ElasticSearchTestBase {
  "Elasticsearch" - {
     implicit val logMarker: LogMarker = MarkerMap()


    "images" - {

      "indexing" - {
        "can index and retrieve images by id" in {
          val id = UUID.randomUUID().toString

          val userMetadata = Some(Edits(metadata = ImageMetadata(
            description = Some("My boring image"),
            title = Some("User supplied title"),
            subjects = List("foo", "bar"),
            specialInstructions = Some("Testing")
          )))

          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None).
            copy(userMetadata = userMetadata)

          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          reloadedImage(id).get.id shouldBe image.id
        }

        "file metadata fields longer than the index keyword limit are still persisted" in {
          val id = UUID.randomUUID().toString
          val reallyLongTRC = stringLongerThan(250000)
          val fileMetadata = FileMetadata(xmp = Map("foo" -> JsString("bar")), exif = Map("Green TRC" -> reallyLongTRC))

          val imageWithReallyLongMetadataField = createImageForSyndication(id = UUID.randomUUID().toString,
            rightsAcquired = true,
            rcsPublishDate = Some(now),
            lease = None, fileMetadata = Some(fileMetadata))

          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, imageWithReallyLongMetadataField, now)), fiveSeconds)

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithReallyLongMetadataField.id))

          reloadedImage(id).get.id shouldBe imageWithReallyLongMetadataField.id

          reloadedImage(id).get.fileMetadata.exif("Green TRC").length shouldBe reallyLongTRC.length
        }

        "initial indexing does not add lastModified to the leases object" in {
          val id = UUID.randomUUID().toString
          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)

          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)
          val loadedImage = reloadedImage(id).get
          loadedImage.leases.lastModified shouldBe None
        }

        "updating an existing image should set the last modified date" in {
          val id = UUID.randomUUID().toString
          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)
          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)

          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)
          val lastModified = reloadedImage(id).get.lastModified

          lastModified.nonEmpty shouldBe true
        }

        "initial index calls do not refresh metadata from user metadata" in {
          val id = UUID.randomUUID().toString
          val originalUserMetadata = Some(Edits(metadata = ImageMetadata(description = Some("My boring image"), title = Some("User supplied title"))))
          val imageWithBoringMetadata = createImageForSyndication(id = id, true, Some(now), None).copy(userMetadata = originalUserMetadata)

          ES.migrationAwareIndexImage(id, imageWithBoringMetadata, now)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

          reloadedImage(id).get.metadata.title shouldBe Some("Test image " + id)
          reloadedImage(id).get.metadata.description shouldBe None
        }

        "reindex calls refresh metadata from user metadata" in {
          val id = UUID.randomUUID().toString
          val originalUserMetadata = Some(Edits(metadata = ImageMetadata(description = Some("My boring image"), title = Some("User supplied title"))))
          val imageWithBoringMetadata = createImageForSyndication(id = id, true, Some(now), None).copy(userMetadata = originalUserMetadata)
          ES.migrationAwareIndexImage(id, imageWithBoringMetadata, now)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

          ES.migrationAwareIndexImage(id, imageWithBoringMetadata, now)

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).get.metadata.title shouldBe Some("User supplied title"))
          reloadedImage(id).get.metadata.description shouldBe Some("My boring image")
        }

        "empty user metadata fields should be omitted from updated user metadata" in {
          val id = UUID.randomUUID().toString
          val originalUserMetadata = Some(Edits(metadata = ImageMetadata(description = Some("My boring image"), title = Some("User supplied title"), credit = Some(""))))
          val image = createImageForSyndication(id = id, true, Some(now), None).copy(userMetadata = originalUserMetadata)
          ES.migrationAwareIndexImage(id, image, now)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).get.metadata.title shouldBe Some("User supplied title"))
          reloadedImage(id).get.metadata.description shouldBe Some("My boring image")
          reloadedImage(id).get.metadata.credit shouldBe None
        }

        "reindex calls refresh usage rights from user metadata" in {
          val id = UUID.randomUUID().toString

          val updatedUsageRights: UsageRights = StaffPhotographer("Test", "Testing")
          val usageMetadata = Some(Edits(usageRights = Some(updatedUsageRights), metadata = ImageMetadata(description = Some("My boring image"), title = Some("User supplied title"))))
          val image = createImageForSyndication(id = id, true, Some(now), None).copy(userMetadata = usageMetadata)
          ES.migrationAwareIndexImage(id, image, now)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          ES.migrationAwareIndexImage(id, image, now)

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).get.usageRights.asInstanceOf[StaffPhotographer].photographer shouldBe "Test")
        }

        "reindexing should preserve existing identifiers" in {
          // TODO
        }

        "reindexing should update suggesters" in {
          // TODO don't know how to assert this
        }

        "reindexing does not over write certain existing uploadTime, userMetadata, exports, uploadedBy, collections, leases and usages fields" in {
          val id = UUID.randomUUID().toString

          val updatedUsageRights: UsageRights = StaffPhotographer("Test", "Testing")
          val usageMetadata = Some(Edits(usageRights = Some(updatedUsageRights), metadata = ImageMetadata(description = Some("My boring image"), title = Some("User supplied title"))))
          val image = createImageForSyndication(id = id, true, Some(now), None).copy(userMetadata = usageMetadata)
          ES.migrationAwareIndexImage(id, image, now)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          val attemptedOverwrite = image.copy(
            uploadTime = DateTime.now,
            uploadedBy = "someone else"

          )

          ES.migrationAwareIndexImage(id, attemptedOverwrite, now)

          reloadedImage(id).get.uploadTime.getMillis shouldBe image.uploadTime.getMillis
          reloadedImage(id).get.uploadedBy shouldBe image.uploadedBy
        }

      }

      "deleting" - {
        "can delete image" in {
          val id = UUID.randomUUID().toString
          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)
          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(indexedImage(id).map(_.id) shouldBe Some(image.id))

          Await.result(Future.sequence(ES.deleteImage(id)), fiveSeconds)

          reloadedImage(id).map(_.id) shouldBe None
        }

        "failed deletes are indiciated with a failed future" in {
          val id = UUID.randomUUID().toString
          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)
          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          val unknownImage = UUID.randomUUID().toString

          whenReady(ES.deleteImage(unknownImage).head.failed) { ex =>
            ex shouldBe ImageNotDeletable
          }
        }

        "should not delete images with usages" in {
          val id = UUID.randomUUID().toString
          val imageWithUsages = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None).copy(usages = List(usage()))
          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, imageWithUsages, now)), fiveSeconds)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithUsages.id))

          whenReady(ES.deleteImage(id).head.failed) { ex =>
            ex shouldBe ImageNotDeletable
          }
        }

        "should not delete images with exports" in {
          val id = UUID.randomUUID().toString
          val imageWithExports = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None).copy(exports = List(crop))
          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, imageWithExports, now)), fiveSeconds)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithExports.id))

          whenReady(ES.deleteImage(id).head.failed) { ex =>
            ex shouldBe ImageNotDeletable
          }
        }

      }
    }

    "collections" - {

      "can set image collections" in {
        val id = UUID.randomUUID().toString
        val imageWithExports = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None).copy(exports = List(crop))
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, imageWithExports, now)), fiveSeconds)

        val collection = Collection(path = List("/somewhere"), actionData = ActionData("Test author", DateTime.now), "A test collection")
        val anotherCollection = Collection(path = List("/somewhere-else"), actionData = ActionData("Test author", DateTime.now), "Another test collection")

        val collections = List(collection, anotherCollection)

        Await.result(Future.sequence(ES.setImageCollections(id, collections, now)), fiveSeconds)

        reloadedImage(id).get.collections.size shouldBe 2
        reloadedImage(id).get.collections.head.description shouldEqual "A test collection"
      }
    }

    "exports" - {

      "can add exports" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)
        reloadedImage(id).get.exports.isEmpty shouldBe true
        val exports = List(crop)

        Await.result(Future.sequence(ES.updateImageExports(id, exports, now)), fiveSeconds) // TODO rename to add

        reloadedImage(id).get.exports.nonEmpty shouldBe true
        reloadedImage(id).get.exports.head.id shouldBe crop.id
      }

      "can delete exports" in {
        val id = UUID.randomUUID().toString
        val imageWithExports = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None).copy(exports = List(crop))
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, imageWithExports, now)), fiveSeconds)
        reloadedImage(id).get.exports.nonEmpty shouldBe true

        Await.result(Future.sequence(ES.deleteImageExports(id, now)), fiveSeconds)

        reloadedImage(id).get.exports.isEmpty shouldBe true
      }

      "deleting exports for a non-existant image is not an error" in {
        val id = UUID.randomUUID().toString
        val result = Await.result(Future.sequence(ES.deleteImageExports(id, now)), fiveSeconds)
        result should have length 1
      }
    }

    "leases" - {

      "can add image lease" in {
        val id = UUID.randomUUID().toString
        val timeBeforeEdit = DateTime.now.minusMinutes(1)
        val image = createImageForSyndication(
          id,
          true,
          Some(now),
          None,
          leasesLastModified = Some(timeBeforeEdit))
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)
        reloadedImage(id).get.leases.leases.isEmpty shouldBe true

        val lease = model.leases.MediaLease(
          id = Some(UUID.randomUUID().toString),
          leasedBy = None,
          notes = Some("A test lease"),
          mediaId = UUID.randomUUID().toString
        )

        Await.result(Future.sequence(ES.addImageLease(id, lease, now)), fiveSeconds)

        val newLeases = reloadedImage(id).get.leases
        newLeases.leases.nonEmpty shouldBe true
        newLeases.leases.head.id shouldBe lease.id
        newLeases.lastModified.get.isAfter(timeBeforeEdit) shouldBe true
      }

      "can remove image lease" in {
        val lease = model.leases.MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("A test lease"), mediaId = UUID.randomUUID().toString)
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id, true, Some(now), lease = Some(lease))
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)
        reloadedImage(id).get.leases.leases.nonEmpty shouldBe true

        Await.result(Future.sequence(ES.removeImageLease(id, lease.id, now)), fiveSeconds)

        reloadedImage(id).get.leases.leases.isEmpty shouldBe true
      }

      "can remove image lease for an image which doesn't exist" in {
        val lease = model.leases.MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("A test lease"), mediaId = UUID.randomUUID().toString)
        val id = UUID.randomUUID().toString

        val result = Await.result(Future.sequence(ES.removeImageLease(id, lease.id, now)), fiveSeconds)
        result should have length 1
      }

      "removing a lease should update the leases last modified time" in {
        val lease = model.leases.MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("A test lease"), mediaId = UUID.randomUUID().toString)
        val timeBeforeEdit = DateTime.now
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(
          id = UUID.randomUUID().toString,

          true,
          Some(now),
          lease = Some(lease)
        )
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)
        reloadedImage(id).get.leases.leases.nonEmpty shouldBe true

        Await.result(Future.sequence(ES.removeImageLease(id, lease.id, now)), fiveSeconds)

        val newLeases = reloadedImage(id).get.leases
        newLeases.leases.isEmpty shouldBe true
        newLeases.lastModified.get.isAfter(timeBeforeEdit) shouldBe true
      }

      "can replace leases" in {
        val lease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("A test lease"), mediaId = UUID.randomUUID().toString)
        val id = UUID.randomUUID().toString
        val timeBeforeEdit = DateTime.now
        val image = createImageForSyndication(
          id = UUID.randomUUID().toString,
          true,
          Some(now),
          lease = Some(lease),
          leasesLastModified = Some(timeBeforeEdit)
        )
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)

        val updatedLease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("An updated lease"), mediaId = UUID.randomUUID().toString)
        val anotherUpdatedLease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("Another updated lease"), mediaId = UUID.randomUUID().toString)
        val updatedLeases = Seq(updatedLease, anotherUpdatedLease)
        updatedLeases.size shouldBe 2

        Await.result(Future.sequence(ES.replaceImageLeases(id, updatedLeases, now)), fiveSeconds)

        val newLeases = reloadedImage(id).get.leases
        newLeases.leases.size shouldBe 2
        newLeases.leases.head.notes shouldBe Some("An updated lease")
        newLeases.lastModified.get.isAfter(timeBeforeEdit) shouldBe true
      }

      "can replace leases when they are empty" in {
        val lease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("A test lease"), mediaId = UUID.randomUUID().toString)
        val id = UUID.randomUUID().toString
        val timeBeforeEdit = DateTime.now
        val image = createImageForSyndication(
          id = UUID.randomUUID().toString,
          true,
          Some(now),
          lease = None,
          leasesLastModified = Some(timeBeforeEdit)
        ).copy(leases = LeasesByMedia.empty)
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)

        val updatedLease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("An updated lease"), mediaId = UUID.randomUUID().toString)
        val anotherUpdatedLease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("Another updated lease"), mediaId = UUID.randomUUID().toString)
        val updatedLeases = Seq(updatedLease, anotherUpdatedLease)
        updatedLeases.size shouldBe 2

        Await.result(Future.sequence(ES.replaceImageLeases(id, updatedLeases, now)), fiveSeconds)

        val newLeases = reloadedImage(id).get.leases
        newLeases.leases.size shouldBe 2
        newLeases.leases.head.notes shouldBe Some("An updated lease")
        newLeases.lastModified.get.isAfter(timeBeforeEdit) shouldBe true
      }
    }

    "dates" - {

      "initial write populates last modified" in {
        val id = UUID.randomUUID().toString
        val image = createImage(id, StaffPhotographer("Bruce Wayne", "Wayne Enterprises"))

        val date = now.withSecondOfMinute(0)

        // Write  date
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, date)), fiveSeconds)

        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))( {
          val image = reloadedImage(id)
          image.get.lastModified.get shouldBe date
        })
      }

      "last modified gets updated in normal order" in {
        val id = UUID.randomUUID().toString
        val image = createImage(id, StaffPhotographer("Bruce Wayne", "Wayne Enterprises"))

        val earlierDate = now.withSecondOfMinute(0)
        val laterDate = earlierDate.withSecondOfMinute(30)  // Clearly thirty seconds later.

        // Write first date first
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, earlierDate)), fiveSeconds)
        // Write second date second
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, laterDate)), fiveSeconds)

        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))( {
          val image = reloadedImage(id)
          image.get.lastModified.get shouldBe laterDate
        })
      }

      "last modified does not get updated in wrong order" in {
        val id = UUID.randomUUID().toString
        val image = createImage(id, StaffPhotographer("Bruce Wayne", "Wayne Enterprises"))

        val earlierDate = now.withSecondOfMinute(0)
        val laterDate = earlierDate.withSecondOfMinute(30)  // Clearly thirty seconds later.

        // Write second date first
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, laterDate)), fiveSeconds)

        val updatedImage = eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))( {
          val image = reloadedImage(id)
          image.get
        })
          .copy(lastModified = Some(earlierDate))
          .copy(usageRights = StaffPhotographer("Dr. Pamela Lillian Isley", "Poison Ivy Inc."))

        // Write first date second
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, updatedImage, earlierDate)), fiveSeconds)

        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))( {
          val image =  reloadedImage(id)
          image.get.lastModified.get shouldBe laterDate
        })
      }

    }

    "usages" - {

      "can delete all usages for an image which does not exist" in {
        val id = UUID.randomUUID().toString

        val result = Await.result(Future.sequence(ES.deleteAllImageUsages(id, now)), fiveSeconds)

        result should have length 1
      }

      "can delete all usages for an image" in {
        val id = UUID.randomUUID().toString
        val imageWithUsages = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None).copy(usages = List(usage()))
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, imageWithUsages, now)), fiveSeconds)

        Await.result(Future.sequence(ES.deleteAllImageUsages(id, now)), fiveSeconds)

        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).get.usages.isEmpty shouldBe true)
      }

      "can update usages" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)

        Await.result(Future.sequence(ES.updateImageUsages(id, List(usage()), now)), fiveSeconds)

        reloadedImage(id).get.usages.size shouldBe 1
      }

      "can update usages if the modification date of the update is new than the existing one" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)

        val existingUsage = usage(id = "existing")
        Await.result(Future.sequence(ES.updateImageUsages(id, List(existingUsage), now)), fiveSeconds)
        reloadedImage(id).get.usages.head.id shouldEqual ("existing")

        val moreRecentUsage = usage(id = "most-recent")
        Await.result(Future.sequence(ES.updateImageUsages(id, List(moreRecentUsage), now)), fiveSeconds)

        reloadedImage(id).get.usages.size shouldBe 1
        reloadedImage(id).get.usages.head.id shouldEqual ("most-recent")
      }

      "should ignore usage update requests when the proposed last modified date is older than the current" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)
        Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)

        val mostRecentUsage = usage(id = "recent")
        Await.result(Future.sequence(ES.updateImageUsages(id, List(mostRecentUsage), now)), fiveSeconds)

        val staleUsage = usage(id = "stale")
        val staleLastModified = DateTime.now.minusWeeks(1)
        Await.result(Future.sequence(ES.updateImageUsages(id, List(staleUsage), staleLastModified)), fiveSeconds)

        reloadedImage(id).get.usages.head.id shouldEqual ("recent")
      }
    }

    "syndication rights" - {
      "updated syndication rights should be persisted" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)
        ES.migrationAwareIndexImage(id, image, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

        val newSyndicationRights = SyndicationRights(published = Some(now), suppliers = Seq.empty, rights = Seq.empty)

        Await.result(Future.sequence(ES.updateImageSyndicationRights(id, Some(newSyndicationRights), now)), fiveSeconds)

        reloadedImage(id).flatMap(_.syndicationRights) shouldEqual Some(newSyndicationRights)
      }

      "updating syndication rights should update last modified date" in {
        val id = UUID.randomUUID().toString
        val beforeUpdate = now
        val image = createImageForSyndication(
          id = UUID.randomUUID().toString,
          true,
          Some(now),
          None,
          leasesLastModified = Some(beforeUpdate)
        )
        ES.migrationAwareIndexImage(id, image, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

        val newSyndicationRights = SyndicationRights(published = Some(now.minusWeeks(1)), suppliers = Seq.empty, rights = Seq.empty)

        Await.result(Future.sequence(ES.updateImageSyndicationRights(id, Some(newSyndicationRights), now)), fiveSeconds)

        reloadedImage(id).get.lastModified.get.isAfter(beforeUpdate) shouldEqual true
      }

      "can delete syndication rights" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)
        ES.migrationAwareIndexImage(id, image, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))
        reloadedImage(id).get.syndicationRights.nonEmpty shouldBe true

        Await.result(Future.sequence(ES.deleteSyndicationRights(id, now)), fiveSeconds)

        reloadedImage(id).get.syndicationRights.isEmpty shouldBe true
      }

      "can delete syndication rights from an image which does not exist" in {
        val id = UUID.randomUUID().toString

        val result = Await.result(Future.sequence(ES.deleteSyndicationRights(id, now)), fiveSeconds)

        result should have length 1
      }
    }

    "user metadata" - {
      "can update user metadata for an existing image" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)

        ES.migrationAwareIndexImage(id, imageWithBoringMetadata, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val updatedMetadata = Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("An interesting image")))
        val updatedLastModifiedDate = DateTime.now

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            updatedMetadata,
            updatedLastModifiedDate)),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadata.get.metadata.description) shouldBe Some("An interesting image")
      }

      "updating user metadata should update the image and user meta data last modified dates" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)

        ES.migrationAwareIndexImage(id, imageWithBoringMetadata, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val updatedMetadata = Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("An updated image")))
        val updatedLastModifiedDate = DateTime.now.withZone(DateTimeZone.UTC)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            updatedMetadata,
            updatedLastModifiedDate)),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadataLastModified) shouldEqual Some(updatedLastModifiedDate)
        reloadedImage(id).flatMap(_.lastModified) shouldEqual Some(updatedLastModifiedDate)
      }

      "original metadata is unchanged by a user metadata edit" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)

        ES.migrationAwareIndexImage(id, imageWithBoringMetadata, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val updatedMetadata = Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("An interesting image")))
        val updatedLastModifiedDate = DateTime.now

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            updatedMetadata,
            updatedLastModifiedDate)),
          fiveSeconds)

        reloadedImage(id).map(_.originalMetadata) shouldEqual Some(imageWithBoringMetadata.originalMetadata)
      }

      "should apply metadata update if user metadata is set but before new modified date" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)

        ES.migrationAwareIndexImage(id, image, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

        val userMetadata = ImageMetadata(description = Some("An updated image"), subjects = List("sausages"))
        val updatedLastModifiedDate = DateTime.now.withZone(DateTimeZone.UTC)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            Edits(labels = List("foo"), metadata = userMetadata),
            updatedLastModifiedDate)),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadataLastModified) shouldEqual Some(updatedLastModifiedDate)
        reloadedImage(id).get.userMetadata.get.metadata.subjects shouldEqual List("sausages")
        reloadedImage(id).get.userMetadata.get.labels shouldEqual List("foo")

        val furtherUpdatedMetadata = userMetadata.copy(description = Some("A further updated image"), subjects = List("sausages", "chips"))

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            Edits(labels = List("foo", "bar"), metadata = furtherUpdatedMetadata),
            updatedLastModifiedDate.plusSeconds(1))),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadata.get.metadata.description) shouldEqual Some("A further updated image")
        reloadedImage(id).get.userMetadata.get.metadata.subjects shouldEqual List("sausages", "chips")
        reloadedImage(id).get.userMetadata.get.labels shouldEqual List("foo", "bar")
      }

      "should ignore update if the proposed modification date is older than the current user metadata last modified date" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)

        ES.migrationAwareIndexImage(id, imageWithBoringMetadata, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val latestMetadata = Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("Latest edit")))
        val latestLastModifiedDate = DateTime.now.withZone(DateTimeZone.UTC)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            latestMetadata,
            latestLastModifiedDate)),
          fiveSeconds)

        val staleMetadata = Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("A stale edit")))
        val staleLastModifiedDate = latestLastModifiedDate.minusSeconds(1)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            staleMetadata,
            staleLastModifiedDate)),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadata.get.metadata.description) shouldBe Some("Latest edit")
        reloadedImage(id).flatMap(_.userMetadataLastModified) shouldEqual Some(latestLastModifiedDate)
      }

      "updating user metadata with new usage rights should update usage rights" in {
        val id = UUID.randomUUID().toString
        val imageWithUsageRights = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)

        ES.migrationAwareIndexImage(id, imageWithUsageRights, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithUsageRights.id))

        val newPhotographer = StaffPhotographer(photographer = "Test Photographer", publication = "Testing")

        val metadataWithUpdatedUsageRights = Edits(usageRights = Some(newPhotographer), metadata = imageWithUsageRights.metadata)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            metadataWithUpdatedUsageRights,
            DateTime.now.withZone(DateTimeZone.UTC))),
          fiveSeconds)

        reloadedImage(id).get.usageRights.asInstanceOf[StaffPhotographer].photographer shouldEqual "Test Photographer"
      }

      "updating user metadata should update photoshoot suggestions" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(now), None)

        ES.migrationAwareIndexImage(id, imageWithBoringMetadata, now)
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val newPhotoshoot = Photoshoot("Test photoshoot")

        val updatedMetadata = Edits(photoshoot = Some(newPhotoshoot), metadata = imageWithBoringMetadata.metadata.copy())

        Await.result(Future.sequence(ES.applyImageMetadataOverride(id, updatedMetadata, now)), fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadata.get.photoshoot.map(_.title)) shouldEqual Some("Test photoshoot")
        // TODO how to assert that the suggestion was added?
      }
    }

    "date checks" - {
      "correct zone" in {
        import com.gu.mediaservice.lib.formatting.parseOptDateTime
        val parsedDate = parseOptDateTime(Some("2021-01-13T15:26:27.234Z"))
        parsedDate.get.getZone shouldEqual(DateTimeZone.UTC)
      }
    }

    "migration aware" - {
      "updates" - {
        "when only the current index exists, migration index is silently ignored" in {
          val id = UUID.randomUUID().toString
          val photog = StaffPhotographer("Tom Jenkins", "The Guardian")
          val image = createImage(id = UUID.randomUUID().toString, photog)
          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)

          val updateDoc = """
            |{
            |  "identifiers": {
            |    "test": "done"
            |  }
            |}""".stripMargin

          // does not throw, despite migration index not existing
          Await.result(ES.migrationAwareUpdater(
            indexName => updateById(index = indexName, id = id).doc(updateDoc),
            indexName => s"update $id for $indexName"
          ), fiveSeconds)

          ES.getImage(id).await.get.identifiers shouldEqual Map("test" -> "done")
        }

        "when migration alias also exists, but does not contain doc to be updated" in {
          ES.assignAliasTo(migrationIndexName, ES.imagesMigrationAlias)
          val id = UUID.randomUUID().toString
          val photog = StaffPhotographer("Tom Jenkins", "The Guardian")
          val image = createImage(id, photog)
          Await.result(ES.directInsert(image, ES.imagesCurrentAlias), fiveSeconds)

          val updateDoc = """
            |{
            |  "identifiers": {
            |    "test": "done"
            |  }
            |}""".stripMargin

          // does not throw, despite migration index not containing doc with id `id`
          Await.result(ES.migrationAwareUpdater(
            indexName => updateById(index = indexName, id = id).doc(updateDoc),
            indexName => s"update $id for $indexName"
          ), fiveSeconds)

          val getRequest = get(ES.imagesCurrentAlias, id)
          val result = ES.executeAndLog(getRequest, "").await.result

          result.found shouldBe true

          val requestedImage = Json.parse(result.sourceAsString).as[Image]

          requestedImage.identifiers shouldEqual Map("test" -> "done")

          ES.removeAliasFrom(migrationIndexName, ES.imagesMigrationAlias)
        }

        "when migration index contains doc, both are updated" in {
          ES.assignAliasTo(migrationIndexName, ES.imagesMigrationAlias)
          ES.refreshAndRetrieveMigrationStatus()

          val id = UUID.randomUUID().toString
          val photog = StaffPhotographer("Tom Jenkins", "The Guardian")
          val image = createImage(id, photog)
          Await.result(Future.sequence(ES.migrationAwareIndexImage(id, image, now)), fiveSeconds)


          val updateDoc = """
            |{
            |  "identifiers": {
            |    "test": "done"
            |  }
            |}""".stripMargin

          Await.result(ES.migrationAwareUpdater(
            indexName => updateById(index = indexName, id = id).doc(updateDoc),
            indexName => s"update $id for $indexName"
          ), fiveSeconds)

          // check update done in current index
          val getRequestCurrent = get(ES.imagesCurrentAlias, id)
          val resultCurrent = ES.executeAndLog(getRequestCurrent, "").await.result

          resultCurrent.found shouldBe true

          val requestedImageCurrentJson = Json.parse(resultCurrent.sourceAsString)

          (requestedImageCurrentJson \ "esInfo").as[EsInfo].migration.get.migratedTo shouldBe Some(migrationIndexName)

          requestedImageCurrentJson.as[Image].identifiers shouldEqual Map("test" -> "done")

          // check update also done in migration index
          val getRequestMigration = get(ES.imagesMigrationAlias, id)
          val resultMigration = ES.executeAndLog(getRequestMigration, "").await.result

          resultMigration.found shouldBe true

          val requestedImageMigrationJson = Json.parse(resultMigration.sourceAsString)

          (requestedImageMigrationJson \ "esInfo").asOpt[EsInfo] shouldBe None

          requestedImageMigrationJson.as[Image].identifiers shouldEqual Map("test" -> "done")

          ES.removeAliasFrom(migrationIndexName, ES.imagesMigrationAlias)
        }
      }
    }
  }
  private def now = DateTime.now(DateTimeZone.UTC)
}
