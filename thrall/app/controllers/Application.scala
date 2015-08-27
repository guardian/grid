package controllers

import java.util.concurrent.Executors

import lib.ElasticSearch
import play.api.mvc.{Action, Controller}

import scala.concurrent.ExecutionContext
import scala.util.{Failure, Success}


object Application extends Controller {

  private implicit val ctx: ExecutionContext =
    ExecutionContext.fromExecutor(Executors.newCachedThreadPool)

  def index = Action {
    Ok("This is a thrall.")
  }

}
