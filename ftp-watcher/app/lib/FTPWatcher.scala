package lib

import scala.concurrent.duration._
import scala.util.control.NonFatal

import _root_.play.api.libs.json.Json
import org.slf4j.LoggerFactory

import scalaz.syntax.bind._
import scalaz.concurrent.Task
import scalaz.stream.{Process, io}
import Process._
import io.resource

import com.gu.mediaservice.lib.Processes._
import com.gu.mediaservice.syntax.ProcessSyntax._
import org.apache.commons.io.FilenameUtils

class FTPWatcher(host: String, user: String, password: String) {

  def run: Task[Unit] =
    uploads
      .pipeW(triggerFailedUploadThreshold(3))
      .observeW(moveFailedUploads)
      .stripW
      .to(deleteFile)
      .run

  /** A process which logs failed uploads on the left hand side, and successful ones on the right */
  def uploads: Writer[Task, FilePath, FilePath] =
    listFiles(10)
      .flatMap(f => waitForActive(500.millis)(emit(f)))
      .through(retrieveFile)
      .through(uploadImage)
      .map(_.toDisjunction)

  def listFiles(maxPerDir: Int): Process[Task, FilePath] =
    resourceP(initClient)(releaseClient) { client =>
      repeatEval(client.listDirectories("."))
        .unchunk
        .filter(Config.ftpPaths.contains)
        .flatMap { dir =>
          eval(client.listFiles(dir)).unchunk.take(maxPerDir).map(dir + "/" + _)
        }
    }

  def retrieveFile: Channel[Task, FilePath, File] =
    resource(initClient)(releaseClient) { client =>
      Task.now { path: FilePath =>
        val uploadedBy = path.takeWhile(_ != '/')
        client.retrieveFile(path).map(bytes => File(path, bytes, uploadedBy))
      }
    }

  def deleteFile: Sink[Task, FilePath] =
    resource(initClient)(releaseClient)(client => Task.now { path: FilePath => client.delete(path) })

  import scalaz.syntax.semigroup._
  import scalaz.std.AllInstances._

  def moveFailedUploads: Sink[Task, FilePath] =
    resource(initClient)(releaseClient) { client =>
      Task.now { path: FilePath =>
        val destDir = FilenameUtils.getPath(path) + "failed"
        val destPath = destDir + "/" + FilenameUtils.getName(path)
        logger.warn(s"$path breached the failure threshold, moving to $destPath")
        client.mkDir(destDir) >> client.rename(path, destPath)
      }
    }

  def triggerFailedUploadThreshold(threshold: Int): Process1[FilePath, FilePath] = {
    def go(acc: Map[FilePath, Int]): Process1[FilePath, FilePath] =
      await1[FilePath].flatMap { path =>
        val newAcc = acc |+| Map(path -> 1)
        if (newAcc(path) >= threshold)
          emit(path) fby go(acc - path)
        else
          go(newAcc)
      }
    go(Map.empty)
  }

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

  def uploadImage: Channel[Task, File, UploadResult] =
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
        Uploaded(path)
      }
      upload.onFinish {
        case None      => uploadedImages.increment(List(uploadedByDimension(uploadedBy)))
        case Some(err) => failedUploads.increment(List(causedByDimension(err)))
      }.handle {
        case NonFatal(err) => Failed(path)
      }
    }

}

sealed trait UploadResult {
  import scalaz.\/

  final def toDisjunction: FilePath \/ FilePath = this match {
    case Uploaded(p) => \/.right(p)
    case Failed(p)   => \/.left(p)
  }
}
case class Uploaded(path: FilePath) extends UploadResult
case class Failed(path: FilePath) extends UploadResult

case class File(path: FilePath, bytes: Array[Byte], uploadedBy: String)
