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
import com.gu.mediaservice.model.{ActionData, Collection}

import store.CollectionsStore

case class InvalidPrinciple(message: String) extends Throwable

object CollectionsController extends Controller with ArgoHelpers {

  import lib.Config.rootUri
  val Authenticated = ControllerHelper.Authenticated

  val addCollectionAction = Action("create", URI.create(s"$rootUri/collections"), "POST")

  def collectionUri(c: Collection) = URI.create(s"$rootUri/collections/${c.pathId}")

  def deleteCollectionAction(c: Collection) = Action("delete", collectionUri(c), "DELETE")

  def collectionNotFound(path: String) =
    respondError(NotFound, "collection-not-found", s"Could not find collection: $path")

  def invalidJson(json: JsValue) =
    respondError(BadRequest, "invalid-json", s"Could not parse json: ${json.toString}")

  def getCollections = Authenticated.async { req =>
    CollectionsStore.getAll map { collections =>
      val collectionEntities = collections.map { collection =>
        EmbeddedEntity(
          collectionUri(collection),
          Some(collection),
          actions = List(deleteCollectionAction(collection))
        )
      }

      val tree = Node.buildTree[EmbeddedEntity[Collection]]("root",
        collectionEntities,
        (entity) => entity.data.map(a => a.path).getOrElse(Nil))

      respond(tree, actions = List(addCollectionAction))
    }
  }

  def addCollectionFromJson = Authenticated.async(parse.json) { req =>
    (req.body \ "data").asOpt[List[String]].map { path =>
      addCollection(path, getUserFromReq(req))
    } getOrElse Future.successful(invalidJson(req.body))
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

  // We have to do this as Play's serialisation doesn't work all that well.
  // Especially around types with subtypes, so we have to be very explicit here.
  implicit def collectionEntityWrites: Writes[Node[EmbeddedEntity[Collection]]] = (
    (__ \ "name").write[String] ~
    (__ \ "children").lazyWrite(Writes.seq[Node[EmbeddedEntity[Collection]]](collectionEntityWrites)) ~
    (__ \ "content").writeNullable[EmbeddedEntity[Collection]]
  )(node => (node.name, node.children, node.content))
}



