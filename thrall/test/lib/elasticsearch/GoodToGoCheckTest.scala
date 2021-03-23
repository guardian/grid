package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.MappingTest
import com.gu.mediaservice.lib.logging.LogMarker
import com.sksamuel.elastic4s.requests.count.CountResponse
import com.sksamuel.elastic4s.ElasticDsl._
import com.sksamuel.elastic4s.Response
import org.joda.time.{DateTime, Period}

import scala.concurrent.Future

class GoodToGoCheckTest extends ElasticSearchTestBase {
  implicit val lm: LogMarker = new LogMarker{
    override def markerContents: Map[String, Any] = Map.empty
  }

  "GoodToGoCheck" - {
    "the good to go check passes when run against docker" in {
      GoodToGoCheck.run(ES).futureValue
    }
    "deleteOldTestImages" - {
      val now = new DateTime(2021, 3, 3, 3, 0)
      val old = now.minus(Period.minutes(15))
      val testIds = List("first", "second", "third")
      "should delete old test images" in {
        // insert a few 'old' test images
        Future.sequence(testIds.flatMap { id =>
          ES.indexImage(id, MappingTest.testImage.copy(id = id), old)
        }).futureValue

        // wait for them to appear in ES
        testIds.foreach { id =>
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe Some(id))
        }

        eventually {
          ES.client.execute(count(ES.initialImagesIndex))
            .futureValue.result.count shouldBe 3
        }

        // now delete them
        GoodToGoCheck.deleteOldTestImages(ES, now).futureValue shouldBe 3

        // wait for them to disappear from ES
        testIds.foreach { id =>
          eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(id).map(_.id) shouldBe None)
        }
      }

      "should not delete recent test images" in {
        val notVeryOld = now.minus(Period.minutes(5))
        // insert one normal and a few others with an alternative uploader
        val eventualInserts: List[Future[ElasticSearchUpdateResponse]] =
          ES.indexImage("test", MappingTest.testImage.copy(id = "test"), old) :::
          testIds.flatMap { id =>
            ES.indexImage(id, MappingTest.testImage.copy(id = id), notVeryOld)
          }
        Future.sequence(eventualInserts).futureValue
        // ensure they are all in ES
        eventually(reloadedImage("test").map(_.id) shouldBe Some("test"))
        testIds.foreach { id =>
          eventually(reloadedImage(id).map(_.id) shouldBe Some(id))
        }
        eventually {
          ES.client.execute(count(ES.initialImagesIndex))
            .futureValue.result.count shouldBe 4
        }

        // now run a delete old test images to show that our images remain
        GoodToGoCheck.deleteOldTestImages(ES, now).futureValue shouldBe 1
        // ensure the test image is gone
        eventually(reloadedImage("test").map(_.id) shouldBe None)
        // ensure the other images still exist
        testIds.foreach { id =>
          reloadedImage(id).map(_.id) shouldBe Some(id)
        }
      }

      "should not delete images without the defined test uploader" in {
        val eventualInserts: List[Future[ElasticSearchUpdateResponse]] =
          ES.indexImage("old", MappingTest.testImage.copy(id = "old"), old) :::
            testIds.flatMap { id =>
              ES.indexImage(id, MappingTest.testImage.copy(id = id, uploadedBy = "joe-bloggs"), old)
            }
        val eventualResponses = Future.sequence(eventualInserts).futureValue
        eventually(reloadedImage("old").map(_.id) shouldBe Some("old"))
        testIds.foreach { id =>
          eventually(reloadedImage(id).map(_.id) shouldBe Some(id))
        }
        eventually {
          ES.client.execute(count(ES.initialImagesIndex))
            .futureValue.result.count shouldBe 4
        }

        // now run a delete old test images to show that our normal images remain
        GoodToGoCheck.deleteOldTestImages(ES, now).futureValue shouldBe 1
        // now check that the test image has gone
        eventually(reloadedImage("old").map(_.id) shouldBe None)
        // confirm that our other images are still present
        testIds.foreach { id =>
          reloadedImage(id).map(_.id) shouldBe Some(id)
        }
      }
    }
  }
}