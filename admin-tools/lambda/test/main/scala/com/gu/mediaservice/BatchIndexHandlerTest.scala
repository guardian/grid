package com.gu.mediaservice

import org.scalatest.{FlatSpec, FunSuite, Matchers}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class BatchIndexHandlerTest extends FlatSpec with Matchers {

  it should "partition maybeBlobsFuture into images entries that were successfully projected to ids of images that were not found" in {

    val maybeBlobsFutureIn: Future[List[ImageIdMaybeBlobEntry]] = Future {
      List(
        ImageIdMaybeBlobEntry("1", None),
        ImageIdMaybeBlobEntry("2", Some("{}")),
        ImageIdMaybeBlobEntry("3", None),
        ImageIdMaybeBlobEntry("4", Some("{}"))
      )
    }

    val (actualSuccess, actualNotFound) = BatchIndexHandler.partitionToSuccessAndNotFound(maybeBlobsFutureIn)
    actualSuccess should contain theSameElementsAs List(ImageIdBlobEntry("2","{}"), ImageIdBlobEntry("4","{}"))
    actualNotFound should contain theSameElementsAs List("1", "3")
  }

}
