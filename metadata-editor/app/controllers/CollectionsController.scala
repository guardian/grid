package controllers

import lib.ControllerHelper
import model.Node
import org.joda.time.DateTime

import play.api.libs.json.JsValue
import play.api.mvc.Controller
import play.api.mvc.Security.AuthenticatedRequest

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.{AuthenticatedService, PandaUser, Principal}
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.{ActionData, Collection}

import store.CollectionsStore


object CollectionsController extends Controller with ArgoHelpers {

  val Authenticated = ControllerHelper.Authenticated


  def collectionNotFound(path: String) =
    respondError(NotFound, "collection-not-found", s"Could not find collection: $path")

  def invalidJson(json: JsValue) =
    respondError(BadRequest, "invalid-json", s"Could not parse json: ${json.toString}")

  def getCollections = Authenticated.async { req =>
    CollectionsStore.getAll map { collections =>
      val tree = Node.buildTree[Collection]("root", collections, (collection) => collection.path)
      respond(tree)
    }
  }

  def addCollectionFromJson = Authenticated.async(parse.json) { req =>
    (req.body \ "data").asOpt[List[String]].map { path =>
      addCollection(path, getUserFromReq(req))
    } getOrElse Future.successful(invalidJson(req.body))
  }

  def addCollectionFromString(collection: String) = Authenticated.async { req =>
    addCollection(CollectionsManager.stringToPath(collection), getUserFromReq(req))
  }

  private def addCollection(path: List[String], who: String) = {
    val collection = Collection(path, ActionData(who, DateTime.now))
    CollectionsStore.add(collection).map { collection =>
      respond(collection)
    }
  }

  private def getUserFromReq(req: AuthenticatedRequest[_, Principal]) = req.user match {
    case PandaUser(email, _, _, _) => email
    case AuthenticatedService(name) => name
    // We should never get here
    case _ => "anonymous"
  }

  def removeCollection(collectionPath: String) = Authenticated.async { req =>
    CollectionsStore.remove(collectionPath) map { collectionOpt =>
      collectionOpt.map(respond(_)).getOrElse(collectionNotFound(collectionPath))
    }
  }
}
