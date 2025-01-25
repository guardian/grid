package lib

import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.Instance
import org.scanamo._
import org.scanamo.syntax._
import org.scanamo.generic.auto._
import model.StatusType.{Prepared, Queued}
import model.{UploadStatus, UploadStatusRecord}
import software.amazon.awssdk.services.dynamodb.{DynamoDbAsyncClient, DynamoDbAsyncClientBuilder}

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

class UploadStatusTable(config: ImageLoaderConfig) extends GridLogging {

  val client = config.withAWSCredentialsV2(DynamoDbAsyncClient.builder()).build()
  val scanamo = ScanamoAsync(client)
  private val uploadStatusTable = Table[UploadStatusRecord](config.uploadStatusTable)

  def getStatus(imageId: String)(implicit instance: Instance) = {
    logger.info("getStatus: " + instance.id + " / " + imageId)
    scanamo.exec(uploadStatusTable.get("instance" === instance.id and "id" === imageId))
  }

  def setStatus(uploadStatus: UploadStatusRecord) = {
    scanamo.exec(uploadStatusTable.put(uploadStatus))
  }

  def updateStatus(imageId: String, updateStatus: UploadStatus)(implicit instance: Instance) = {
    logger.info("updateStatus: " + instance.id + " / " + imageId + " -> " + updateStatus)
    val updateExpression = updateStatus.errorMessage match {
      case Some(error) => set("status", updateStatus.status) and set("errorMessages", error)
      case None => set("status", updateStatus.status)
    }
    val uploadStatusTableWithCondition =
      if(updateStatus.status == Queued) // can only transition to Queued status from Prepared status
        uploadStatusTable.when(attributeExists("id") and ("status" === Prepared.toString))
      else
        uploadStatusTable.when(attributeExists("id"))

    scanamo.exec(
      uploadStatusTableWithCondition
        .update(
          "id" === imageId and "instance" === instance.id,
          update = updateExpression
        )
    )
  }

  def queryByUser(user: String)(implicit instance: Instance): Future[List[UploadStatusRecord]] = {
    scanamo.exec(uploadStatusTable.query("instance" === instance.id)).map {
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
