package lib

import play.api.mvc.Result
import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.logging.FALLBACK
import model.UploadRequest
import play.api.Logger

object FailureResponse extends ArgoHelpers {
  val invalidUri: Result = respondError(BadRequest, "invalid-uri", s"The provided 'uri' is not valid")
  val failedUriDownload: Result = respondError(BadRequest, "failed-uri-download", s"The provided 'uri' could not be downloaded")

  def unsupportedMimeType(uploadRequest: UploadRequest, supportedMimeTypes: List[String]): Result = {
    Logger.info(s"Rejected request to load file: mime-type is not supported")(uploadRequest.toLogMarker)
    val mimeType = uploadRequest.mimeType getOrElse FALLBACK

    respondError(
      UnsupportedMediaType,
      "unsupported-type",
      s"Unsupported mime-type: $mimeType. Supported: ${supportedMimeTypes.mkString(", ")}"
    )
  }
}
