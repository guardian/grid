package lib.storage

import java.io.File
import scala.concurrent.Future


object DevNullStorage extends StorageBackend {
  def store(id: String, file: File) = Future.successful(new File("/dev/null").toURI)
}
