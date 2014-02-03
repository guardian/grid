package lib.storage

import java.io.File
import java.net.URL
import scala.concurrent.{ExecutionContext, Future}
import java.util.concurrent.Executors


trait StorageBackend {

  /** Blocking IO work involved in storing the file should be done on this thread pool,
    * assuming that the libraries used do not provide a (decent) non-blocking API.
    */
  protected final implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(8))

  /** Store a copy of the given file and return the URI of that copy.
    * The file can safely be deleted afterwards.
    */
  def storeImage(id: String, file: File, meta: Map[String, String] = Map.empty): Future[URL]

  def storeThumbnail(id: String, file: File): Future[URL]

}
