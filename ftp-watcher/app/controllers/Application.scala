package controllers

import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import play.api.mvc.{Action, Controller}
import lib.{Sinks, File, Config, FTPWatcher}
import FTPWatcher._


object Application extends Controller {

  def index = Action {
    Ok("This is an FTP Watcher.\r\n")
  }

  def healthCheck = Action {
    if (FTPWatchers.future.isCompleted) ServiceUnavailable
    else Ok("OK")
  }

}

object FTPWatchers {

  import scalaz.stream.{Process, wye}
  import scalaz.concurrent.Task

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newSingleThreadExecutor)

  lazy val watchers =
    for (path <- Config.ftpPaths)
    yield watchDir(Config.ftpHost, Config.ftpUser, Config.ftpPassword, path)

  lazy val mergedWatcher =
    watchers.foldLeft[Process[Task, File]](Process.halt)((p1, p2) => p1.wye(p2)(wye.merge))

  lazy val future: Future[Unit] =
    Future { mergedWatcher.to(Sinks.httpPost(Config.imageLoaderUri)).run.run }

}
