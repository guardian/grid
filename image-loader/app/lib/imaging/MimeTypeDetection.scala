package lib.imaging

import java.io.File

import com.gu.mediaservice.model.MimeType
import org.apache.tika.Tika

import scala.util.Try

object MimeTypeDetection {
  val tika = new Tika()

  def guessMimeType(file: File): Option[MimeType] =
    Try(MimeType(tika.detect(file))).toOption
}
