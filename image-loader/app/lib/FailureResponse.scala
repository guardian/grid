package lib

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{MimeType, UnsupportedMimeTypeException}
import lib.imaging.UserImageLoaderException
import play.api.mvc.Result

object FailureResponse extends ArgoHelpers {
  val invalidUri: Result = {
    logger.warn("importImage request failed; invalid uri")
    respondError(BadRequest, "invalid-uri", s"The provided 'uri' is not valid")
  }

  def badUserInput(e: UserImageLoaderException): Result = {
    logger.warn("importImage request failed; bad user input", e)
    BadRequest(e.getMessage)
  }

  val failedUriDownload: Result = {
    logger.warn("importImage request failed")
    respondError(BadRequest, "failed-uri-download", s"The provided 'uri' could not be downloaded")
  }

  def unsupportedMimeType(unsupported: UnsupportedMimeTypeException, supportedMimeTypes: List[MimeType]): Result = {
    logger.info(s"Rejected request to load file: mime-type is not supported", unsupported)
    respondError(
      UnsupportedMediaType,
      "unsupported-type",
      s"Unsupported mime-type: ${unsupported.mimeType}. Supported: ${supportedMimeTypes.mkString(", ")}"
    )
  }
  def notAnImage(exception: Exception, supportedMimeTypes: List[MimeType]): Result = {
    logger.info(s"Rejected request to load file: file type is not supported", exception)

    respondError(
      UnsupportedMediaType,
      "unsupported-file-type",
      s"Unsupported file type: not a valid image type. Supported: ${supportedMimeTypes.mkString(", ")}"
    )
  }

  def badImage(exception: Exception): Result = {
    logger.info(s"Rejected request to load file: image file is not good", exception)

    respondError(
      UnsupportedMediaType,
      "bad-file",
      s"Bad file: not a valid image file."
    )
  }
}
