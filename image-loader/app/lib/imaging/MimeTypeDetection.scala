package lib.imaging

import java.io.{BufferedInputStream, File, FileInputStream}

import com.drew.imaging.FileTypeDetector
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model.{MimeType, UnsupportedMimeTypeException}
import org.apache.tika.Tika
import scala.util.{Failure, Success, Try}

object MimeTypeDetection extends GridLogging {
  def guessMimeType(file: File): Either[UnsupportedMimeTypeException, MimeType] = Try(usingTika(file)) match {
    case Success(mimeType) => Right(mimeType)
    case Failure(tikaAttempt: UnsupportedMimeTypeException) => {
      Try(usingMetadataExtractor(file)) match {
        case Success(mimeType) => {
          logger.info(s"Using mime type from metadata extractor as tika mime type is unsupported (${tikaAttempt.mimeType})")
          Right(mimeType)
        }
        case Failure(metadataExtractorAttempt: UnsupportedMimeTypeException) => {
          logger.warn(s"Unsupported mime type: tika was ${tikaAttempt.mimeType}, metadata extractor was ${metadataExtractorAttempt.mimeType}", metadataExtractorAttempt)
          Left(metadataExtractorAttempt)
        }
        case Failure(_: Throwable) => Left(new UnsupportedMimeTypeException(FALLBACK))
      }
    }
    case Failure(_: Throwable) => Left(new UnsupportedMimeTypeException(FALLBACK))
  }

  private def usingTika(file: File): MimeType = MimeType(new Tika().detect(file))

  private def usingMetadataExtractor(file: File) : MimeType = {
    val stream = new BufferedInputStream(new FileInputStream(file))
    val fileType = FileTypeDetector.detectFileType(stream)
    MimeType(fileType.getMimeType)
  }
}
