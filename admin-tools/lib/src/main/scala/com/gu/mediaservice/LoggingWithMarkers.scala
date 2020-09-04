package com.gu.mediaservice

import com.gu.mediaservice.indexing.ProduceProgress
import com.typesafe.scalalogging.LazyLogging
import play.api.libs.json.Json

trait LoggingWithMarkers extends LazyLogging {

  protected def logSuccessResult(successResult: SuccessResult): Unit = {
    import successResult._
    val message = s"batch index records preparation was successful: $progressHistory"

    val jsonMsg = Json.obj(
      "foundImagesCount" -> foundImagesCount,
      "notFoundImagesCount" -> notFoundImagesCount,
      "progressHistory" -> progressHistory,
      "projectionTookInSec" -> projectionTookInSec,
      "message" -> message
    )

    logger.info(jsonMsg.toString())
  }

  protected def logFailure(exp: Throwable, resetIdsCount: Int, progressHistory: List[ProduceProgress]): Unit = {
    val message = s"there was a failure, exception: ${exp.getMessage}"

    val jsonMsg = Json.obj(
      "exception" -> exp.getMessage,
      "resetIdsCount" -> resetIdsCount,
      "progressHistory" -> progressHistory.map(_.name).mkString(","),
      "message" -> message
    )

    logger.error(jsonMsg.toString())
  }

}
