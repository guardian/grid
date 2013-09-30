package lib.storage

import java.io.File


object DevNullStorage extends StorageBackend {
  def store(file: File) = new File("/dev/null").toURI
}
