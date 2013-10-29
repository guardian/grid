package controllers

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.Executors
import scala.concurrent.{Promise, ExecutionContext, Future}
import scalaz.syntax.bind._

import play.api.Logger
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
      future.map(_ => Ok("Ok"))
            .recover { case e => ServiceUnavailable }
    else Future.successful(Ok("OK"))
  }

  def status = Action {
    val statusText = if (Config.isActive) "Active" else "Passive"
    Ok(statusText + "\n")
  }

  def setStatus = Action { request =>
    val active = request.getQueryString("active") map (_.toBoolean)
    active match {
      case Some(b) =>
        Config.passive.set(! b)
        Logger.info("Mode set to " + Config.status)
        NoContent
      case None =>
        BadRequest
    }
  }

}

object FTPWatchers {

  import scalaz.stream.{Process, wye}
  import scalaz.concurrent.Task

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  def watchers =
    for (path <- Config.ftpPaths)
    yield FTPWatcher(Config.ftpHost, Config.ftpUser, Config.ftpPassword, path)

  def stream = watchers.map(_.watchDir)
    .foldLeft[Process[Task, File]](Process.halt)((p1, p2) => p1.wye(p2)(wye.merge))

  def watcherTask(batchSize: Int): Task[Unit] = {
    val sink = Sinks.httpPost(Config.imageLoaderUri)
    stream.take(batchSize).to(sink).run
  }

  def waitForActive(sleep: Long): Task[Unit] =
    Task(Config.isActive).ifM(Task.now(()),
      Task(Thread.sleep(sleep)) >> waitForActive(sleep))

  /** When running, this starts the watcher process immediately if the
    * `active` atomic variable is set to `true`.
    * 
    * Otherwise, it sleeps, waking periodically to check `active` again.
    * 
    * Once `active` is `true`, the watcher process runs, checking at intervals
    * whether `active` is still `true`, and stopping if it becomes `false`.
    */
  lazy val future: Future[Unit] = _future

  private def _future: Future[Unit] =
    retryFuture("FTP watcher", 3000) {
      val task = waitForActive(sleep = 250) >> watcherTask(batchSize = 10)
      val promise = Promise[Unit]()
      task.runAsync(_.fold(promise.failure, promise.success))
      promise.future
    }.flatMap(_ => _future)

  def retryFuture[A](desc: String, wait: Long)(future: => Future[A]): Future[A] =
    future.recoverWith {
      case e =>
        Logger.error(s"""Task "$desc" threw exception: """, e)
        Logger.info(s"""Restarting "$desc" in $wait ms...""")
        Thread.sleep(wait)
        retryFuture(desc, wait)(future)
    }

}
