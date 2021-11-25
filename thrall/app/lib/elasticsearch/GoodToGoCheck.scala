package lib.elasticsearch

import com.amazonaws.util.EC2MetadataUtils
import com.gu.mediaservice.lib.elasticsearch.MappingTest
import com.gu.mediaservice.lib.logging.LogMarker
import com.gu.mediaservice.model.Image
import com.sksamuel.elastic4s.Response
import com.sksamuel.elastic4s.requests.delete.{DeleteByQueryResponse, DeleteResponse}
import com.typesafe.scalalogging.StrictLogging
import org.joda.time.{DateTime, Period}

import scala.collection.{GenIterable, GenIterableLike, IterableLike, TraversableLike}
import scala.concurrent.{ExecutionContext, Future}
import scala.util.Success

/**
  * This implements a good to go check that validates when Thrall starts up that it can successfully write and read
  * an image into the elasticsearch node.
  */
object GoodToGoCheck extends StrictLogging {
  def run(es: ElasticSearch)(implicit ex: ExecutionContext): Future[Unit] = {
    // make a test image with an ID that is unique to the node so that multiple nodes can run the check at once
    val uniqueId = Option(EC2MetadataUtils.getInstanceId).map(_.stripPrefix("i-")).getOrElse("abcdef")
    val checkTime = DateTime.now
    val image: Image = MappingTest.testImage.copy(
      id = s"${MappingTest.testImage.id}$uniqueId",
      lastModified = Some(checkTime) // use now as the last modified to aid cleanup of old test images
    )
    val lastModified = image.lastModified.get
    implicit val marker: LogMarker = image ++ Map("goToGo" -> true)

    val indexResult: Future[Unit] =
      for {
        // Perhaps a test image wasn't previously cleaned up... this might happen locally or if a thrall process
        // is being cycled by systemd on an instance. Let's err on the side of caution and check and deal with it.
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
          // and retrieving it is the same object - note: we use a string check here as the DateTimes don't compare
          // usefully and we override the lastModified to avoid TZ issues in BST
          val retrievedImageSameAsIndexed =
            approximatelyEqual(maybeRetrieveResult, Some(image))
          if (!retrievedImageSameAsIndexed) logger.warn(s"Image mismatch: \n$maybeRetrieveResult\n${Some(image)}")

          if (indexedOneItem && retrievedImageSameAsIndexed) {
            Future.successful(())
          } else {
            Future.failed(new IllegalStateException(s"Failed to validate insertion [Indexed ${indexResult.size} (one item check: $indexedOneItem); retrieved image matches indexed image: $retrievedImageSameAsIndexed]"))
          }
        }
        // once that's all done, let's delete the image again so it's not lying around
        _ <- Future.successful(logger.info(s"Deleting test image"))
        _ <- deleteTestImage(es, image.id)
        // clean up any images from over an hour ago that were not deleted
        cleanedUpCount <- deleteOldTestImages(es, checkTime)
        _ <- Future.successful(if (cleanedUpCount > 0) logger.info(s"Deleted $cleanedUpCount old test image(s)"))
      } yield validation

    // return the future for the healthcheck
    indexResult
  }

  def deleteTestImage(es: ElasticSearch, imageId: String)(implicit ex: ExecutionContext, lm: LogMarker): Future[Response[DeleteResponse]] = {
    import com.sksamuel.elastic4s.ElasticDsl._
    // this manipulates the underlying ES API as the built in delete API guards against deleting images that are in use
    es.executeAndLog(deleteById(es.imagesCurrentAlias, imageId), s"Deleting good to go test image $imageId")
  }

  def deleteOldTestImages(es: ElasticSearch, now: DateTime)(implicit ex: ExecutionContext, lm: LogMarker): Future[Long] = {
    import com.sksamuel.elastic4s.ElasticDsl._
    // only act on images from some time ago so we don't delete image
    val olderThan = now.minus(Period.minutes(10))
    val query = must(
      rangeQuery("lastModified").lte(olderThan.getMillis), // older than this
      termQuery("uploadedBy", MappingTest.testUploader) // and belonging to the uploader
    )
    // this manipulates the underlying ES API as the built in delete API guards against deleting images that are in use
    val eventualResult = es.executeAndLog(
      deleteByQuery(es.imagesCurrentAlias, query).copy(waitForCompletion = Some(true)),
      s"Deleting any old test images uploaded by ${MappingTest.testImage.uploadedBy}"
    )
    eventualResult.map(_.result match {
      case Left(deleteResponse) => deleteResponse.deleted
      // The Right (createdTask) response doesn't make sense - we have wait for completion enabled, but elastic4s forces us to still consider this case
      case Right(createdTask) => throw new IllegalArgumentException("Request to delete_by_query returned an asynchronous task, despite wait_for_completion requested")
    })
  }

  /** This function computes an approximate equality for some objects which is fuzzy when it comes to Joda DateTimes
    * and will say that two objects are equal even when they contain DateTimes within them that are the same point
    * in time but expressed in two different ways (i.e. two different time zones)
    * @param a The first object to compare
    * @param b A second object to compare
    * @return true if the objects are equal (aside from chronology/timezone in DateTimes)
    */
  def approximatelyEqual(a: Any, b: Any): Boolean = {
    (a, b) match {
      case (aTrav: GenIterable[_], bTrav: GenIterable[_]) =>
        aTrav.zip(bTrav)
          .forall { case (aVal, bVal) => approximatelyEqual(aVal, bVal) }
      case (aProduct: Product, bProduct: Product) =>
        aProduct.productIterator
          .zip(bProduct.productIterator)
          .forall { case (aVal, bVal) => approximatelyEqual(aVal, bVal) }
      case (aDateTime: DateTime, bDateTime: DateTime) => aDateTime.getMillis == bDateTime.getMillis
      case (aOther, bOther) => aOther == bOther
    }
  }
}
