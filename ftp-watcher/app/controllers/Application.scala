package controllers

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.Executors
import scala.concurrent.{Promise, ExecutionContext, Future}
import scalaz.syntax.bind._

import play.api.Logger
import play.api.mvc.{Action, Controller}
import lib.{Sinks, Config, FTPWatcher}


object Application extends Controller {

  import play.api.libs.concurrent.Execution.Implicits._

  def index = Action {
    Ok("This is an FTP Watcher.\n")
  }

  import FTPWatchers.future

  def healthCheck = Action.async {
    if (future.isCompleted)
      future.map(_ => ServiceUnavailable("Watcher terminated unexpectedly"))
            .recover { case e => ServiceUnavailable("Watcher terminated with error") }
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
        Config.active.set(b)
        Logger.info("Mode set to " + Config.status)
        NoContent
      case None =>
        BadRequest
    }
  }

}

object FTPWatchers {

  import scalaz.concurrent.Task

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  def watcherTask(batchSize: Int): Task[Unit] =
    Config.ftpPaths.map { path =>
      val process = FTPWatcher(Config.ftpHost, Config.ftpUser, Config.ftpPassword, path).watchDir(batchSize)
      val sink = Sinks.httpPost(Config.imageLoaderUri + "?uploadedBy=" + path)
      process.to(sink)
    }.reduceLeft(_ merge _).run

  def waitForActive(sleep: Long): Task[Unit] =
    Task(Config.isActive).ifM(Task.now(()), Task(Thread.sleep(sleep)) >> waitForActive(sleep))

  /** When running, this starts the watcher process immediately if the
    * `active` atomic variable is set to `true`.
    *
    * Otherwise, it sleeps, waking periodically to check `active` again.
    *
    * Once `active` is `true`, the watcher process runs, checking at
    * intervals whether `active` is still `true`, and stopping if it becomes
    * `false`.
    */
  lazy val future: Future[Unit] = _future

  private val cancel: AtomicBoolean = new AtomicBoolean(false)

  def shutdown() {
    cancel.set(true)
  }

  private def _future: Future[Unit] =
    retryFuture("FTP watcher", 10000) {
      val task = waitForActive(sleep = 250) >> watcherTask(batchSize = 10)
      val promise = Promise[Unit]()
      task.runAsyncInterruptibly(_.fold(promise.failure, promise.success), cancel)
      promise.future.flatMap(_ => _future) // promise.future >> _future
    }

  def retryFuture[A](desc: String, wait: Long)(future: => Future[A]): Future[A] =
    future.recoverWith {
      case e =>
        Logger.error(s"""Task "$desc" threw exception: """, e)
        Logger.info(s"""Restarting "$desc" in $wait ms...""")
        Thread.sleep(wait)
        retryFuture(desc, wait)(future)
    }

}
