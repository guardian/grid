package lib.imaging

import java.io.File
import play.api.libs.iteratee.{Iteratee, Enumeratee, Enumerator, Traversable}

object MimeTypeDetection {

  def guessMimeType(file: File): Option[String] =
    // FIXME: horribly inefficient as it is (1) synchronous IO and (2) reads the whole file
    detectMimeType(java.nio.file.Files.readAllBytes(file.toPath))


  // FIXME: this is naive and incomplete, use a better library like Apache Tika (huge) or others to do this
  def detectMimeType(bytes: Array[Byte]): Option[String] = {
    val c1 = if (bytes.length >= 1) bytes.apply(0) & 0xff else 0x00
    val c2 = if (bytes.length >= 2) bytes.apply(1) & 0xff else 0x00
    val c3 = if (bytes.length >= 3) bytes.apply(2) & 0xff else 0x00
    val c4 = if (bytes.length >= 4) bytes.apply(3) & 0xff else 0x00
    val c5 = if (bytes.length >= 5) bytes.apply(4) & 0xff else 0x00
    val c6 = if (bytes.length >= 6) bytes.apply(5) & 0xff else 0x00
    val c7 = if (bytes.length >= 7) bytes.apply(6) & 0xff else 0x00
    val c8 = if (bytes.length >= 8) bytes.apply(7) & 0xff else 0x00

    if (c1 == 'G' && c2 == 'I' && c3 == 'F' && c4 == '8')
      Some("image/gif")
    else if (c1 == 137 && c2 == 80 && c3 == 78 && c4 == 71 && c5 == 13 && c6 == 10 && c7 == 26 && c8 == 10)
      Some("image/png")
    else if (c4 == 0xEE && c1 == 0xFF && c2 == 0xD8 && c3 == 0xFF)
      Some("image/jpeg") // allegedly image/jpg but that's not a mime-type right?
    else if (c1 == 0xFF && c2 == 0xD8 && c3 == 0xFF)
      Some("image/jpeg")
    else
      None
  }

}
