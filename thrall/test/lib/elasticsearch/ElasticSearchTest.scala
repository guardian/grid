package lib.elasticsearch

import java.util.UUID

import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}
import com.gu.mediaservice.model
import com.gu.mediaservice.model._
import com.gu.mediaservice.model.leases.{LeasesByMedia, MediaLease}
import com.sksamuel.elastic4s.ElasticDsl
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.http._
import org.joda.time.{DateTime, DateTimeZone}
import play.api.libs.json.{JsDefined, JsLookupResult, JsString, Json}

import scala.concurrent.{Await, Future}

class ElasticSearchTest extends ElasticSearchTestBase {
  "Elasticsearch" - {
   implicit val logMarker: LogMarker = MarkerMap()


    "images" - {

      "bulk inserting" - {
        "can bulk insert images" in {
          val imageOne = createImage("batman", StaffPhotographer("Bruce Wayne", "Wayne Enterprises")).copy(
            userMetadata = Some(Edits(labels = List("foo", "bar"), metadata = ImageMetadata(description = Some("my description"))))
          )

          val imageTwo = createImage("superman", StaffPhotographer("Clark Kent", "Kent Farm")).copy(
            usages = List(usage())
          )

          val images: List[Image] = List(imageOne, imageTwo)

          // in a clean index, we should have 0 documents
          ES.client.execute(ElasticDsl.count(ES.initialImagesIndex)).await.result.count shouldBe 0

          Await.result(Future.sequence(ES.bulkInsert(images)), fiveSeconds)

          // force ES to refresh https://www.elastic.co/guide/en/elasticsearch/reference/current/indices-refresh.html
          Await.result(ES.client.execute(ElasticDsl.refreshIndex(ES.initialImagesIndex)), fiveSeconds)

          // after bulk inserting, we should have 2 documents
          ES.client.execute(ElasticDsl.count(ES.initialImagesIndex)).await.result.count shouldBe images.length

          Json.toJson(reloadedImage("batman").get) shouldBe Json.toJson(imageOne)
          Json.toJson(reloadedImage("superman").get) shouldBe Json.toJson(imageTwo)
        }
      }

      "indexing" - {
        "can index and retrieve images by id" in {
          val id = UUID.randomUUID().toString

          val userMetadata = Some(Edits(metadata = ImageMetadata(
            description = Some("My boring image"),
            title = Some("User supplied title"),
            subjects = List("foo", "bar"),
            specialInstructions = Some("Testing")
          )))

          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None).
            copy(userMetadata = userMetadata)

          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds) // TODO why is index past in? Is it different to image.id and if so why?

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          reloadedImage(id).get.id shouldBe image.id
        }

        "file metadata fields longer than the index keyword limit are still persisted" in {
          val id = UUID.randomUUID().toString
          val reallyLongTRC = stringLongerThan(250000)
          val fileMetadata = FileMetadata(xmp = Map("foo" -> JsString("bar")), exif = Map("Green TRC" -> reallyLongTRC))

          val imageWithReallyLongMetadataField = createImageForSyndication(id = UUID.randomUUID().toString,
            rightsAcquired = true,
            rcsPublishDate = Some(DateTime.now()),
            lease = None, fileMetadata = Some(fileMetadata))

          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(imageWithReallyLongMetadataField))), fiveSeconds)

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithReallyLongMetadataField.id))

          reloadedImage(id).get.id shouldBe imageWithReallyLongMetadataField.id

          reloadedImage(id).get.fileMetadata.exif("Green TRC").length shouldBe reallyLongTRC.length
        }

        "initial indexing does not set the last modified date because scripts do not run on initial upserts" in { // TODO is this intentional?
          val id = UUID.randomUUID().toString
          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)

          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)
          val lastModified = reloadedImage(id).get.lastModified

          lastModified.nonEmpty shouldBe false
        }

        "initial indexing does not add lastModified to the leases object" in {
          val id = UUID.randomUUID().toString
          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)

          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)
          val loadedImage = reloadedImage(id).get
          loadedImage.leases.lastModified shouldBe None
        }

        "updating an existing image should set the last modified date" in {
          val id = UUID.randomUUID().toString
          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)

          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)
          val lastModified = reloadedImage(id).get.lastModified

          lastModified.nonEmpty shouldBe true
        }

        "initial index calls do not refresh metadata from user metadata" in {
          val id = UUID.randomUUID().toString
          val originalUserMetadata = Some(Edits(metadata = ImageMetadata(description = Some("My boring image"), title = Some("User supplied title"))))
          val imageWithBoringMetadata = createImageForSyndication(id = id, true, Some(DateTime.now()), None).copy(userMetadata = originalUserMetadata)

          ES.indexImage(id, Json.toJson(imageWithBoringMetadata))
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

          reloadedImage(id).get.metadata.title shouldBe Some("Test image " + id)
          reloadedImage(id).get.metadata.description shouldBe None
        }

        "reindex calls refresh metadata from user metadata" in {
          val id = UUID.randomUUID().toString
          val originalUserMetadata = Some(Edits(metadata = ImageMetadata(description = Some("My boring image"), title = Some("User supplied title"))))
          val imageWithBoringMetadata = createImageForSyndication(id = id, true, Some(DateTime.now()), None).copy(userMetadata = originalUserMetadata)
          ES.indexImage(id, Json.toJson(imageWithBoringMetadata))
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

          ES.indexImage(id, Json.toJson(imageWithBoringMetadata))

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).get.metadata.title shouldBe Some("User supplied title"))
          reloadedImage(id).get.metadata.description shouldBe Some("My boring image")
        }

        "empty user metadata fields should be omitted from updated user metadata" in {
          val id = UUID.randomUUID().toString
          val originalUserMetadata = Some(Edits(metadata = ImageMetadata(description = Some("My boring image"), title = Some("User supplied title"), credit = Some(""))))
          val image = createImageForSyndication(id = id, true, Some(DateTime.now()), None).copy(userMetadata = originalUserMetadata)
          ES.indexImage(id, Json.toJson(image))
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)

          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).get.metadata.title shouldBe Some("User supplied title"))
          reloadedImage(id).get.metadata.description shouldBe Some("My boring image")
          reloadedImage(id).get.metadata.credit shouldBe None
        }

        "reindex calls refresh usage rights from user metadata" in {
          val id = UUID.randomUUID().toString

          val updatedUsageRights: UsageRights = StaffPhotographer("Test", "Testing")
          val usageMetadata = Some(Edits(usageRights = Some(updatedUsageRights), metadata = ImageMetadata(description = Some("My boring image"), title = Some("User supplied title"))))
          val image = createImageForSyndication(id = id, true, Some(DateTime.now()), None).copy(userMetadata = usageMetadata)
          ES.indexImage(id, Json.toJson(image))
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          ES.indexImage(id, Json.toJson(image))

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
          val image = createImageForSyndication(id = id, true, Some(DateTime.now()), None).copy(userMetadata = usageMetadata)
          ES.indexImage(id, Json.toJson(image))
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          val attemptedOverwrite = image.copy(
            uploadTime = DateTime.now,
            uploadedBy = "someone else"

          )

          ES.indexImage(id, Json.toJson(attemptedOverwrite))

          reloadedImage(id).get.uploadTime.getMillis shouldBe image.uploadTime.getMillis
          reloadedImage(id).get.uploadedBy shouldBe image.uploadedBy
        }

      }

      "deleting" - {
        "can delete image" in {
          val id = UUID.randomUUID().toString
          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(indexedImage(id).map(_.id) shouldBe Some(image.id))

          Await.result(Future.sequence(ES.deleteImage(id)), fiveSeconds)

          reloadedImage(id).map(_.id) shouldBe None
        }

        "failed deletes are indiciated with a failed future" in {
          val id = UUID.randomUUID().toString
          val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

          val unknownImage = UUID.randomUUID().toString

          whenReady(ES.deleteImage(unknownImage).head.failed) { ex =>
            ex shouldBe ImageNotDeletable
          }
        }

        "should not delete images with usages" in {
          val id = UUID.randomUUID().toString
          val imageWithUsages = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None).copy(usages = List(usage()))
          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(imageWithUsages))), fiveSeconds)
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithUsages.id))

          whenReady(ES.deleteImage(id).head.failed) { ex =>
            ex shouldBe ImageNotDeletable
          }
        }

        "should not delete images with exports" in {
          val id = UUID.randomUUID().toString
          val imageWithExports = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None).copy(exports = List(crop))
          Await.result(Future.sequence(ES.indexImage(id, Json.toJson(imageWithExports))), fiveSeconds)
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
        val imageWithExports = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None).copy(exports = List(crop))
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(imageWithExports))), fiveSeconds)

        val collection = Collection(path = List("/somewhere"), actionData = ActionData("Test author", DateTime.now), "A test collection")
        val anotherCollection = Collection(path = List("/somewhere-else"), actionData = ActionData("Test author", DateTime.now), "Another test collection")

        val collections = List(collection, anotherCollection)

        Await.result(Future.sequence(ES.setImageCollection(id, JsDefined(Json.toJson(collections)))), fiveSeconds)

        reloadedImage(id).get.collections.size shouldBe 2
        reloadedImage(id).get.collections.head.description shouldEqual "A test collection"
      }
    }

    "exports" - {

      "can add exports" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)
        reloadedImage(id).get.exports.isEmpty shouldBe true
        val exports = List(crop)

        Await.result(Future.sequence(ES.updateImageExports(id, JsDefined(Json.toJson(exports)))), fiveSeconds) // TODO rename to add

        reloadedImage(id).get.exports.nonEmpty shouldBe true
        reloadedImage(id).get.exports.head.id shouldBe crop.id
      }

      "can delete exports" in {
        val id = UUID.randomUUID().toString
        val imageWithExports = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None).copy(exports = List(crop))
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(imageWithExports))), fiveSeconds)
        reloadedImage(id).get.exports.nonEmpty shouldBe true

        Await.result(Future.sequence(ES.deleteImageExports(id, logMarker)), fiveSeconds)

        reloadedImage(id).get.exports.isEmpty shouldBe true
      }

    }

    "leases" - {

      "can add image lease" in {
        val id = UUID.randomUUID().toString
        val timeBeforeEdit = DateTime.now.minusMinutes(1)
        val image = createImageForSyndication(
          id,
          true,
          Some(DateTime.now()),
          None,
          leasesLastModified = Some(timeBeforeEdit))
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)
        reloadedImage(id).get.leases.leases.isEmpty shouldBe true

        val lease = model.leases.MediaLease(
          id = Some(UUID.randomUUID().toString),
          leasedBy = None,
          notes = Some("A test lease"),
          mediaId = UUID.randomUUID().toString
        )

        Await.result(Future.sequence(ES.addImageLease(id, JsDefined(Json.toJson(lease)), asJsLookup(DateTime.now))), fiveSeconds)

        val newLeases = reloadedImage(id).get.leases
        newLeases.leases.nonEmpty shouldBe true
        newLeases.leases.head.id shouldBe lease.id
        newLeases.lastModified.get.isAfter(timeBeforeEdit) shouldBe true
      }

      "can remove image lease" in {
        val lease = model.leases.MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("A test lease"), mediaId = UUID.randomUUID().toString)
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id, true, Some(DateTime.now()), lease = Some(lease))
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)
        reloadedImage(id).get.leases.leases.nonEmpty shouldBe true

        Await.result(Future.sequence(ES.removeImageLease(id, JsDefined(Json.toJson(lease.id)), asJsLookup(DateTime.now))), fiveSeconds)

        reloadedImage(id).get.leases.leases.isEmpty shouldBe true
      }

      "removing a lease should update the leases last modified time" in {
        val lease = model.leases.MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("A test lease"), mediaId = UUID.randomUUID().toString)
        val timeBeforeEdit = DateTime.now
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(
          id = UUID.randomUUID().toString,

          true,
          Some(DateTime.now()),
          lease = Some(lease)
        )
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)
        reloadedImage(id).get.leases.leases.nonEmpty shouldBe true

        Await.result(Future.sequence(ES.removeImageLease(id, JsDefined(Json.toJson(lease.id)), asJsLookup(timeBeforeEdit))), fiveSeconds)

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
          Some(DateTime.now()),
          lease = Some(lease),
          leasesLastModified = Some(timeBeforeEdit)
        )
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)

        val updatedLease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("An updated lease"), mediaId = UUID.randomUUID().toString)
        val anotherUpdatedLease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("Another updated lease"), mediaId = UUID.randomUUID().toString)
        val updatedLeases = Seq(updatedLease, anotherUpdatedLease)
        updatedLeases.size shouldBe 2

        Await.result(Future.sequence(ES.replaceImageLeases(id, updatedLeases)), fiveSeconds)

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
          Some(DateTime.now()),
          lease = None,
          leasesLastModified = Some(timeBeforeEdit)
        ).copy(leases = LeasesByMedia.empty)
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)

        val updatedLease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("An updated lease"), mediaId = UUID.randomUUID().toString)
        val anotherUpdatedLease = MediaLease(id = Some(UUID.randomUUID().toString), leasedBy = None, notes = Some("Another updated lease"), mediaId = UUID.randomUUID().toString)
        val updatedLeases = Seq(updatedLease, anotherUpdatedLease)
        updatedLeases.size shouldBe 2

        Await.result(Future.sequence(ES.replaceImageLeases(id, updatedLeases)), fiveSeconds)

        val newLeases = reloadedImage(id).get.leases
        newLeases.leases.size shouldBe 2
        newLeases.leases.head.notes shouldBe Some("An updated lease")
        newLeases.lastModified.get.isAfter(timeBeforeEdit) shouldBe true
      }
    }

    "usages" - {

      "can delete all usages for an image" in {
        val id = UUID.randomUUID().toString
        val imageWithUsages = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None).copy(usages = List(usage()))
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(imageWithUsages))), fiveSeconds)

        Await.result(Future.sequence(ES.deleteAllImageUsages(id)), fiveSeconds)

        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).get.usages.isEmpty shouldBe true)
      }

      "can update usages" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)

        Await.result(Future.sequence(ES.updateImageUsages(id, List(usage()), asJsLookup(DateTime.now))), fiveSeconds)

        reloadedImage(id).get.usages.size shouldBe 1
      }

      "can update usages if the modification date of the update is new than the existing one" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)

        val existingUsage = usage(id = "existing")
        Await.result(Future.sequence(ES.updateImageUsages(id, List(existingUsage), asJsLookup(DateTime.now))), fiveSeconds)
        reloadedImage(id).get.usages.head.id shouldEqual ("existing")

        val moreRecentUsage = usage(id = "most-recent")
        Await.result(Future.sequence(ES.updateImageUsages(id, List(moreRecentUsage), asJsLookup(DateTime.now))), fiveSeconds)

        reloadedImage(id).get.usages.size shouldBe 1
        reloadedImage(id).get.usages.head.id shouldEqual ("most-recent")
      }

      "should ignore usage update requests when the proposed last modified date is older than the current" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
        Await.result(Future.sequence(ES.indexImage(id, Json.toJson(image))), fiveSeconds)

        val mostRecentUsage = usage(id = "recent")
        Await.result(Future.sequence(ES.updateImageUsages(id, List(mostRecentUsage), asJsLookup(DateTime.now))), fiveSeconds)

        val staleUsage = usage(id = "stale")
        val staleLastModified = DateTime.now.minusWeeks(1)
        Await.result(Future.sequence(ES.updateImageUsages(id, List(staleUsage), asJsLookup(staleLastModified))), fiveSeconds)

        reloadedImage(id).get.usages.head.id shouldEqual ("recent")
      }
    }

    "syndication rights" - {
      "updated syndication rights should be persisted" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
        ES.indexImage(id, Json.toJson(image))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

        val newSyndicationRights = SyndicationRights(published = Some(DateTime.now()), suppliers = Seq.empty, rights = Seq.empty)

        Await.result(Future.sequence(ES.updateImageSyndicationRights(id, Some(newSyndicationRights))), fiveSeconds)

        reloadedImage(id).flatMap(_.syndicationRights) shouldEqual Some(newSyndicationRights)
      }

      "updating syndication rights should update last modified date" in {
        val id = UUID.randomUUID().toString
        val beforeUpdate = DateTime.now()
        val image = createImageForSyndication(
          id = UUID.randomUUID().toString,
          true,
          Some(DateTime.now()),
          None,
          leasesLastModified = Some(beforeUpdate)
        )
        ES.indexImage(id, Json.toJson(image))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

        val newSyndicationRights = SyndicationRights(published = Some(DateTime.now().minusWeeks(1)), suppliers = Seq.empty, rights = Seq.empty)

        Await.result(Future.sequence(ES.updateImageSyndicationRights(id, Some(newSyndicationRights))), fiveSeconds)

        reloadedImage(id).get.lastModified.get.isAfter(beforeUpdate) shouldEqual true
      }

      "can delete syndication rights" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)
        ES.indexImage(id, Json.toJson(image))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))
        reloadedImage(id).get.syndicationRights.nonEmpty shouldBe true

        Await.result(Future.sequence(ES.deleteSyndicationRights(id)), fiveSeconds)

        reloadedImage(id).get.syndicationRights.isEmpty shouldBe true
      }
    }

    "user metadata" - {
      "can update user metadata for an existing image" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)

        ES.indexImage(id, Json.toJson(imageWithBoringMetadata))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val updatedMetadata = Some(Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("An interesting image"))))
        val updatedLastModifiedDate = DateTime.now

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            JsDefined(Json.toJson(updatedMetadata)),
            asJsLookup(updatedLastModifiedDate))),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadata.get.metadata.description) shouldBe Some("An interesting image")
      }

      "updating user metadata should update the image and user meta data last modified dates" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)

        ES.indexImage(id, Json.toJson(imageWithBoringMetadata))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val updatedMetadata = Some(Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("An updated image"))))
        val updatedLastModifiedDate = DateTime.now.withZone(DateTimeZone.UTC)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            JsDefined(Json.toJson(updatedMetadata)),
            asJsLookup(updatedLastModifiedDate))),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadataLastModified) shouldEqual Some(updatedLastModifiedDate)
        reloadedImage(id).flatMap(_.lastModified) shouldEqual Some(updatedLastModifiedDate)
      }

      "original metadata is unchanged by a user metadata edit" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)

        ES.indexImage(id, Json.toJson(imageWithBoringMetadata))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val updatedMetadata = Some(Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("An interesting image"))))
        val updatedLastModifiedDate = DateTime.now

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            JsDefined(Json.toJson(updatedMetadata)),
            asJsLookup(updatedLastModifiedDate))),
          fiveSeconds)

        reloadedImage(id).map(_.originalMetadata) shouldEqual Some(imageWithBoringMetadata.originalMetadata)
      }

      "should apply metadata update if user metadata is set but before new modified date" in {
        val id = UUID.randomUUID().toString
        val image = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)

        ES.indexImage(id, Json.toJson(image))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(image.id))

        val userMetadata = ImageMetadata(description = Some("An updated image"), subjects = List("sausages"))
        val updatedLastModifiedDate = DateTime.now.withZone(DateTimeZone.UTC)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            JsDefined(Json.toJson(Some(Edits(labels = List("foo"), metadata = userMetadata)))),
            asJsLookup(updatedLastModifiedDate))),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadataLastModified) shouldEqual Some(updatedLastModifiedDate)
        reloadedImage(id).get.userMetadata.get.metadata.subjects shouldEqual List("sausages")
        reloadedImage(id).get.userMetadata.get.labels shouldEqual List("foo")

        val furtherUpdatedMetadata = userMetadata.copy(description = Some("A further updated image"), subjects = List("sausages", "chips"))

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            JsDefined(Json.toJson(Some(Edits(labels = List("foo", "bar"), metadata = furtherUpdatedMetadata)))),
            asJsLookup(updatedLastModifiedDate.plusSeconds(1)))),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadata.get.metadata.description) shouldEqual Some("A further updated image")
        reloadedImage(id).get.userMetadata.get.metadata.subjects shouldEqual List("sausages", "chips")
        reloadedImage(id).get.userMetadata.get.labels shouldEqual List("foo", "bar")
      }

      "should ignore update if the proposed modification date is older than the current user metadata last modified date" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)

        ES.indexImage(id, Json.toJson(imageWithBoringMetadata))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val latestMetadata = Some(Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("Latest edit"))))
        val latestLastModifiedDate = DateTime.now.withZone(DateTimeZone.UTC)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            JsDefined(Json.toJson(latestMetadata)),
            asJsLookup(latestLastModifiedDate))),
          fiveSeconds)

        val staleMetadata = Some(Edits(metadata = imageWithBoringMetadata.metadata.copy(description = Some("A stale edit"))))
        val staleLastModifiedDate = latestLastModifiedDate.minusSeconds(1)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            JsDefined(Json.toJson(staleMetadata)),
            asJsLookup(staleLastModifiedDate))),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadata.get.metadata.description) shouldBe Some("Latest edit")
        reloadedImage(id).flatMap(_.userMetadataLastModified) shouldEqual Some(latestLastModifiedDate)
      }

      "updating user metadata with new usage rights should update usage rights" in {
        val id = UUID.randomUUID().toString
        val imageWithUsageRights = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)

        ES.indexImage(id, Json.toJson(imageWithUsageRights))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithUsageRights.id))

        val newPhotographer = StaffPhotographer(photographer = "Test Photographer", publication = "Testing")

        val metadataWithUpdatedUsageRights = Some(Edits(usageRights = Some(newPhotographer), metadata = imageWithUsageRights.metadata))

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            JsDefined(Json.toJson(metadataWithUpdatedUsageRights)),
            asJsLookup(DateTime.now.withZone(DateTimeZone.UTC)))),
          fiveSeconds)

        reloadedImage(id).get.usageRights.asInstanceOf[StaffPhotographer].photographer shouldEqual "Test Photographer"
      }

      "updating user metadata should update photoshoot suggestions" in {
        val id = UUID.randomUUID().toString
        val imageWithBoringMetadata = createImageForSyndication(id = UUID.randomUUID().toString, true, Some(DateTime.now()), None)

        ES.indexImage(id, Json.toJson(imageWithBoringMetadata))
        eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(imageWithBoringMetadata.id))

        val newPhotoshoot = Photoshoot("Test photoshoot")

        val updatedMetadata = Some(Edits(photoshoot = Some(newPhotoshoot), metadata = imageWithBoringMetadata.metadata.copy()))
        val updatedLastModifiedDate = DateTime.now.withZone(DateTimeZone.UTC)

        Await.result(Future.sequence(
          ES.applyImageMetadataOverride(id,
            JsDefined(Json.toJson(updatedMetadata)),
            asJsLookup(updatedLastModifiedDate))),
          fiveSeconds)

        reloadedImage(id).flatMap(_.userMetadata.get.photoshoot.map(_.title)) shouldEqual Some("Test photoshoot")
        // TODO how to assert that the suggestion was added?
      }
    }
  }


}
