package com.gu.mediaservice.lib.metadata

import com.gu.mediaservice.lib.config.CommonConfig
import com.gu.mediaservice.model.{ImageStatusRecord, Instance}
import org.scanamo._
import org.scanamo.syntax._
import org.scanamo.generic.auto._
import software.amazon.awssdk.services.dynamodb.DynamoDbAsyncClient

import scala.concurrent.{ExecutionContext, Future}

class SoftDeletedMetadataTable(config: CommonConfig) {
  val client = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()

  private val softDeletedMetadataTable = Table[ImageStatusRecord](config.softDeletedMetadataTable)

  def getStatus(imageId: String)(implicit ex: ExecutionContext, instance: Instance) = {
    ScanamoAsync(client).exec(softDeletedMetadataTable.get("id" === imageId and "instance" === instance.id))
  }

  def setStatus(imageStatus: ImageStatusRecord)(implicit ex: ExecutionContext) = {
    ScanamoAsync(client).exec(softDeletedMetadataTable.put(imageStatus))
  }

  def setStatuses(imageStatuses: Set[ImageStatusRecord])(implicit ex: ExecutionContext): Future[Unit] = {
    if (imageStatuses.isEmpty) Future.successful(List.empty[String])
    else ScanamoAsync(client).exec(softDeletedMetadataTable.putAll(imageStatuses))
  }

  def clearStatuses(imageIds: Set[String])(implicit ex: ExecutionContext, instance: Instance) = {
    if (imageIds.isEmpty) Future.successful(List.empty)
    else {
      Future.sequence(imageIds.map { id =>
        // Scanomo batch can't do composite keys? DSL is too confusing
        ScanamoAsync(client).exec(softDeletedMetadataTable.delete("id" === id and "instance" === instance.id))
      }).map(_ => List.empty)
    }  }

  def updateStatus(imageId: String, isDeleted: Boolean)(implicit ex: ExecutionContext, instance: Instance) = {
    val updateExpression = set("isDeleted", isDeleted)
    ScanamoAsync(client).exec(
      softDeletedMetadataTable
        .when(attributeExists("id"))
        .update(
          "id" === imageId and "instance" === instance.id,
          update = updateExpression
        )
    )
  }
}
