package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import com.gu.scanamo._
import com.gu.scanamo.error.DynamoReadError
import com.gu.scanamo.query.{AndCondition, AttributeExists, Condition, ConditionExpression, KeyEquals, Query}
import com.gu.scanamo.syntax._
import model.StatusType.{Prepared, Queued}
import model.{UploadStatus, UploadStatusRecord}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class UploadStatusTable(config: ImageLoaderConfig) extends DynamoDB(config, config.uploadStatusTable) {

  private val uploadStatusTable = Table[UploadStatusRecord](config.uploadStatusTable)

  def getStatus(imageId: String) = {
    ScanamoAsync.exec(client)(uploadStatusTable.get('id -> imageId))
  }

  def queryByUser(user: String):Future[List[UploadStatusRecord]] = {
     ScanamoAsync.exec(client)(uploadStatusTable.scan()).map {
      case Nil => List.empty[UploadStatusRecord]
      case recordsAndErrors => {
        recordsAndErrors
          .filter(item => item.isRight)
          .map(item => item.getOrElse(null))
          .filter(item => item.uploadedBy == user)
      }
    }
  }

  def setStatus(uploadStatus: UploadStatusRecord) = {
    ScanamoAsync.exec(client)(uploadStatusTable.put(uploadStatus))
  }

  def updateStatus(imageId: String, updateRequest: UploadStatus) = {
    val updateExpression = updateRequest.errorMessage match {
      case Some(error) => set('status -> updateRequest.status) and set('errorMessages -> error)
      case None => set('status -> updateRequest.status)
    }
    val uploadStatusTableWithCondition =
      if(updateRequest.status == Queued) // can only transition to Queued status from Prepared status
        uploadStatusTable.given(attributeExists('id) and ('status -> Prepared.toString))
      else
        uploadStatusTable.given(attributeExists('id))

    ScanamoAsync.exec(client)(
      uploadStatusTableWithCondition
        .update(
          'id -> imageId,
          update = updateExpression
        )
    )
  }
}
