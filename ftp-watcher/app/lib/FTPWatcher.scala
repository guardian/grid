package lib

import java.nio.file.{Path, Files}
import java.io.InputStream
import scala.concurrent.duration._

import _root_.play.api.libs.json.Json
import org.apache.commons.io.IOUtils
import org.apache.commons.net.ftp.FTPFile
import org.slf4j.LoggerFactory

import scalaz.syntax.bind._
import scalaz.concurrent.Task
import scalaz.stream.{Process, io}
import Process._
import io.resource

import com.gu.mediaservice.lib.Processes._

class FTPWatcher(host: String, user: String, password: String) {

  def run: Task[Unit] = ??? // listFiles.through(retrieveFile) ...

  def listFiles: Process[Task, FilePath] =
    resourceP(initClient)(releaseClient) { client =>
      repeatEval(client.listDirectories("."))
        .pipe(unchunk)
        .flatMap(dir => eval(client.listFiles(dir)))
        .pipe(unchunk)
    }

  def retrieveFile: Channel[Task, FilePath, Array[Byte]] =
    resource(initClient)(releaseClient) { client =>
      Task.now { path: FilePath => client.retrieveFile(path) }
    }

  def deleteFile: Sink[Task, FilePath] =
    resource(initClient)(releaseClient)(client => Task.now { path: FilePath => client.delete(path) })

  private def initClient: Task[Client] =
    Task.delay(new Client).flatMap { client =>
      client.connect(host, 21) >>
        client.login(user, password) >>
        client.enterLocalPassiveMode >>
        client.setBinaryFileType >|
        client
    }

  private def releaseClient(client: Client): Task[Unit] =
    client.quit >> client.disconnect

}

object FTPWatcher {

  def waitForActive[A](sleepDuration: Duration)(p: Process[Task, A]): Process[Task, A] =
    sleepUntil(repeat(sleep(sleepDuration) fby eval(Task.delay(Config.isActive))))(p)

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
