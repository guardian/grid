package controllers

import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.Executors
import scala.concurrent.{Promise, ExecutionContext, Future}

import play.api.Logger
import play.api.mvc.{Action, Controller}
import lib.{Config, FTPWatcher}


object Application extends Controller {

  import play.api.libs.concurrent.Execution.Implicits._

  def index = Action {
    Ok("This is an FTP Watcher.\n")
  }

  import FTPWatcherTask.future

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

object FTPWatcherTask {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

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
      val task = new FTPWatcher(Config.ftpHost, Config.ftpUser, Config.ftpPassword).run
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
