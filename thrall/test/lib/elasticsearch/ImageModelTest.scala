package lib.elasticsearch

import com.gu.mediaservice.lib.elasticsearch.MappingTest
import com.gu.mediaservice.lib.logging.{LogMarker, MarkerMap}

import scala.collection.TraversableLike
import scala.concurrent.{Await, Future}

class ImageModelTest extends ElasticSearchTestBase {
  implicit val logMarker: LogMarker = MarkerMap()
  "the image model matches the mapping" - {
    "the testImage is fully populated (doesn't have any fields that are empty)" in {
      /* This test is an important prelude to the serialisation check. Here we ensure that the
       * test Image is fully populated with no None values or empty collections. This is to
       * ensure that we test all corners of the data model when we serialise into elasticsearch.
       * If this fails then it indicates that a field in the Image model does not contain a value.
       * This should be fixed by adding appropriate values in MappingTest.scala
       */

      /* recurse through a typical scala structure */
      def check(maybeProduct: Any): List[Either[String, Any]] = {
        maybeProduct match {
          case None =>
            List(Left("Empty Option"))
          case collection: TraversableLike[_, _] if collection.isEmpty =>
            // this should pick up most collections including List, Map, Set, Seq etc.
            List(Left(s"Empty ${collection.getClass.getName}"))
          case string: String =>
            List(scala.util.Right(string))
          case list: TraversableLike[_, _] =>
            list.toList.flatMap(check)
          case product: Product => product.productIterator.flatMap(check).toList
          case other =>
            List(scala.util.Right(other))
        }
      }

      val results = check(MappingTest.testImage)
      if (results.exists(_.isLeft)) {
        results.foreach{
          case Left(msg) => System.err.println(s"❌ $msg")
          case scala.util.Right(value) => System.err.println(s"✅ $value")
        }
      }

      results.count(_.isLeft) shouldBe 0
    }
    "can insert a fully populated image into elasticsearch" in {
      /* This test ensures that a fully populated image can be successfully inserted into
       * ElasticSearch with the mappings in Mappings.scala. If this fails then it indicates
       * that the currently defined mappings are wrong and should be corrected.
       */
      val image = MappingTest.testImage

      Await.result(Future.sequence(ES.migrationAwareIndexImage(image.id, image, image.lastModified.get)), fiveSeconds)
      eventually(timeout(fiveSeconds), interval(oneHundredMilliseconds))(reloadedImage(image.id).map(_.id) shouldBe Some(image.id))

      val retrievedImage = reloadedImage(image.id).get
      /* note that we compare the toString method here as the Joda serialisation/deserialisation ends up with
       * equivalent but not equal/== dates due to different ways of internally expressing the chronology
       * see https://stackoverflow.com/questions/21002385/datetime-does-not-equal-itself-after-unserialization */
      retrievedImage.toString shouldBe image.toString
    }
  }
}
