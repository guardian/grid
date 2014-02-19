package lib

import java.nio.file.{Path, Files}
import java.io.InputStream
import scala.concurrent.duration._

import _root_.play.api.libs.json.Json
import org.apache.commons.net.ftp.FTPFile

import scalaz.syntax.bind._
import scalaz.concurrent.Task
import scalaz.stream.Process
import scalaz.stream.Process.Sink

import com.gu.mediaservice.lib.Processes
import Processes._
import org.slf4j.LoggerFactory
import org.apache.commons.io.IOUtils


class FTPWatcher(host: String, user: String, password: String, paths: List[FilePath]) {

  import FTPWatcher._

  def run: Task[Unit] = {
    val processes = paths.map { path =>
      retryContinually(1.second) {
        waitForActive(250.millis) {
          watchDir(path, batchSize = 10).to(Sinks.uploadImage(uploadedBy = path))
        }
      }
    }
    processes.reduceLeft(_ merge _).run
  }

  /** Produces a stream of `File`s, each exposing an `InputStream`.
    *
    * The stream will be closed, and the file deleted from the server, once the `File` element
    * has been consumed.
    */
  private def watchDir(path: FilePath, batchSize: Int): Process[Task, File] = {
    val client = new Client
    resource1(initClient(client, path))(_ => client.quit >> client.disconnect)(_ => listFiles(client, batchSize))
      .flatMap(sleepIfEmpty(1.second))
      .pipe(unchunk)
      .take(batchSize + 1) // FIXME it seems we *must* exhaust the stream, otherwise resources are not released
      .flatMap(retrieveFile(client, _))
  }

  private def initClient(client: Client, path: FilePath): Task[Unit] =
    client.connect(host, 21) >>
    client.login(user, password) >>
    client.cwd(path) >>
    client.enterLocalPassiveMode >>
    client.setBinaryFileType

  private def listFiles(client: Client, batchSize: Int): Task[Seq[FTPFile]] =
    client.listFiles map (_.take(batchSize))

  private def retrieveFile(client: Client, file: FTPFile): Process[Task, File] =
    resource1(client.retrieveFile(file.getName))(
      stream => Task.delay(stream.close()) >> client.completePendingCommand >> client.delete(file.getName))(
      stream => Task.now(File(file.getName, file.getSize, stream)))

}

object FTPWatcher {
  import Process._

  def waitForActive[A](sleepDuration: Duration)(p: Process[Task, A]): Process[Task, A] =
    sleepUntil(repeat(sleep(sleepDuration) fby Process.eval(Task.delay(Config.isActive))))(p)

}

case class File(name: FilePath, size: Long, stream: InputStream)

object Sinks {

  private val logger = LoggerFactory.getLogger(getClass)

  import org.apache.http.client.methods.HttpPost
  import org.apache.http.entity.{ContentType, InputStreamEntity}
  import org.apache.http.impl.client.HttpClients
  import FTPWatcherMetrics._

  def uploadImage(uploadedBy: String): Sink[Task, File] =
    Process.constant { case File(name, length, in) =>
      val uri = Config.imageLoaderUri + "?uploadedBy=" + uploadedBy
      val upload = Task {
        val client = HttpClients.createDefault
        val postReq = new HttpPost(uri)
        val entity = new InputStreamEntity(in, length, ContentType.DEFAULT_BINARY)
        postReq.setEntity(entity)
        val response = client.execute(postReq)
        val json = Json.parse(IOUtils.toByteArray(response.getEntity.getContent))
        response.close()
        client.close()
        val id = (json \ "id").as[String]
        logger.info(s"Uploaded $name to $uri id=$id")
      }
      upload.onFinish {
        case None      => uploadedImages.increment(List(uploadedByDimension(uploadedBy)))
        case Some(err) => failedUploads.increment(List(causedByDimension(err)))
      }
    }

  def saveToFile(parent: Path): Sink[Task, File] =
    Process.constant { case File(name, _, stream) =>
      Task {
        val path = parent.resolve(name)
        println(s"Saving $name to $path...")
        Files.copy(stream, path)
      }
    }

}
