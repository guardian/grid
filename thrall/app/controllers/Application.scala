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

  def runScript(script: String) = ElasticSearch.updateByQuery(script).   map { _ =>
    Ok("Script run")
  } recover {
    case e: Throwable => throw e
    case e => Ok(s"Script failed: ${e.getMessage}")
  }

  def addArchivePropertyScript = Action.async {
    runScript("if (!ctx._source.archived) { ctx._source.archived = false }")
  }

}
