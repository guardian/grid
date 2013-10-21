package controllers

import play.api.mvc.{Action, Controller}
import lib.FTPWatcher


object Application extends Controller {

  def index = Action {
    Ok("This is an FTP Watcher.\r\n")
  }

  def healthCheck = Action {
    //if (FTPWatcher.watcher.isCompleted) ServiceUnavailable
    //else Ok("OK")
    Ok("OK")
  }

}
