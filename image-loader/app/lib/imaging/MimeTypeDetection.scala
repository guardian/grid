package lib.imaging

import java.io.File

import com.gu.mediaservice.model.{MimeType, UnsupportedMimeTypeException}
import org.apache.tika.Tika
import com.gu.mediaservice.lib.logging._

import scala.util.{Failure, Success, Try}

object MimeTypeDetection {
  val tika = new Tika()

  def guessMimeType(file: File): Either[UnsupportedMimeTypeException, MimeType] = Try(MimeType(tika.detect(file))) match {
    case Success(mimeType) => Right(mimeType)
    case Failure(exception: UnsupportedMimeTypeException) => Left(exception)
    case Failure(_: Throwable) => Left(new UnsupportedMimeTypeException(FALLBACK))
  }
}
