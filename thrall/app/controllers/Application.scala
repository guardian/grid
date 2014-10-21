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

  def copyAndRemoveArchiveToArchived = Action.async {
    runScript("""if (ctx._source.archive != null) {
                     ctx._source.archived = ctx._source.archive;
                     ctx._source.remove("archive");
              }""")
  }

  def copyToSourcePropertyScript = Action.async {
    runScript(s"""if (ctx._source.source == null) {
                      ctx._source.source = [:];
                      ctx._source.source.file       = ctx._source.file;
                      ctx._source.source.mimeType   = 'image/jpeg';
                      ctx._source.source.dimensions = ctx._source.dimensions;
               }""")
  }

  def removeFileDimensionsPropertiesScript = Action.async {
    runScript(s"""if (!ctx._source.file)       { ctx._source.remove('file'); }
                  if (!ctx._source.dimensions) { ctx._source.remove('dimensions'); }""")
  }

}
