package controllers

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.data.JsonStore
import play.api.libs.concurrent.Execution.Implicits._
import model.{Node, Collection}

import play.api.mvc.Controller

import lib.Config


object CollectionsController extends Controller with ArgoHelpers {

  import Config.{configBucket, awsCredentials}

  val Authenticated = Authed.action
  val collectionsStore = new JsonStore(configBucket, awsCredentials)

  def getCollections = Authenticated.async { req =>
    collectionsStore.getData map { json =>
      val collectionList = json.asOpt[List[Collection]]

      collectionList map { list =>
        val tree = Node.buildTree[Collection]("root", list,
          (collection) => collection.path)
        respond(tree)
      } getOrElse respondError(BadRequest, "bad-json", "Bad bad json")

    }
  }

//  def addCollection = Authenticated.async(parse.json) { req =>
//    (req.body \ "data").asOpt[String].map { collectionName =>
//      collectionsStore.getData flatMap { list =>
//        val collections = (collectionName :: list).distinct
//        collectionsStore.putData(collections).map { list =>
//          respondCollection(list)
//        }
//      }
//    }.getOrElse(
//      Future.successful(respondError(BadRequest, "bad-collection-data", "You can't add that collection"))
//    )
//  }
//
//  def removeCollection(collection: String) = Authenticated.async { req =>
//    val collections = getCollectionsFromFile diff List(collection)
//    writeToCollectionsFile(collections)
//    Future.successful(respondCollection(collections))
//  }
//
//  def getCollectionsFromFile = {
//    scala.io.Source.fromFile(collectionsFilePath).getLines.toList
//  }
//
//  def writeToCollectionsFile(collections: List[String]) =
//    writeToFile(collectionsFilePath, collections.mkString("\n"))
//
//  import scala.language.reflectiveCalls
//  def using[A <: {def close(): Unit}, B](resource: A)(f: A => B): B =
//    try f(resource) finally resource.close()
//
//  def writeToFile(path: String, data: String): Unit =
//    using(new java.io.FileWriter(path))(_.write(data))
//
//  def appendToFile(path: String, data: String): Unit =
//    using(new java.io.PrintWriter(new java.io.FileWriter(path, true)))(_.println(data))

}
