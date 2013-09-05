package controllers

import play.api.mvc._
import play.api.libs.concurrent.Execution.Implicits._
import play.api.Logger

import lib.imaging.ImageMetadata
import lib.elasticsearch.ElasticSearch
import lib.storage.StorageBackend
import lib.syntax._
import scala.concurrent.Future


object Application extends MediaApiController {
  val storage = NullStorage
}

abstract class MediaApiController extends Controller {

  def storage: StorageBackend

  ElasticSearch.ensureIndexExists()

  def index = Action {
    Ok("This is the Media API.\r\n")
  }

  def pokeElasticsearch = Action {
    Async {
      for {
        searchResult <- ElasticSearch.prepareImagesSearch.execute.asScala
      } yield Ok(searchResult.getHits.getTotalHits.toString)
    }
  }

  def deleteIndex = Action {
    ElasticSearch.deleteIndex()
    ElasticSearch.ensureIndexExists()
    Ok("Deleted and recreated index.\r\n")
  }

  def getImage(id: String) = Action {
    Async {
      ElasticSearch.getImageById(id) map {
        case Some(source) => Ok(source)
        case None         => NotFound
      }
    }
  }

  def putImage(id: String) = Action(parse.temporaryFile) { request =>
    val tempFile = request.body

    val response = for {
      meta <- Future { ImageMetadata.iptc(tempFile.file) }
      uri  <- storage.store(tempFile.file)
      image = model.Image(id, uri, meta)
      _    <- ElasticSearch.indexImage(image)
    } yield NoContent

    response.onComplete(_ => tempFile.clean())
    Async(response)
  }

}


import java.io.File
import scala.concurrent.Future

object NullStorage extends StorageBackend {
  def store(file: File) = Future.successful(new File("/dev/null").toURI)
}
