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
import FTPWatcher._
import Processes._
import org.slf4j.LoggerFactory
import org.apache.commons.io.IOUtils


class FTPWatcher(config: Config) {

  /** Produces a stream of `File`s, each exposing an `InputStream`.
    *
    * The stream will be closed, and the file deleted from the server, once the `File` element
    * has been consumed.
    */
  def watchDir(batchSize: Int): Process[Task, File] = {
    val client = new Client
    resource1(initClient(client))(_ => client.quit >> client.disconnect)(_ => listFiles(client, batchSize))
      .flatMap(sleepIfEmpty(1.second))
      .pipe(unchunk)
      .flatMap(retrieveFile(client, _))
      .repeat
  }

  def initClient(client: Client): Task[Unit] =
    client.connect(config.host, 21) >>
    client.login(config.user, config.password) >>
    client.cwd(config.dir) >>
    client.enterLocalPassiveMode >>
    client.setBinaryFileType

  def listFiles(client: Client, batchSize: Int): Task[Seq[FTPFile]] =
    client.listFiles map (_.take(batchSize))

  def retrieveFile(client: Client, file: FTPFile): Process[Task, File] =
    resource1(client.retrieveFile(file.getName))(
      stream => Task.delay(stream.close()) >> client.completePendingCommand >> client.delete(file.getName))(
      stream => Task.now(File(file.getName, file.getSize, stream)))

}

object FTPWatcher {

  def apply(host: String, user: String, password: String, dir: FilePath): FTPWatcher =
    new FTPWatcher(Config(host, user, password, dir))

  case class Config(host: String, user: String, password: String, dir: FilePath)

}

case class File(name: FilePath, size: Long, stream: InputStream)

object Sinks {

  private val logger = LoggerFactory.getLogger(getClass)

  import org.apache.http.client.methods.HttpPost
  import org.apache.http.entity.{ContentType, InputStreamEntity}
  import org.apache.http.impl.client.HttpClients

  def httpPost(uri: String): Sink[Task, File] =
    Process.constant { case File(name, length, in) =>
      Task {
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
