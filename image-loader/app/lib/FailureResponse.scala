package lib

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.argo.model.ErrorResponse
import com.gu.mediaservice.lib.logging.GridLogging
import com.gu.mediaservice.model.{MimeType, UnsupportedMimeTypeException}
import lib.imaging.UserImageLoaderException
import play.api.libs.json.Writes
import play.api.mvc.{Result, Results}


object FailureResponse extends ArgoHelpers with Results {

  case class Response(status: Status, errorResponse: ErrorResponse[Int])
  object Response {
    def apply(status: Status, key: String, message: String): Response = Response(status, ErrorResponse[Int](errorKey = key, errorMessage = message, data=None))
  }

  val invalidUri: Response = {
    logger.warn("importImage request failed; invalid uri")
    Response(BadRequest, "invalid-uri", s"The provided 'uri' is not valid")
  }

  def badUserInput(e: UserImageLoaderException): Response = {
    logger.warn("importImage request failed; bad user input", e)
    Response(BadRequest, "bad-user-data", "bad user input: ${e.getMessage}")
  }

  val failedUriDownload: Response = {
    logger.warn("importImage request failed")
    Response(BadRequest, "failed-uri-download", s"The provided 'uri' could not be downloaded")
  }

  def unsupportedMimeType(unsupported: UnsupportedMimeTypeException, supportedMimeTypes: List[MimeType]): Response = {
    logger.info(s"Rejected request to load file: mime-type is not supported", unsupported)
    Response(UnsupportedMediaType, "unsupported-type", s"Unsupported mime-type: ${unsupported.mimeType}. Supported: ${supportedMimeTypes.mkString(", ")}")
  }
  def notAnImage(exception: Exception, supportedMimeTypes: List[MimeType]): Response = {
    logger.info(s"Rejected request to load file: file type is not supported", exception)
    Response(
      UnsupportedMediaType,
      "unsupported-file-type",
      s"Unsupported file type: not a valid image type. Supported: ${supportedMimeTypes.mkString(", ")}"
    )
  }

  def badImage(exception: Exception): Response = {
    logger.info(s"Rejected request to load file: image file is not good", exception)

    Response(
      UnsupportedMediaType,
      "bad-file",
      s"Bad file: not a valid image file."
    )
  }

  def internalError(exception: Throwable): Response = {
    logger.info(s"Unhandled exception", exception)

    Response(
      InternalServerError,
      "internal-error",
      s"Unhandled error: ${exception.getMessage}"
    )
  }

  def responseToResult(response: Response): Result = serializeAndWrap(response.errorResponse, response.status)
}
