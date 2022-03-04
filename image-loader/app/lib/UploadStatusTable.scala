package lib

import com.gu.mediaservice.lib.aws.DynamoDB
import model.{UploadStatus, UploadStatusRecord}
import org.scanamo._
import org.scanamo.auto.genericProduct
import org.scanamo.syntax._

import scala.concurrent.ExecutionContext.Implicits.global

class UploadStatusTable(config: ImageLoaderConfig) extends DynamoDB(config, config.uploadStatusTable) {

  private val uploadStatusTable = Table[UploadStatusRecord](config.uploadStatusTable)

  private val scanamoAsync = ScanamoAsync(client)

  def getStatus(imageId: String) = {
    scanamoAsync.exec(uploadStatusTable.get("id" -> imageId))
  }

  def setStatus(uploadStatus: UploadStatusRecord) = {
    scanamoAsync.exec(uploadStatusTable.put(uploadStatus))
  }

  def updateStatus(imageId: String, updateRequest: UploadStatus) = {
    val updateExpression = updateRequest.errorMessage match {
      case Some(error) => set("status" -> updateRequest.status) and set("errorMessages" -> error)
      case None => set("status" -> updateRequest.status)
    }
    scanamoAsync.exec(
      uploadStatusTable
        .given(attributeExists("id"))
        .update(
          "id" -> imageId,
          update = updateExpression
        )
    )
  }
}
