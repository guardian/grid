package controllers

import java.net.URI

import com.gu.mediaservice.lib.argo.model.{Link, EmbeddedEntity, Action}
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

case class AppIndex(name: String, description: String, config: Map[String, String] = Map(),
                    links: List[Link] = Nil, actions: List[Action] = Nil)
object AppIndex {
  implicit def jsonWrites: Writes[AppIndex] = Json.writes[AppIndex]
}

object CollectionsController extends Controller with ArgoHelpers {

  import lib.Config.rootUri
  val Authenticated = ControllerHelper.Authenticated

  def uri(u: String) = URI.create(u)

  val collectionsUri = uri(s"$rootUri/collections")
  val addCollectionAction = Action("create", collectionsUri, "POST")
  val collectionsLink = Link("list", collectionsUri.toString)
  val links = List(collectionsLink)
  val actions = List(addCollectionAction)
  val appIndex = AppIndex("media-collections", "The one stop shop for collections", links = links, actions = actions)

  def index = Authenticated { req =>
    respond(appIndex)
  }

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
      val collection = Collection(path, ActionData(getUserFromReq(req), DateTime.now))
      CollectionsStore.add(collection).map { collection =>
        respond(Node(collection.path.last, Nil, Some(collection)))
      }
    } getOrElse Future.successful(invalidJson(req.body))
  }

  def removeCollection(collectionPath: String) = Authenticated.async { req =>
    CollectionsStore.remove(collectionPath) map { collectionOpt =>
      collectionOpt.map(_ => Accepted).getOrElse(NotFound)
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



