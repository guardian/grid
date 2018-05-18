package lib

import java.net.URI
import java.util.UUID

import com.gu.mediaservice.model._
import com.gu.mediaservice.syntax._
import lib.elasticsearch.{ElasticSearch, SearchFilters, filters}
import org.joda.time.DateTime
import play.api.Configuration
import play.api.libs.json._

import scala.concurrent.ExecutionContext.Implicits.global

trait ElasticSearchHelper {
  private val mediaApiConfig = new MediaApiConfig(Configuration.from(Map("es.cluster" -> "media-service", "es.port" -> "9300")))
  private val mediaApiMetrics = new MediaApiMetrics(mediaApiConfig)
  private val searchFilters = new SearchFilters(mediaApiConfig)
  val ES = new ElasticSearch(mediaApiConfig, searchFilters, mediaApiMetrics)

  val testUser = "yellow-giraffe@theguardian.com"

  def createImage(usageRights: UsageRights) = {
    val id = UUID.randomUUID().toString
    Image(
      id = id,
      uploadTime = DateTime.now(),
      uploadedBy = testUser,
      lastModified = None,
      identifiers = Map.empty,
      uploadInfo = UploadInfo(filename = Some(s"test_$id.jpeg")),
      source = Asset(
        file = new URI(s"http://file/$id"),
        size = Some(292265L),
        mimeType = Some("image/jpeg"),
        dimensions = Some(Dimensions(width = 2800, height = 1600)),
        secureUrl = None),
      thumbnail = Some(Asset(
        file = new URI(s"http://file/thumbnail/$id"),
        size = Some(292265L),
        mimeType = Some("image/jpeg"),
        dimensions = Some(Dimensions(width = 800, height = 100)),
        secureUrl = None)),
      optimisedPng = None,
      fileMetadata = FileMetadata(),
      userMetadata = None,
      metadata = ImageMetadata(dateTaken = None, title = Some(s"Test image $id"), keywords = List("test", "es")),
      originalMetadata = ImageMetadata(),
      usageRights = usageRights,
      originalUsageRights = usageRights,
      exports = Nil
    )
  }

  def saveToES(image: Image) = {
    val json = Json.toJson(image)
    ES.client
      .prepareIndex("images", "image", image.id)
      .setSource(json.toString())
      .executeAndLog(s"Saving test image with id ${image.id}")
  }

  def cleanTestUserImages() = {
    ES.prepareImagesSearch
      .setPostFilter(filters.term("uploadedBy", testUser))
      .executeAndLog("Querying images to delete")
      .map(_.getHits)
      .map { results =>
        println(s"Found ${results.getTotalHits} images to delete")
        results.hits.toList.foreach { hit =>
          val idToDelete = hit.getId
          ES.client.prepareDelete("images", "image", idToDelete).executeAndLog(s"Deleting image with id: $idToDelete")
        }
      }
  }
}
