package lib

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.model.{MimeType, UnsupportedMimeTypeException}
import play.api.Logger
import play.api.mvc.Result

object FailureResponse extends ArgoHelpers {
  val invalidUri: Result = respondError(BadRequest, "invalid-uri", s"The provided 'uri' is not valid")
  val failedUriDownload: Result = respondError(BadRequest, "failed-uri-download", s"The provided 'uri' could not be downloaded")

  def unsupportedMimeType(unsupported: UnsupportedMimeTypeException, supportedMimeTypes: List[MimeType]): Result = {
    Logger.info(s"Rejected request to load file: mime-type is not supported")
    respondError(
      UnsupportedMediaType,
      "unsupported-type",
      s"Unsupported mime-type: ${unsupported.mimeType}. Supported: ${supportedMimeTypes.mkString(", ")}"
    )
  }
  def notAnImage(supportedMimeTypes: List[MimeType]): Result = {
    Logger.info(s"Rejected request to load file: file type is not supported")

    respondError(
      UnsupportedMediaType,
      "unsupported-type",
      s"Unsupported file type: not an image type. Supported: ${supportedMimeTypes.mkString(", ")}"
    )
  }
}
