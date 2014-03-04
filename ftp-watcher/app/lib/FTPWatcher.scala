package lib

import scala.concurrent.duration._
import scala.util.control.NonFatal

import _root_.play.api.libs.json.Json
import org.slf4j.LoggerFactory

import scalaz.syntax.bind._
import scalaz.concurrent.Task
import scalaz.stream.{Process, io}
import scalaz.\/
import Process._
import io.resource

import com.gu.mediaservice.lib.Processes._
import com.gu.mediaservice.syntax.ProcessSyntax._
import org.apache.commons.io.FilenameUtils

class FTPWatcher(host: String, user: String, password: String) {

  def run: Task[Unit] =
    uploads
      .pipeW(repeatedFailureThreshold(3))
      .observeW(moveFailedUploads)
      .stripW
      .to(deleteFile)
      .run

  /** A process which logs failed uploads on the left hand side, and successful ones on the right */
  def uploads: Writer[Task, FailedUpload, FilePath] =
    listFiles(10)
      .flatMap(f => waitForActive(500.millis)(emit(f)))
      .through(retrieveFile)
      .through(uploadImage)

  import scalaz.ListT

  def listFiles(maxPerDir: Int): Process[Task, FilePath] =
    resource(initClient)(releaseClient) { client =>
      (for {
        dir  <- ListT(client.listDirectories("."))
        file <- ListT(client.listFiles(dir)).take(maxPerDir)
      } yield FilenameUtils.concat(dir, file)).toList
    }.unchunk

  def retrieveFile: Channel[Task, FilePath, File] =
    resource(initClient)(releaseClient) { client =>
      Task.now { path: FilePath =>
        val uploadedBy = path.takeWhile(_ != '/')
        client.retrieveFile(path).map(bytes => File(path, bytes, uploadedBy))
      }
    }

  def deleteFile: Sink[Task, FilePath] =
    resource(initClient)(releaseClient)(client => Task.now { path: FilePath => client.delete(path) })

  def moveFailedUploads: Sink[Task, FailedUpload] =
    resource(initClient)(releaseClient) { client =>
      Task.now { case FailedUpload(path) =>
        val destDir = FilenameUtils.getPath(path) + "failed"
        val destPath = destDir + "/" + FilenameUtils.getName(path)
        logger.warn(s"$path breached the failure threshold, moving to $destPath")
        client.mkDir(destDir) >> client.rename(path, destPath)
      }
    }

  def repeatedFailureThreshold(threshold: Int): Process1[FailedUpload, FailedUpload] =
    emitEveryNth(threshold)

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

  import org.apache.http.client.methods.HttpPost
  import org.apache.http.impl.client.HttpClients
  import org.apache.commons.io.IOUtils
  import org.apache.http.entity.ByteArrayEntity
  import FTPWatcherMetrics._

  private val logger = LoggerFactory.getLogger(getClass)

  def waitForActive[A](sleepDuration: Duration)(p: Process[Task, A]): Process[Task, A] =
    sleepUntil(repeat(sleep(sleepDuration) fby eval(Task.delay(Config.isActive))))(p)

  def uploadImage: Channel[Task, File, FailedUpload \/ FilePath] =
    Process.constant { case File(path, bytes, uploadedBy) =>
      val uri = Config.imageLoaderUri + "?uploadedBy=" + uploadedBy
      val upload = Task {
        val client = HttpClients.createDefault
        val postReq = new HttpPost(uri)
        val entity = new ByteArrayEntity(bytes)
        postReq.setEntity(entity)
        val response = client.execute(postReq)
        val json = Json.parse(IOUtils.toByteArray(response.getEntity.getContent))
        response.close()
        client.close()
        val id = (json \ "id").as[String]
        logger.info(s"Uploaded $path to $uri id=$id")
        \/.right(path)
      }
      upload.onFinish {
        case None      => uploadedImages.increment(List(uploadedByDimension(uploadedBy)))
        case Some(err) => failedUploads.increment(List(causedByDimension(err)))
      }.handle {
        case NonFatal(err) => \/.left(FailedUpload(path))
      }
    }

}

case class FailedUpload(path: FilePath) extends AnyVal

case class File(path: FilePath, bytes: Array[Byte], uploadedBy: String)
