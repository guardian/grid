package com.gu.mediaservice.lib.metadata

import com.amazonaws.services.dynamodbv2.model.BatchWriteItemResult
import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model.ImageStatusRecord
import com.gu.scanamo._
import com.gu.scanamo.syntax._

import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.collectionAsScalaIterableConverter

class SoftDeletedMetadataTable(config: CommonConfig) extends DynamoDB[ImageStatusRecord](config, config.softDeletedMetadataTable) {
  private val softDeletedMetadataTable = Table[ImageStatusRecord](table.getTableName)

  def getStatus(imageId: String)(implicit ex: ExecutionContext) = {
    ScanamoAsync.exec(client)(softDeletedMetadataTable.get('id -> imageId))
  }

  def setStatus(imageStatus: ImageStatusRecord)(implicit ex: ExecutionContext) = {
    ScanamoAsync.exec(client)(softDeletedMetadataTable.put(imageStatus))
  }

  private def extractUnprocessedIds(results: List[BatchWriteItemResult]): List[String] =
    results.flatMap(_.getUnprocessedItems.values().asScala.flatMap(_.asScala.map(_.getPutRequest.getItem.get("id").getS)))

  def setStatuses(imageStatuses: Set[ImageStatusRecord])(implicit ex: ExecutionContext) = {
    if (imageStatuses.isEmpty) Future.successful(List.empty)
    else ScanamoAsync.exec(client)(softDeletedMetadataTable.putAll(imageStatuses)).map(extractUnprocessedIds)
  }

  def clearStatuses(imageIds: Set[String])(implicit ex: ExecutionContext) = {
    if (imageIds.isEmpty) Future.successful(List.empty)
    else ScanamoAsync.exec(client)(softDeletedMetadataTable.deleteAll('id -> imageIds)).map(extractUnprocessedIds)
  }

  def updateStatus(imageId: String, isDeleted: Boolean)(implicit ex: ExecutionContext) = {
    val updateExpression = set('isDeleted -> isDeleted)
    ScanamoAsync.exec(client)(
      softDeletedMetadataTable
        .given(attributeExists('id))
        .update(
          'id -> imageId,
          update = updateExpression
        )
    )
  }
}
