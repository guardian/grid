package lib.imaging

import java.io.File

import org.apache.tika.Tika

object MimeTypeDetection {
  val tika = new Tika()

  def guessMimeType(file: File): Option[String] =
    Option(tika.detect(file))

}
