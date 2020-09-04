package com.gu.mediaservice

import com.typesafe.scalalogging.LazyLogging

import scala.concurrent.Await
import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.duration.Duration

object ResetImageBatchIndexTable extends App with LazyLogging {

  if (args.isEmpty) throw new IllegalArgumentException("please provide dynamo table name")

  private val dynamoTable = args(0)
  private val ddbClient = AwsHelpers.buildDynamoTableClient(dynamoTable)

  def execute(batchSize: Int) = {
    val InputIdsStore = new InputIdsStore(ddbClient, batchSize)
    val mediaIdsFuture = InputIdsStore.getProcessedMediaIdsBatch
    val mediaIds = Await.result(mediaIdsFuture, Duration.Inf)
    logger.info(s"got ${mediaIds.size}, processed mediaIds")
    InputIdsStore.resetItemsState(mediaIds)
  }

  execute(10000)

}
