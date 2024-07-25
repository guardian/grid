package com.gu.mediaservice.lib.metadata

import com.amazonaws.services.dynamodbv2.model.BatchWriteItemResult
import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model.ImageStatusRecord
import org.scanamo._
import org.scanamo.syntax._

import scala.concurrent.{ExecutionContext, Future}
import scala.jdk.CollectionConverters.collectionAsScalaIterableConverter

class SoftDeletedMetadataTable(config: CommonConfig) {
  val client = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()

  private val softDeletedMetadataTable = Table[ImageStatusRecord](config.softDeletedMetadataTable)

  def getStatus(imageId: String)(implicit ex: ExecutionContext) = {
    ScanamoAsync(client).exec(softDeletedMetadataTable.get("id" === imageId))
  }

  def setStatus(imageStatus: ImageStatusRecord)(implicit ex: ExecutionContext) = {
    ScanamoAsync(client).exec(softDeletedMetadataTable.put(imageStatus))
  }

  def setStatuses(imageStatuses: Set[ImageStatusRecord])(implicit ex: ExecutionContext): Future[Unit] = {
    if (imageStatuses.isEmpty) Future.successful(List.empty[String])
    else ScanamoAsync(client).exec(softDeletedMetadataTable.putAll(imageStatuses))
  }

  def clearStatuses(imageIds: Set[String])(implicit ex: ExecutionContext) = {
    if (imageIds.isEmpty) Future.successful(List.empty)
    else ScanamoAsync(client).exec(softDeletedMetadataTable.deleteAll("id" in imageIds))
  }

  def updateStatus(imageId: String, isDeleted: Boolean)(implicit ex: ExecutionContext) = {
    val updateExpression = set("isDeleted", isDeleted)
    ScanamoAsync(client).exec(
      softDeletedMetadataTable
        .when(attributeExists("id"))
        .update(
          key = "id" === imageId,
          update = updateExpression
        )
    )
  }
}
