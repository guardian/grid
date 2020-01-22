package lib

import java.util.UUID

import com.gu.mediaservice.model.{Image, UploadInfo}
import lib.imaging.MimeTypeDetection
import model.{ImageUploadOps, UploadRequest}
import org.joda.time.DateTime

import scala.concurrent.Future

object ImageUploadProjector {
  def apply(imageUploadOps: ImageUploadOps): ImageUploadProjector = new ImageUploadProjector(imageUploadOps)
}

class ImageUploadProjector(imageUploadOps: ImageUploadOps) {

  def projectImage(srcFileDigest: DigestedFile, fileUserMetadata: Map[String, String]): Future[Image] = {
    val DigestedFile(tempFile_, id_) = srcFileDigest
    // identifiers_ to rehydrate
    val identifiers_ = Map[String, String]()
    // filename to rehydrate
    val uploadInfo_ = UploadInfo(filename = None)
    // TODO: handle the error thrown by an invalid string to `DateTime`
    // only allow uploadTime to be set by AuthenticatedService
    val uploadedBy_ = fileUserMetadata.getOrElse("uploaded_by", "reingester")
    val uploadedTimeRaw = fileUserMetadata.getOrElse("upload_time", DateTime.now().toString)

    val uploadTime_ = new DateTime(uploadedTimeRaw)
    // Abort early if unsupported mime-type
    val mimeType_ = MimeTypeDetection.guessMimeType(tempFile_)
    val notUsedReqID = UUID.randomUUID()
    val uploadRequest = UploadRequest(
      requestId = notUsedReqID,
      imageId = id_,
      tempFile = tempFile_,
      mimeType = mimeType_,
      uploadTime = uploadTime_,
      uploadedBy = uploadedBy_,
      identifiers = identifiers_,
      uploadInfo = uploadInfo_
    )

    imageUploadOps.projectImageFromUploadRequest(uploadRequest)
  }

}
