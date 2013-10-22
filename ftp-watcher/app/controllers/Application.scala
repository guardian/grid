package controllers

import java.util.concurrent.Executors
import scala.concurrent.{ExecutionContext, Future}
import play.api.mvc.{Action, Controller}
import lib.{Sinks, File, Config, FTPWatcher}


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
    ExecutionContext.fromExecutor(Executors.newFixedThreadPool(Config.ftpPaths.size))

  val watchers =
    for (path <- Config.ftpPaths)
    yield FTPWatcher(Config.ftpHost, Config.ftpUser, Config.ftpPassword, path)

  val stream = watchers.map(_.watchDir)
      .foldLeft[Process[Task, File]](Process.halt)((p1, p2) => p1.wye(p2)(wye.merge))

  lazy val future: Future[Unit] = {
    val sink = Sinks.httpPost(Config.imageLoaderUri)
    Future { (stream to sink).run.run }
  }

}
