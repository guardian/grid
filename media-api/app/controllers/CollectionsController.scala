package controllers


import org.joda.time.DateTime
import play.api.libs.concurrent.Execution.Implicits._
import play.api.libs.json.Json
import play.api.mvc.{AnyContent, Controller}
import play.api.mvc.Security.AuthenticatedRequest
import scala.concurrent.Future

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.{Principal, AuthenticatedService, PandaUser}
import com.gu.mediaservice.lib.data.JsonStore

import model.{Paradata, Node, Collection}
import lib.Config
import lib.collections.CollectionsManager



object CollectionsController extends Controller with ArgoHelpers {

  import Config.{configBucket, awsCredentials}

  val Authenticated = Authed.action
  val collectionsStore = new JsonStore(configBucket, awsCredentials, "collections.json")

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

  def addCollectionFromJson = Authenticated.async(parse.json) { req =>
    (req.body \ "data").asOpt[List[String]].map { path =>
      addCollection(path, getUserFromReq(req)) map { collections =>
        respond(collections)
      }
    } getOrElse Future.successful(respondError(BadRequest, "bad-json", "Bad bad json"))
  }

  def addCollectionFromString(collection: String) = Authenticated.async { req =>
    addCollection(CollectionsManager.stringToPath(collection), getUserFromReq(req)) map { collections =>
      respond(collections)
    } recover {
      case _ => respondError(BadRequest, "bad-json", "Bad bad json")
    }
  }

  private def addCollection(path: List[String], who: String) = {
    collectionsStore.getData map { json =>
      val collectionList = json.asOpt[List[Collection]]
      val newCollection = Collection(path, Paradata(who, DateTime.now))
      val newCollectionList = collectionList.map(cols => newCollection :: cols.filter(col => col.path != path))

      newCollectionList.map { collections =>
        collectionsStore.putData(Json.toJson(collections))
        collections
      }.getOrElse(Nil)
    }
  }

  private def getUserFromReq(req: AuthenticatedRequest[_, Principal]) = req.user match {
    case PandaUser(email, _, _, _) => email
    case AuthenticatedService(name) => name
    // We should never get here
    case _ => "anonymous"
  }

  def removeCollection(collection: String) = Authenticated.async { req =>
    collectionsStore.getData map { json =>
      val path = CollectionsManager.stringToPath(collection)
      val collectionList = json.asOpt[List[Collection]].map(_.filter(col => col.path != path))

      collectionList.map { collections =>
        collectionsStore.putData(Json.toJson(collections))
        Accepted
      } getOrElse respondError(BadRequest, "bad-json", "Bad bad json")
    }
  }
}
