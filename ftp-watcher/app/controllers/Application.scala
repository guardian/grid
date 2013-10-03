package controllers

import play.api.mvc.{Action, Controller}


object Application extends Controller {

  def index = Action {
    Ok("This is an FTP Watcher.\r\n")
  }

  def healthCheck = Action {
    Ok("OK")
  }

}
