package lib.storage

import java.io.File


object DevNullStorage extends StorageBackend {
  def store(id: String, file: File) = new File("/dev/null").toURI
}
