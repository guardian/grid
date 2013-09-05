package lib.storage

import java.io.File
import scala.concurrent.Future


object NullStorage extends StorageBackend {
  def store(file: File) = Future.successful(new File("/dev/null").toURI)
}
