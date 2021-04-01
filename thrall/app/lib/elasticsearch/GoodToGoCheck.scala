package lib.elasticsearch

import com.amazonaws.util.EC2MetadataUtils
import com.gu.mediaservice.lib.elasticsearch.MappingTest
import com.gu.mediaservice.lib.logging.LogMarker
import com.sksamuel.elastic4s.Response
import com.sksamuel.elastic4s.requests.delete.DeleteResponse
import com.typesafe.scalalogging.StrictLogging

import scala.concurrent.{ExecutionContext, Future}

/**
  * This implements a good to go check that validates when Thrall starts up that it can successfully write and read
  * and image into the elasticsearch node.
  */
object GoodToGoCheck extends StrictLogging {
  def run(es: ElasticSearch)(implicit ex: ExecutionContext): Future[Unit] = {
    // make a test image with an ID that is unique to the node so that multiple nodes can run the check at once
    val uniqueId = Option(EC2MetadataUtils.getInstanceId).map(_.stripPrefix("i-")).getOrElse("abcdef")
    val image = MappingTest.testImage.copy(id = s"${MappingTest.testImage.id}$uniqueId")
    val lastModified = image.lastModified.get
    implicit val marker: LogMarker = image ++ Map("goToGo" -> true)

    val indexResult: Future[Unit] =
      for {
        // perhaps a test image wasn't previously cleaned up, let's err on the side of caution and check and deal with it
        _ <- Future.successful(logger.info(s"Ensuring test image ${image.id} doesn't exist"))
        checkAbsent <- es.getImage(image.id)
        _ <- Future.successful(if (checkAbsent.nonEmpty) logger.info("Deleting prior test image"))
        _ <- if (checkAbsent.nonEmpty) deleteTestImage(es, image.id) else Future.successful(())
        // now index and retrieve the test image
        _ <- Future.successful(logger.info(s"Indexing test image ${image.id}"))
        indexResult <- Future.sequence(es.indexImage(image.id, image, lastModified))
        _ <- Future.successful(logger.info(s"Retrieving test image ${image.id}"))
        maybeRetrieveResult <- es.getImage(image.id)
        _ <- Future.successful(logger.info(s"Validating test image"))
        validation <- {
          // check that we indexed one object
          val indexedOneItem = indexResult.size == 1
          // and retrieving it is the same object - note: we use a string check here as the DateTimes don't compare usefully
          val retrievedImageSameAsIndexed = maybeRetrieveResult.toString == Some(image).toString

          if (indexedOneItem && retrievedImageSameAsIndexed) {
            Future.successful(())
          } else {
            Future.failed(new IllegalStateException(s"Failed to validate insertion [Indexed ${indexResult.size} (one item check: $indexedOneItem); retrieved image matches indexed image: $retrievedImageSameAsIndexed]"))
          }
        }
        // once that's all done, let's delete the image again so it's not lying around
        _ <- Future.successful(logger.info(s"Deleting test image"))
        _ <- deleteTestImage(es, image.id)
      } yield validation

    // return the future for the healthcheck
    indexResult
  }

  def deleteTestImage(es: ElasticSearch, imageId: String)(implicit ex: ExecutionContext, lm: LogMarker): Future[Response[DeleteResponse]] = {
    import com.sksamuel.elastic4s.ElasticDsl._
    // this manipulates the underlying ES API as the built in delete API guards against deleting images that are in use
    es.executeAndLog(deleteById(es.imagesAlias, imageId), s"Deleting good to go test image $imageId")
  }
}
