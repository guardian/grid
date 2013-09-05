package lib.storage

import java.io.File
import java.net.URI
import scala.concurrent.Future


trait StorageBackend {

  /** Store a copy of the given file and return the URI of that copy.
    * The file can safely be deleted afterwards.
    */
  def store(file: File): Future[URI]

}
