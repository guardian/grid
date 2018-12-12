package lib

import java.util.UUID

import helpers.Fixtures
import org.joda.time.DateTime
import org.scalatest.concurrent.Eventually
import org.scalatest.{BeforeAndAfterAll, FreeSpec, Matchers}
import play.api.Configuration
import play.api.libs.json.Json

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global

import scala.concurrent.duration._

class ElasticSearch6Test extends FreeSpec with Matchers with Fixtures with BeforeAndAfterAll with Eventually {

  val thrallConfig = new ThrallConfig(Configuration.from(Map(
    "es.cluster" -> "media-service-test",
    "es.port" -> "9206",
    "es.index.aliases.write" -> "writeAlias"
  )))

  val thrallMetrics = new ThrallMetrics(thrallConfig)

  val ES = new ElasticSearch6(thrallConfig, thrallMetrics)

  val oneHundredMilliseconds = Duration(100, MILLISECONDS)
  val fiveSeconds = Duration(5, SECONDS)

  "Elasticsearch" - {
    "can index and retrieve images by id" in {
      val id = UUID.randomUUID().toString
      val image = createImageForSyndication(UUID.randomUUID().toString, true, Some(DateTime.now()), None)

      ES.indexImage(id, Json.toJson(image))

      def reloadedImage = Await.result(ES.getImage(id), fiveSeconds)
      eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage.map(_.id) shouldBe Some(image.id))
    }
  }

}
