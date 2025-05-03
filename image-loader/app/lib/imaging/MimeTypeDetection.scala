package lib.imaging

import java.io.{BufferedInputStream, File, FileInputStream}

import com.drew.imaging.FileTypeDetector
import com.drew.imaging.tiff.TiffMetadataReader
import com.drew.metadata.exif.ExifIFD0Directory
import com.gu.mediaservice.lib.logging._
import com.gu.mediaservice.model.{MimeType, Tiff, UnsupportedMimeTypeException}
import org.apache.tika.Tika
import scala.util.{Failure, Success, Try}

object MimeTypeDetection extends GridLogging {
  def guessMimeType(file: File)(implicit logMarker: LogMarker): Either[UnsupportedMimeTypeException, MimeType] = {
    logger.info("Starting guessMimeType")
    val x = Try(usingTika(file)) match {
      case Success(Tiff) if isDng(file) => Left(new UnsupportedMimeTypeException("image/dng"))
      case Success(mimeType) => Right(mimeType)
      case Failure(tikaAttempt: UnsupportedMimeTypeException) => {
        Try(usingMetadataExtractor(file)) match {
          case Success(mimeType) => {
            logger.info(logMarker, s"Using mime type from metadata extractor as tika mime type is unsupported (${tikaAttempt.mimeType})")
            Right(mimeType)
          }
          case Failure(metadataExtractorAttempt: UnsupportedMimeTypeException) => {
            logger.warn(logMarker, s"Unsupported mime type: tika was ${tikaAttempt.mimeType}, metadata extractor was ${metadataExtractorAttempt.mimeType}", metadataExtractorAttempt)
            Left(metadataExtractorAttempt)
          }
          case Failure(_: Throwable) => Left(new UnsupportedMimeTypeException(FALLBACK))
        }
      }
      case Failure(_: Throwable) => Left(new UnsupportedMimeTypeException(FALLBACK))
    }
    logger.info("End guessMimeType")
    x
  }

  // DNG files look like Tiff files, but include a DNGVersion tag (0xC612)
  // See https://www.adobe.com/content/dam/acom/en/products/photoshop/pdfs/dng_spec_1.4.0.0.pdf
  private def isDng(file: File) = Try {
    val metadata = TiffMetadataReader.readMetadata(file)
    val directory = metadata.getFirstDirectoryOfType(classOf[ExifIFD0Directory])
    directory.containsTag(0xC612)
  } getOrElse(false)

  private def usingTika(file: File): MimeType = MimeType(new Tika().detect(file))

  private def usingMetadataExtractor(file: File) : MimeType = {
    val fis = new FileInputStream(file)
    val stream = new BufferedInputStream(fis)
    try {
      val fileType = FileTypeDetector.detectFileType(stream)
      MimeType(fileType.getMimeType)
    } finally {
      stream.close()
      fis.close()
    }
  }
}
