package com.gu.mediaservice

import com.typesafe.scalalogging.LazyLogging

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.Duration

object ResetImageBatchIndexTable extends App with LazyLogging {

  private val dynamoTable = args(0)
  private val ddbClient = BatchIndexHandlerAwsFunctions.buildDynamoTableClient(dynamoTable)

  def execute(batchSize: Int) = {
    val InputIdsStore = new InputIdsStore(ddbClient, batchSize)
    val mediaIdsFuture = InputIdsStore.getProcessedMediaIdsBatch
    val mediaIds = Await.result(mediaIdsFuture, Duration.Inf)
    logger.info(s"got ${mediaIds.size}, unprocessed mediaIds, $mediaIds")
    InputIdsStore.resetItemsState(mediaIds)
  }

  execute(1000)

}
