package controllers

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.Executors
import scala.concurrent.{Promise, ExecutionContext, Future}

import play.api.mvc.{Action, Controller}
import lib.{Sinks, File, Config, FTPWatcher}


object Application extends Controller {

  import play.api.libs.concurrent.Execution.Implicits._

  def index = Action {
    Ok("This is an FTP Watcher.\r\n")
  }

  import FTPWatchers.future

  def healthCheck = Action.async {
    if (future.isCompleted)
      future
        .map(_ => ServiceUnavailable("Watcher terminated unexpectedly"))
        .recover { case e => ServiceUnavailable }
    else Future.successful(Ok("OK"))
  }

}

object FTPWatchers {

  import scalaz.stream.{Process, wye}
  import scalaz.concurrent.Task

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  val watchers =
    for (path <- Config.ftpPaths)
    yield FTPWatcher(Config.ftpHost, Config.ftpUser, Config.ftpPassword, path)

  val stream = watchers.map(_.watchDir)
      .foldLeft[Process[Task, File]](Process.halt)((p1, p2) => p1.wye(p2)(wye.merge))

  val task: Task[Unit] = {
    val sink = Sinks.httpPost(Config.imageLoaderUri)
    (stream to sink).run
  }

  private val cancel = new AtomicBoolean(false)

  def shutdown() {
    cancel.set(true)
  }

  lazy val future: Future[Unit] = {
    val promise = Promise[Unit]()
    task.runAsyncInterruptibly(_.fold(promise.failure, promise.success), cancel)
    promise.future
  }

}
