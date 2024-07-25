package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import org.scanamo._
import org.scanamo.error.DynamoReadError
import org.scanamo.query.{AndCondition, AttributeExists, Condition, ConditionExpression, KeyEquals}
import org.scanamo.syntax._
import model.StatusType.{Prepared, Queued}
import model.{UploadStatus, UploadStatusRecord}
import software.amazon.awssdk.services.dynamodb.{DynamoDbAsyncClient, DynamoDbAsyncClientBuilder}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class UploadStatusTable(config: ImageLoaderConfig) {

  val client = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  val scanamo = ScanamoAsync(client)
  private val uploadStatusTable = Table[UploadStatusRecord](config.uploadStatusTable)

  def getStatus(imageId: String) = {
    ScanamoAsync(client)(uploadStatusTable.get('id -> imageId))
  }

  def setStatus(uploadStatus: UploadStatusRecord) = {
    scanamo.exec(uploadStatusTable.put(uploadStatus))
  }

  def updateStatus(imageId: String, updateRequest: UploadStatus) = {
    val updateExpression = updateRequest.errorMessage match {
      case Some(error) => set("status", updateRequest.status) and set("errorMessages", error)
      case None => set("status", updateRequest.status)
    }
    val uploadStatusTableWithCondition =
      if(updateRequest.status == Queued) // can only transition to Queued status from Prepared status
        uploadStatusTable.when(attributeExists("id") and ("status" === Prepared.toString))
      else
        uploadStatusTable.when(attributeExists("id"))

    scanamo.exec(
      uploadStatusTableWithCondition
        .update(
          key = "id" === imageId,
          update = updateExpression
        )
    )
  }

  def queryByUser(user: String): Future[List[UploadStatusRecord]] = {
    scanamo.exec(uploadStatusTable.scan()).map {
      case Nil => List.empty[UploadStatusRecord]
      case recordsAndErrors => {
        recordsAndErrors
          .filter(item => item.isRight)
          .map(item => item.getOrElse(null))
          .filter(item => item.uploadedBy == user)
      }
    }
  }
}
