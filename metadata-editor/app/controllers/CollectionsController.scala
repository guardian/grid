package controllers

import java.net.URI

import com.gu.mediaservice.lib.argo.model.{EmbeddedEntity, Action}
import lib.ControllerHelper
import model.Node
import org.joda.time.DateTime

import play.api.libs.functional.syntax._
import play.api.libs.json._
import play.api.mvc.Controller
import play.api.mvc.Security.AuthenticatedRequest

import scala.concurrent.ExecutionContext.Implicits.global
import scala.concurrent.Future

import com.gu.mediaservice.lib.argo.ArgoHelpers
import com.gu.mediaservice.lib.auth.{AuthenticatedService, PandaUser, Principal}
import com.gu.mediaservice.lib.collections.CollectionsManager
import com.gu.mediaservice.model.{ActionData, Collection}

import store.CollectionsStore

case class InvalidPrinciple(message: String) extends Throwable

object CollectionsController extends Controller with ArgoHelpers {

  val Authenticated = ControllerHelper.Authenticated
  import lib.Config.rootUri


  def collectionNotFound(path: String) =
    respondError(NotFound, "collection-not-found", s"Could not find collection: $path")

  def invalidJson(json: JsValue) =
    respondError(BadRequest, "invalid-json", s"Could not parse json: ${json.toString}")

  def getCollections = Authenticated.async { req =>
    CollectionsStore.getAll map { collections =>
      val collectionEntities = collections.map { collection =>
        val uri = URI.create(s"$rootUri/collections/${collection.pathId}")
        EmbeddedEntity(uri, Some(collection), actions = List(Action("delete", uri, "DELETE")))
      }

      val tree = Node.buildTree[EmbeddedEntity[Collection]]("root",
        collectionEntities,
        (entity) => entity.data.map(a => a.path).getOrElse(Nil))

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

  def removeCollection(collectionPath: String) = Authenticated.async { req =>
    CollectionsStore.remove(collectionPath) map { collectionOpt =>
      collectionOpt.map(respond(_)).getOrElse(collectionNotFound(collectionPath))
    }
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
    case user => throw new InvalidPrinciple(s"Invalid user ${user.name}")
  }

  implicit def collectionEntityWrites: Writes[Node[EmbeddedEntity[Collection]]] = (
    (__ \ "name").write[String] ~
    (__ \ "children").lazyWrite(Writes.seq[Node[EmbeddedEntity[Collection]]](collectionEntityWrites)) ~
    (__ \ "content").writeNullable[EmbeddedEntity[Collection]]
  )(node => (node.name, node.children, node.content))
}



